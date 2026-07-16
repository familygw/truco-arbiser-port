#!/usr/bin/env python3
"""Unpack and inspect the EXEPACK-compressed Truco Arbiser executable.

The script intentionally implements the small backwards EXEPACK decoder found
inside this specific executable instead of executing unknown DOS code.  It
rebuilds a conventional MZ file, restores its relocation table and emits a few
analysis-friendly reports.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import struct
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "TRUCO.EXE"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "reverse-engineering"
ANALYSIS_LOAD_SEGMENT = 0x1000


@dataclass(frozen=True)
class MzHeader:
    signature: int
    bytes_last_page: int
    pages: int
    relocations: int
    header_paragraphs: int
    min_extra_paragraphs: int
    max_extra_paragraphs: int
    initial_ss: int
    initial_sp: int
    checksum: int
    initial_ip: int
    initial_cs: int
    relocation_table_offset: int
    overlay: int

    @classmethod
    def parse(cls, data: bytes) -> "MzHeader":
        if len(data) < 28:
            raise ValueError("El archivo es demasiado corto para contener un encabezado MZ")
        header = cls(*struct.unpack_from("<14H", data))
        if header.signature != 0x5A4D:
            raise ValueError("El archivo no tiene firma MZ")
        return header

    @property
    def byte_size(self) -> int:
        return self.header_paragraphs * 16

    @property
    def declared_file_size(self) -> int:
        tail = self.bytes_last_page or 512
        return (self.pages - 1) * 512 + tail


class SegmentedMemory:
    def __init__(self, size: int = 2 * 1024 * 1024) -> None:
        self.data = bytearray(size)

    @staticmethod
    def address(segment: int, offset: int) -> int:
        return (segment & 0xFFFF) * 16 + (offset & 0xFFFF)

    def read_byte(self, segment: int, offset: int) -> int:
        return self.data[self.address(segment, offset)]

    def read_word(self, segment: int, offset: int) -> int:
        low = self.read_byte(segment, offset)
        high = self.read_byte(segment, (offset + 1) & 0xFFFF)
        return low | high << 8

    def write_byte(self, segment: int, offset: int, value: int) -> None:
        self.data[self.address(segment, offset)] = value & 0xFF

    def write_word(self, segment: int, offset: int, value: int) -> None:
        self.write_byte(segment, offset, value)
        self.write_byte(segment, (offset + 1) & 0xFFFF, value >> 8)


def scan_ff_marker(memory: SegmentedMemory, segment: int) -> int:
    """Reproduce the stub's backwards REPE SCASB marker scan."""
    offset = 0x000F
    for _ in range(16):
        value = memory.read_byte(segment, offset)
        offset = (offset - 1) & 0xFFFF
        if value != 0xFF:
            break
    return (offset + 1) & 0xFFFF


def normalize_backwards_pointer(segment: int, offset: int) -> tuple[int, int]:
    """Reproduce EXEPACK's segment normalization for backwards copies."""
    paragraphs = ((~offset) & 0xFFFF) >> 4
    if paragraphs:
        segment = (segment - paragraphs) & 0xFFFF
        offset |= 0xFFF0
    return segment, offset & 0xFFFF


