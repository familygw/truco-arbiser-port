#!/usr/bin/env python3
"""Extract the data files used by Truco Arbiser into browser-friendly assets.

The original package stores four QuickBasic GET buffers in MXYTRUC@, a CGA
BSAVE screen in MWYTRUC@.BAS, fixed-width dialogue records in MVYTRUC@, and
bit-packed PC-speaker samples in the T*.VOZ files.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import struct
import zlib
from pathlib import Path
from reverse_engineer_exe import MzHeader, unpack_exepack, quickbasic_strings


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "public" / "original"
PALETTE = [(184, 83, 0), (0, 245, 224), (246, 0, 208), (218, 218, 218)]


def png(path: Path, width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> None:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for pixel in pixels[y * width : (y + 1) * width]:
            rows.extend(pixel)
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)


def unpack_cga(data: bytes, width: int, height: int, interleaved: bool = False) -> list[tuple[int, int, int, int]]:
    stride = ((width * 2 + 15) // 16) * 2
    result: list[tuple[int, int, int, int]] = []
    for y in range(height):
        row_offset = ((y // 2) * 80 + (0x2000 if y & 1 else 0)) if interleaved else y * stride
        row = data[row_offset : row_offset + stride].ljust(stride, b"\0")
        for x in range(width):
            byte = row[x // 4]
            value = (byte >> (6 - (x % 4) * 2)) & 3
            r, g, b = PALETTE[value]
            result.append((r, g, b, 255))
    return result


def extract_cards() -> None:
    numbers = [int(n) for n in re.findall(r"-?\d+", (ROOT / "MXYTRUC@").read_text("latin1"))]
    starts = [i for i in range(len(numbers) - 1) if numbers[i : i + 2] == [92, 60]]
    # The buffers follow the game's suit order, not the Truco strength order.
    names = ["oro", "copa", "espada", "basto"]
    for name, start in zip(names, starts):
        words = numbers[start + 2 : start + 362]
        raw = b"".join(struct.pack("<h", word) for word in words)
        png(OUT / f"carta-{name}.png", 46, 60, unpack_cga(raw, 46, 60))


def extract_screen() -> None:
    raw = (ROOT / "MWYTRUC@.BAS").read_bytes()
    if raw[:1] != b"\xfd":
        return
    length = struct.unpack_from("<H", raw, 5)[0]
    video = raw[7 : 7 + length]
    png(OUT / "pantalla-bsave.png", 320, 200, unpack_cga(video, 320, 200, interleaved=True))


def extract_dialogues() -> None:
    raw = (ROOT / "MVYTRUC@").read_bytes()
    # The companion program wrote every phrase followed by a wide blank field.
    # Splitting that padding recovers 156 entries: one for each Tnnn.VOZ file.
    phrases = [part.strip().replace("#", "\n") for part in re.split(r" {20,}", raw.decode("cp437")) if part.strip()]
    records = [
        {"record": index, "voice": f"t{index:03d}.voz", "text": text}
        for index, text in enumerate(phrases, 1)
    ]
    (OUT / "dialogos.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def copy_voices() -> None:
    voice_dir = OUT / "voices"
    voice_dir.mkdir(parents=True, exist_ok=True)
    for path in sorted(ROOT.glob("T[0-9][0-9][0-9].VOZ")):
        shutil.copyfile(path, voice_dir / path.name.lower())



# Names describe the port's cues; offsets refer to original static descriptors.
MUSIC_DESCRIPTORS = {
    "intro": 0x2440,
    "envido": 0x209C,
    "deal": 0x2030,
    "real": 0x20CE,
    "flor": 0x20EA,
    "truco": 0x20FE,
    "retruco": 0x2112,
    "vale4": 0x2126,
    "win": 0x21A2,
    "lose": 0x21CE,
    "mazo": 0x21F0,
    "quiero": 0x2218,
    "noQuiero": 0x223E,
    "fanfare": 0x2270,
    "handWin": 0x2286,
    "handLose": 0x229C,
    "taunt": 0x22B2,
    "idle": 0x22D8,
    "march": 0x22FA,
    "short": 0x234E,
    "arpeggio": 0x2C3E,
    "rise": 0x2C50,
    "fall": 0x2C6C,
    "scale": 0x2C8A,
    "trill": 0x2C9E,
    "bells": 0x2F7A,
    "cascade": 0x2F9C,
    "afano": 0x306E,
    "llora": 0x30E0,
    "envidoReply": 0x36CA,
    "realReply": 0x36E0,
    "florReply": 0x3704,
    "sting": 0x3730,
    "long": 0x3752,
    "cde": 0x378E,
    "finale": 0x37E6,
    "theme": 0x46CC,
    "good": 0x2F5A,
    "chord": 0x2DCE,
    "cadence": 0x2260,
    "openingTag": 0x2374,
    "victoryPattern": 0x2D90,
    "responseRun": 0x2F32,
    "responseAccent": 0x2F48,
    "doubleSting": 0x3742,
    "melancholy": 0x37C4,
}

def extract_music() -> int:
    packed = (ROOT / "TRUCO.EXE").read_bytes()
    image, metadata, _ = unpack_exepack(packed, MzHeader.parse(packed))
    segment, records, lookup = quickbasic_strings(image, metadata)
    by_offset = {r["descriptorOffset"]: r for r in records}
    tracks = {}
    for name, descriptor in MUSIC_DESCRIPTORS.items():
        record = by_offset[descriptor]
        score = lookup[descriptor]
        if not re.fullmatch(r"[a-golmnpst0-9#.+<> -]+", score):
            raise ValueError(f"Partitura inesperada: {name}")
        tracks[name] = {"score": score, "descriptorOffset": descriptor,
                        "dataOffset": record["dataOffset"], "length": record["length"],
                        "references": record["movAxPushReferences"]}
    result = {"source": "TRUCO.EXE", "sourceSha256": hashlib.sha256(packed).hexdigest(),
              "imageSha256": hashlib.sha256(image).hexdigest(), "dataSegment": segment,
              "reset": lookup[0x4A92], "tracks": tracks}
    target = Path(__file__).resolve().parents[1] / "src" / "original-music.json"
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Música: {len(tracks)} partituras PLAY extraídas de TRUCO.EXE.")
    return len(tracks)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    extract_cards()
    extract_screen()
    extract_dialogues()
    copy_voices()
    music_count = extract_music()
    metadata = {
        "source": "Truco Arbiser para DOS (1982-1986)",
        "dialogueRecords": 156,
        "voiceSamples": 156,
        "musicScores": music_count,
        "musicSource": "src/original-music.json (extraído de TRUCO.EXE)",
        "voiceFormat": "Flujo de audio de 1 bit, empaquetado MSB-first; se decodifica en WebAudio.",
        "assetHashes": {
            str(path.relative_to(OUT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(OUT.rglob("*")) if path.is_file() and path.name != "metadata.json"
        },
        "insultStems": ["put", "mierd", "pij", "conch", "bolud", "pelotu", "caraj", "chot", "fuck", "garch"],
    }
    (OUT / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
