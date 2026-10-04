#!/usr/bin/env python3
"""Execute BRUN40's actual integer RND recurrence, plus RANDOMIZE bit mixing."""
from pathlib import Path
import hashlib,json,struct
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16
from unicorn.x86_const import *
root=Path(__file__).resolve().parents[2]
raw=(root/'BRUN40.EXE').read_bytes(); image=raw[int.from_bytes(raw[8:10],'little')*16:]
assert image[0x200:0x20c]==bytes.fromhex('fd430300c39e26000000804b')
u=Uc(UC_ARCH_X86,UC_MODE_16);u.mem_map(0,0x100000);u.mem_write(0x10000,image);u.mem_write(0x60000,image[:0x1770])
for reg,value in [(UC_X86_REG_CS,0x1177),(UC_X86_REG_DS,0x6000),(UC_X86_REG_SS,0x7000),(UC_X86_REG_SP,0x1000)]:u.reg_write(reg,value)
rows=[]
for seed in [0,1,0x50000,0xffffff,0x800000,0x123456,0xabcdef]:
 u.mem_write(0x608db,struct.pack('<I',seed)); states=[]
 for n in range(4096):
  u.emu_start(0x11770+0xbc47,0x11770+0xbc79,count=100)
  assert u.reg_read(UC_X86_REG_IP)==0xbc79
  states.append(int.from_bytes(u.mem_read(0x608db,4),'little'))
 rows.append({'seed':seed,'states':states})
# RANDOMIZE double: XOR the top two words into bytes 1..2, preserving byte 0.
mixes=[]
for seed in [0,1,0x50000,0xffffff,0x123456]:
 for seconds in [0,1,123.5,43200,86399.5]:
  u.mem_write(0x608db,struct.pack('<I',seed));u.reg_write(UC_X86_REG_SP,0x1000)
  u.reg_write(UC_X86_REG_SS,0x6000)
  u.mem_write(0x61004,struct.pack('<d',seconds))
  u.emu_start(0x11770+0xbc8d,0x11770+0xbc9b,count=100)
  mixes.append([seed,seconds,int.from_bytes(u.mem_read(0x608db,4),'little')])
out={'sha256':hashlib.sha256(raw).hexdigest(),'sequences':rows,'randomize':mixes}
(root/'web/scripts/fixtures/original-random.json').write_text(json.dumps(out,separators=(',',':')))
print(f'Native BRUN40: {len(rows)*4096} RND states and {len(mixes)} RANDOMIZE cases.')
