#!/usr/bin/env python3
"""Resolve Truco's INT 3F runtime tokens using BRUN40's own dispatch table."""
from pathlib import Path
import hashlib, json, struct
from capstone import Cs, CS_ARCH_X86, CS_MODE_16
root = Path(__file__).resolve().parents[2]
out = root / 'web/reverse-engineering'
raw = (root / 'BRUN40.EXE').read_bytes()
header = struct.unpack_from('<14H', raw)
image = raw[header[4] * 16:]
base = 0x1770
assert image[0x1859:0x185e] == bytes.fromhex('b8 3f 35 cd 21')
assert image[0x18a7:0x18ac] == bytes.fromhex('03 c0 05 6b 01')
entries = [
 (0xf8, 0x64, 'qb_instr', ['needle_descriptor','haystack_descriptor'], 4),
 (0xb9, 0x42, 'qb_len', ['text_descriptor'], 2),
 (0xbf, 0x46, 'qb_mid', ['count','start_index','text_descriptor'], 6),
 (0x10d, 0x6c, 'qb_left', ['count','text_descriptor'], 4),
 (0x176, 0xb5, 'qb_right', ['count','text_descriptor'], 4),
 (0x107, 0x6a, 'qb_lcase_ascii', ['text_descriptor'], 2),
 (0x185, 0xc2, 'qb_assign', ['destination_descriptor','source_descriptor'], 4),
 (0x188, 0xc3, 'qb_concat', ['right_descriptor','left_descriptor'], 4),
 (0x220, 0x109, 'qb_compare_flags', ['right_descriptor','left_descriptor'], 4),
]
cs = Cs(CS_ARCH_X86, CS_MODE_16)
records=[]; listing=[]
for stub, token, name, parameters, purge in entries:
 index = token+1 if token < 255 else token
 table = base+0x16b+index*2
 offset=struct.unpack_from('<H',image,table)[0]
 # Dispatcher selects 0DE0 only for table offset >=0395.
 segment = 0x177 if 0x16b+index*2 < 0x395 else 0xde0
 target=segment*16+offset
 instructions=list(cs.disasm(image[target:target+160],offset))
 first_return=next((i for i in instructions if i.mnemonic=='retf'),None)
 if name in [entry[2] for entry in entries]:
  assert first_return is not None and int(first_return.op_str,16)==purge,(name,first_return)
 record={'name':name,'truco_stub':f'1d41:{stub:04x}','token':hex(token),'table_image_offset':hex(table),'runtime_address':f'{segment:04x}:{offset:04x}','runtime_image_offset':hex(target),'parameters_stack_order':parameters,'callee_purge_bytes':purge}
 records.append(record)
 listing.append('\n; '+json.dumps(record))
 for i in instructions:
  listing.append(f'{segment:04X}:{i.address:04X}  {i.bytes.hex(" "):24} {i.mnemonic:8} {i.op_str}')
  if i.mnemonic=='retf':break
result={'source_sha256':hashlib.sha256(raw).hexdigest(),'dispatch_segment':'0177','dispatch_table_offset':'016b','entries':records,'compare_contract':'REPE CMPSB over min(lengths); if equal prefix, compare lengths. PUSHF/POPF preserve ZF and CF across temporary cleanup. RETF 4. ZF=1 iff equal; CF=1 iff left < right (unsigned byte lexicographic).','normalization':'ASCII LCASE: bytes 41h..5Ah (A-Z) toggled by XOR 20h to a-z.'}
# AX=5A41h makes BL=41h, BH=5Ah: this is LCASE, not UCASE.
result['entries'][5]['name']='qb_lcase_ascii'
(out/'brun40-runtime.json').write_text(json.dumps(result,indent=2)+'\n')
(out/'brun40-runtime.asm').write_text('\n'.join(listing)+'\n')
print(f'Resolved {len(records)} runtime entries; checked stack cleanup against RETF instructions.')