def unpack_exepack(data: bytes, header: MzHeader) -> tuple[bytes, dict, list[tuple[int, int]]]:
    if b"Packed file is corrupt" not in data:
        raise ValueError("No se encontró la firma textual del stub EXEPACK esperado")

    load_segment = ANALYSIS_LOAD_SEGMENT
    stub_segment = load_segment + header.initial_cs
    packed_image = data[header.byte_size : header.declared_file_size]
    memory = SegmentedMemory()
    load_address = load_segment * 16
    memory.data[load_address : load_address + len(packed_image)] = packed_image

    # The entry stub stores the DOS load segment at CS:0004, then copies the
    # decoder and its packed relocation table into a high scratch segment.
    memory.write_word(stub_segment, 0x0004, load_segment)
    decoder_segment = load_segment + memory.read_word(stub_segment, 0x000C)
    copy_length = memory.read_word(stub_segment, 0x0006)
    source = destination = copy_length - 1
    for _ in range(copy_length):
        memory.write_byte(decoder_segment, destination, memory.read_byte(stub_segment, source))
        source = (source - 1) & 0xFFFF
        destination = (destination - 1) & 0xFFFF

    source_segment = stub_segment - 1
    source = scan_ff_marker(memory, source_segment)
    destination_segment = decoder_segment - 1
    destination = scan_ff_marker(memory, destination_segment)
    source_segment, source = normalize_backwards_pointer(source_segment, source)
    destination_segment, destination = normalize_backwards_pointer(destination_segment, destination)

    record_count = 0
    repeated_bytes = 0
    literal_bytes = 0
    while True:
        opcode = memory.read_byte(source_segment, source)
        source = (source - 1) & 0xFFFF
        source = (source - 1) & 0xFFFF
        count = memory.read_word(source_segment, source)
        source = (source - 1) & 0xFFFF

        if opcode & 0xFE == 0xB0:
            value = memory.read_byte(source_segment, source)
            source = (source - 1) & 0xFFFF
            for _ in range(count):
                memory.write_byte(destination_segment, destination, value)
                destination = (destination - 1) & 0xFFFF
            repeated_bytes += count
        elif opcode & 0xFE == 0xB2:
            for _ in range(count):
                memory.write_byte(
                    destination_segment,
                    destination,
                    memory.read_byte(source_segment, source),
                )
                source = (source - 1) & 0xFFFF
                destination = (destination - 1) & 0xFFFF
            literal_bytes += count
        else:
            raise ValueError(f"Opcode EXEPACK desconocido: 0x{opcode:02x}")

        record_count += 1
        if opcode & 1:
            break
        source_segment, source = normalize_backwards_pointer(source_segment, source)
        destination_segment, destination = normalize_backwards_pointer(destination_segment, destination)

    original_ip = memory.read_word(decoder_segment, 0x0000)
    original_cs = memory.read_word(decoder_segment, 0x0002)
    original_sp = memory.read_word(decoder_segment, 0x0008)
    original_ss = memory.read_word(decoder_segment, 0x000A)
    image_size = original_ss * 16
    image = bytes(memory.data[load_address : load_address + image_size])

    relocations: list[tuple[int, int]] = []
    table_offset = 0x0125
    for relocation_segment in range(0, 0x10000, 0x1000):
        count = memory.read_word(decoder_segment, table_offset)
        table_offset += 2
        for _ in range(count):
            relocation_offset = memory.read_word(decoder_segment, table_offset)
            table_offset += 2
            relocations.append((relocation_offset, relocation_segment))

    packed_paragraphs = (len(packed_image) + 15) // 16
    unpacked_paragraphs = len(image) // 16
    original_min_extra = max(
        0,
        header.min_extra_paragraphs - (unpacked_paragraphs - packed_paragraphs),
    )
    metadata = {
        "format": "MZ / Microsoft EXEPACK",
        "packedHeader": asdict(header),
        "packedImageBytes": len(packed_image),
        "unpackedImageBytes": len(image),
        "originalEntryPoint": {"cs": original_cs, "ip": original_ip},
        "originalStack": {"ss": original_ss, "sp": original_sp},
        "originalMinExtraParagraphsInferred": original_min_extra,
        "relocationCount": len(relocations),
        "exepackRecords": record_count,
        "exepackRepeatedBytes": repeated_bytes,
        "exepackLiteralBytes": literal_bytes,
    }
    return image, metadata, relocations


def rebuild_mz(image: bytes, metadata: dict, relocations: list[tuple[int, int]]) -> bytes:
    relocation_table_offset = 0x001E
    relocation_bytes = b"".join(struct.pack("<HH", offset, segment) for offset, segment in relocations)
    header_size = ((relocation_table_offset + len(relocation_bytes) + 15) // 16) * 16
    file_size = header_size + len(image)
    pages, remainder = divmod(file_size, 512)
    if remainder:
        pages += 1

    packed = metadata["packedHeader"]
    entry = metadata["originalEntryPoint"]
    stack = metadata["originalStack"]
    header = struct.pack(
        "<14H",
        0x5A4D,
        remainder,
        pages,
        len(relocations),
        header_size // 16,
        metadata["originalMinExtraParagraphsInferred"],
        packed["max_extra_paragraphs"],
        stack["ss"],
        stack["sp"],
        0,
        entry["ip"],
        entry["cs"],
        relocation_table_offset,
        0,
    )
    mz = bytearray(header_size)
    mz[: len(header)] = header
    mz[relocation_table_offset : relocation_table_offset + len(relocation_bytes)] = relocation_bytes
    return bytes(mz) + image


def ascii_strings(image: bytes, minimum: int = 4) -> list[dict]:
    strings: list[dict] = []
    start: int | None = None
    for index, value in enumerate(image + b"\0"):
        if 0x20 <= value <= 0x7E:
            if start is None:
                start = index
            continue
        if start is not None and index - start >= minimum:
            linear = start
            strings.append(
                {
                    "linearOffset": linear,
                    "address": f"{linear // 16:04X}:{linear % 16:04X}",
                    "length": index - start,
                    "text": image[start:index].decode("ascii"),
                }
            )
        start = None
    return strings


def quickbasic_strings(image: bytes, metadata: dict) -> tuple[int, list[dict], dict[int, str]]:
    """Recover QuickBASIC's static near-string descriptors.

    In this binary each descriptor is ``length:u16, dataOffset:u16`` and the
    bytes follow the descriptor.  The initial runtime instruction loads the
    data segment paragraph into DI, giving us an independent base address.
    """
    entry = metadata["originalEntryPoint"]
    entry_linear = entry["cs"] * 16 + entry["ip"]
    if image[entry_linear] != 0xBF:  # MOV DI, imm16 in this QuickBASIC runtime stub
        raise ValueError("No se pudo derivar el segmento de datos de QuickBASIC")
    data_segment = struct.unpack_from("<H", image, entry_linear + 1)[0]
    data_base = data_segment * 16
    records: list[dict] = []
    lookup: dict[int, str] = {}

    for descriptor in range(0, len(image) - data_base - 4):
        length, data_offset = struct.unpack_from("<HH", image, data_base + descriptor)
        if data_offset != descriptor + 4 or not 1 <= length <= 4096:
            continue
        end = data_base + data_offset + length
        if end > len(image):
            continue
        raw = image[data_base + data_offset : end]
        if not all(value in (9, 10, 13) or 0x20 <= value <= 0x7E for value in raw):
            continue
        text = raw.decode("ascii")
        reference_pattern = b"\xB8" + struct.pack("<H", descriptor) + b"\x50"
        references: list[int] = []
        cursor = 0
        while True:
            cursor = image.find(reference_pattern, cursor, data_base)
            if cursor < 0:
                break
            references.append(cursor)
            cursor += 1
        records.append(
            {
                "descriptorOffset": descriptor,
                "dataOffset": data_offset,
                "length": length,
                "text": text,
                "movAxPushReferences": references,
            }
        )
        lookup[descriptor] = text
    return data_segment, records, lookup


def annotated_disassembly(
    image: bytes,
    start: int,
    end: int,
    string_lookup: dict[int, str],
    title: str,
) -> str:
    try:
        from capstone import CS_ARCH_X86, CS_MODE_16, CS_OP_IMM, CS_OP_REG, Cs
    except ImportError:
        return "Capstone no está instalado. Ejecutar: pip install -r scripts/requirements-re.txt\n"

    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    decoder.detail = True
    lines = [f"; {title}", f"; Rango lineal recuperado: {start:05X}-{end - 1:05X}"]
    for instruction in decoder.disasm(image[start:end], start):
        comment = ""
        operands = instruction.operands
        if (
            instruction.mnemonic == "mov"
            and len(operands) == 2
            and operands[0].type == CS_OP_REG
            and operands[1].type == CS_OP_IMM
        ):
            immediate = operands[1].imm & 0xFFFF
            if immediate in string_lookup:
                comment = f" ; QB STRING {string_lookup[immediate]!r}"
        lines.append(
            f"{instruction.address:05X}  "
            f"{instruction.bytes.hex(' '):<24}  "
            f"{instruction.mnemonic:<8} {instruction.op_str}{comment}".rstrip()
        )
    return "\n".join(lines) + "\n"


def recovered_logic() -> dict:
    """Facts manually verified against the annotated instruction ranges."""
    return {
        "evidence": {
            "commandParserLinearRange": [0x8957, 0x8DCC],
            "fallbackAndLanguageLinearRange": [0x8DCC, 0x92A8],
            "inputStringVariable": "DS:1F34",
            "commandCodeVariable": "DS:1C98",
            "containsFunction": "0D41:00F8",
            "stringAssignmentFunction": "0D41:0185",
        },
        "commandCodes": [
            {"code": -1, "meaning": "sin reconocer"},
            {"code": 0, "meaning": "aceptación", "tokens": ["de acuerdo", "esta bien", "olor", "buen", "ok"]},
            {"code": 1, "meaning": "envido", "tokens": ["envido"]},
            {"code": 2, "meaning": "real envido", "tokens": ["real envido"]},
            {"code": 3, "meaning": "dos reales envido", "tokens": ["dos reales envido"]},
            {"code": 4, "meaning": "falta envido", "tokens": ["falta envido"]},
            {"code": 5, "meaning": "flor", "tokens": ["flor"]},
            {"code": 6, "meaning": "con flor + aceptación dinámica", "tokens": ["con flor "]},
            {"code": 7, "meaning": "contraflor", "tokens": ["contraflor"]},
            {"code": 8, "meaning": "con flor me achico", "tokens": ["con flor me achico"]},
            {"code": 9, "meaning": "carta 1", "tokens": ["carta 1"]},
            {"code": 10, "meaning": "carta 2", "tokens": ["carta 2"]},
            {"code": 11, "meaning": "carta 3", "tokens": ["carta 3"]},
            {"code": 12, "meaning": "truco + sufijo 1", "tokens": ["truco", " 1"]},
            {"code": 13, "meaning": "truco + sufijo 2", "tokens": ["truco", " 2"]},
            {"code": 14, "meaning": "truco + sufijo 3", "tokens": ["truco", " 3"]},
            {"code": 15, "meaning": "truco", "tokens": ["truco"]},
            {"code": 16, "meaning": "quiero retruco + sufijo 1", "tokens": ["quiero retruco", " 1"]},
            {"code": 17, "meaning": "quiero retruco + sufijo 2", "tokens": ["quiero retruco", " 2"]},
            {"code": 18, "meaning": "quiero retruco + sufijo 3", "tokens": ["quiero retruco", " 3"]},
            {"code": 19, "meaning": "aceptación dinámica + retruco", "tokens": [" retruco"]},
            {"code": 20, "meaning": "quiero vale 4 + sufijo 1", "tokens": ["quiero vale 4", " 1"]},
            {"code": 21, "meaning": "quiero vale 4 + sufijo 2", "tokens": ["quiero vale 4", " 2"]},
            {"code": 22, "meaning": "quiero vale 4 + sufijo 3", "tokens": ["quiero vale 4", " 3"]},
            {"code": 23, "meaning": "aceptación dinámica + vale cuatro", "tokens": [" vale 4", " vale cuatro"]},
            {"code": 24, "meaning": "aceptación dinámica exacta", "tokens": ["DS:1C8A"]},
            {"code": 25, "meaning": "rechazo dinámico exacto", "tokens": ["DS:1C8E"]},
            {"code": 26, "meaning": "irse al mazo", "tokens": ["me voy", "mazo", "baraja", "chau", "huyo", "rajo"]},
        ],
        "exitTokens": ["salir", "sistema", "system", "aborto", "abortar"],
        "languageResponses": [
            {
                "category": "insulto",
                "linearRange": [0x902C, 0x9138],
                "roots": ["put", "mierd", "pij", "conch", "bolud", "pelotu", "caraj", "chot", "fuck", "garch"],
                "responsePool": "Shh ... @$?%!~@^Eso no se dice !Mal educado !!  Boca sucia !!   Quien te educo ?Que lexico[s] !!Lexico'e merda !",
                "selection": "bloque pseudoaleatorio de 16 caracteres",
            },
            {
                "category": "truque",
                "tokens": ["truque"],
                "responsePool": "Digue bien !!No joroibe !!Joigue bien !Tomate buque!Anda batuque!",
            },
            {
                "category": "diminutivos",
                "tokens": ["envidito", "quierito", "truquito"],
                "responsePool": "[No sea ]tontito!",
            },
            {
                "category": "sexual",
                "tokens": ["coge", "cogi", "coj", "sexo", "sexu"],
                "responsePool": "El sexo [te ]llama...[#pero papa'gana!][#sana, sana!][#colita de rana!]",
            },
        ],
    }


def command_consumers(image: bytes, data_segment: int, logic: dict) -> dict:
    """Locate exact ``CMP WORD PTR [1C98], imm8`` command dispatches."""
    meanings = {entry["code"]: entry["meaning"] for entry in logic["commandCodes"]}
    pattern = b"\x83\x3E\x98\x1C"
    limit = data_segment * 16
    references: list[dict] = []
    cursor = 0
    while True:
        cursor = image.find(pattern, cursor, limit)
        if cursor < 0:
            break
        command_code = image[cursor + len(pattern)]
        references.append(
            {
                "linearOffset": cursor,
                "commandCode": command_code,
                "meaning": meanings.get(command_code, "código no etiquetado"),
            }
        )
        cursor += 1

    counts = Counter(reference["commandCode"] for reference in references)
    return {
        "instructionPattern": "83 3E 98 1C xx = CMP WORD PTR [DS:1C98], xx",
        "referenceCount": len(references),
        "countsByCommandCode": {str(code): counts[code] for code in sorted(counts)},
        "references": references,
    }


def disassemble_entry(image: bytes, metadata: dict) -> str:
    try:
        from capstone import CS_ARCH_X86, CS_MODE_16, Cs
    except ImportError:
        return "Capstone no está instalado. Ejecutar: pip install -r scripts/requirements-re.txt\n"

    cs = metadata["originalEntryPoint"]["cs"]
    ip = metadata["originalEntryPoint"]["ip"]
    linear = cs * 16 + ip
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    lines = [f"; Punto de entrada original de TRUCO.EXE: {cs:04X}:{ip:04X}"]
    for instruction in decoder.disasm(image[linear : linear + 0x400], ip):
        instruction_linear = cs * 16 + instruction.address
        lines.append(
            f"{cs:04X}:{instruction.address:04X}  "
            f"; linear {instruction_linear:05X}  "
            f"{instruction.bytes.hex(' '):<24}  "
            f"{instruction.mnemonic:<8} {instruction.op_str}".rstrip()
        )
        # This RETF transfers control to the QuickBASIC module descriptor.
        if instruction.mnemonic == "retf":
            break
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    packed = source.read_bytes()
    header = MzHeader.parse(packed)
    if header.declared_file_size != len(packed):
        raise ValueError(
            f"Tamaño MZ declarado ({header.declared_file_size}) distinto del real ({len(packed)})"
        )

    image, metadata, relocations = unpack_exepack(packed, header)
    data_segment, qb_strings, string_lookup = quickbasic_strings(image, metadata)
    metadata["quickBasicDataSegment"] = data_segment
    unpacked_mz = rebuild_mz(image, metadata, relocations)
    metadata.update(
        {
            "source": str(source),
            "sourceSha256": hashlib.sha256(packed).hexdigest(),
            "unpackedImageSha256": hashlib.sha256(image).hexdigest(),
            "rebuiltMzSha256": hashlib.sha256(unpacked_mz).hexdigest(),
        }
    )

    (output / "TRUCO.UNPACKED.BIN").write_bytes(image)
    (output / "TRUCO.UNPACKED.EXE").write_bytes(unpacked_mz)
    (output / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (output / "relocations.json").write_text(
        json.dumps(
            [
                {"offset": offset, "segment": segment, "address": f"{segment:04X}:{offset:04X}"}
                for offset, segment in relocations
            ],
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (output / "strings.json").write_text(
        json.dumps(ascii_strings(image), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (output / "quickbasic-strings.json").write_text(
        json.dumps(qb_strings, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    logic = recovered_logic()
    (output / "recovered-logic.json").write_text(
        json.dumps(logic, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (output / "command-consumers.json").write_text(
        json.dumps(command_consumers(image, data_segment, logic), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (output / "entrypoint.asm").write_text(disassemble_entry(image, metadata), encoding="utf-8")
    (output / "command-parser.asm").write_text(
        annotated_disassembly(
            image,
            0x8957,
            0x8DCC,
            string_lookup,
            "Parser original de comandos del jugador",
        ),
        encoding="utf-8",
    )
    (output / "language-handler.asm").write_text(
        annotated_disassembly(
            image,
            0x8DCC,
            0x92A8,
            string_lookup,
            "Sinónimos, abandono, insultos y otras respuestas de lenguaje",
        ),
        encoding="utf-8",
    )

    print(f"EXEPACK desempaquetado: {len(packed)} -> {len(image)} bytes de imagen")
    print(
        "Entrada original: "
        f"{metadata['originalEntryPoint']['cs']:04X}:{metadata['originalEntryPoint']['ip']:04X}"
    )
    print(f"Relocalizaciones restauradas: {len(relocations)}")
    print(f"Artefactos: {output}")


if __name__ == "__main__":
    main()
