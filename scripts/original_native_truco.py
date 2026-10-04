#!/usr/bin/env python3
"""Original 8086 strategy oracle for differential Truco fixtures.
Emulate original branches; supply verified RNG, UI and integer/x87 runtime contracts.
Original bytes are never patched. Graphics and dialogue are host boundaries.
"""
from pathlib import Path
import hashlib,json,random,struct
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
root=Path(__file__).resolve().parents[2]
image=(root/'web/reverse-engineering/TRUCO.UNPACKED.BIN').read_bytes()
u=Uc(UC_ARCH_X86,UC_MODE_16);u.mem_map(0,0x100000);u.mem_write(0x10000,image)
ds=0x1de20;state={}
# Independently locate and verify the BRUN40 numeric contracts used by the audit.
brun_raw=(root/'BRUN40.EXE').read_bytes()
brun=brun_raw[int.from_bytes(brun_raw[8:10],'little')*16:]
for stub,expected in [(0x258,bytes.fromhex('99 55 8b ec 53 52 50 8b dc cd 37 07 83 c4 04 5b 8b e5 5d cb')),(0x260,bytes.fromhex('55 8b ec 83 ec 02 cd 3b 5e fe cd 3d 58 8b e5 5d cb')),(0x274,bytes.fromhex('55 8b ec 56 57 bb 06 00 b8 00 04 9a 24 00 59 0f 5f 5e 8b e5 5d cb')),(0x234,bytes.fromhex('55 8b ec cd 3a d9 cd 39 3e b0 0a cd 3d 8a 26 b1 0a 9e 8b e5 5d cb'))]:
 token=image[0xd410+stub:0xd410+stub+4]
 assert token[:3]==bytes.fromhex('cd3fff')
 table=0x16b+(0x100+token[3])*2
 target=0xde00+int.from_bytes(brun[0x1770+table:0x1770+table+2],'little')
 assert brun[target:target+len(expected)]==expected
# 258 sign-extends AX then FILDs the integer; 234 FCOMPPs and exposes status with SAHF.

def word(at,value):u.mem_write(ds+at,struct.pack('<H',value&65535))
def read(at):return int.from_bytes(u.mem_read(ds+at,2),'little')
def skip(ip,length,args=0):
 u.reg_write(UC_X86_REG_SP,u.reg_read(UC_X86_REG_SP)+args)
 u.reg_write(UC_X86_REG_IP,ip+length)
def hook(uc,address,size,_):
 ip=address-0x10000
 state['trace'].append(hex(ip));state['trace']=state['trace'][-60:]
 stops=state['stops']
 if ip in stops:
  state['stop']=ip;uc.emu_stop();return
 if state.get('round',False) and ip in [0x74e1,0x76fa,0x661,0x29d,0x99f,0x92a8,0xb874,0x72a8]:
  sp=uc.reg_read(UC_X86_REG_SP);target=int.from_bytes(uc.mem_read(0x40000+sp,2),'little');uc.reg_write(UC_X86_REG_SP,sp+2);uc.reg_write(UC_X86_REG_IP,target);return
 b=bytes(uc.mem_read(address,15))
 if b[:3]==bytes.fromhex('cd3506') and b[5:12]==bytes.fromhex('cd351e921ccd3d') and b[12]==0xe8:
  bound=struct.unpack('<f',uc.mem_read(ds+int.from_bytes(b[3:5],'little'),4))[0]
  value=state['random'][state['draws']];state['draws']+=1
  uc.reg_write(UC_X86_REG_AX,int(value*bound)+1);skip(ip,15);return
 if b[0]==0xe8:
  target=(ip+3+int.from_bytes(b[1:3],'little',signed=True))&65535
  if target in [0x29d,0x99f,0x92a8] or (state.get("deal") and target == 0x851):skip(ip,3);return
 if b[0]==0x9a:
  offset=int.from_bytes(b[1:3],'little');segment=int.from_bytes(b[3:5],'little')
  assert segment==0xd41,(hex(ip),hex(segment),hex(offset))
  if offset==0x3f8:
   value=state['random'][state['draws']];state['draws']+=1
   uc.mem_write(ds+0x1800,struct.pack('<f',value));uc.reg_write(UC_X86_REG_AX,0x1800);skip(ip,5);return
  if offset==0x209:
   count=image[ip+5];index=uc.reg_read(UC_X86_REG_BX)
   target=int.from_bytes(image[ip+6+(index-1)*2:ip+8+(index-1)*2],'little') if 1<=index<=count else ip+6+count*2
   uc.reg_write(UC_X86_REG_IP,target);return
  if offset==0x274:state['fp'][-1]=int(state['fp'][-1]//1);skip(ip,5);return
  if offset==0x260:uc.reg_write(UC_X86_REG_AX,round(state['fp'].pop())&65535);skip(ip,5);return
  if offset==0x258: # integer AX -> floating stack
   value=uc.reg_read(UC_X86_REG_AX);state['fp'].append(value if value<32768 else value-65536);skip(ip,5);return
  if offset==0x234: # compare ST0 against ST1, consume both
   right=state['fp'].pop();left=state['fp'].pop();flags=uc.reg_read(UC_X86_REG_EFLAGS)&~0x45
   uc.reg_write(UC_X86_REG_EFLAGS,flags|(0x40 if right==left else 1 if right<left else 0));skip(ip,5);return
  if offset==0x220:
   # Config comparison at 7BF8 uses Flor='s', at 7EA4 uses Flor='n'.
   literal=int.from_bytes(uc.mem_read(0x40000+uc.reg_read(UC_X86_REG_SP),2),'little')
   assert literal in [0x24ec,0x24f2],hex(literal)
   equal=state.get('flor',False)==(literal==0x24ec)
   uc.reg_write(UC_X86_REG_EFLAGS,(uc.reg_read(UC_X86_REG_EFLAGS)&~0x40)|(0x40 if equal else 0));skip(ip,5,4);return
  args={0x185:4,0x188:4,0x1a3:2,0x1a9:4,0xbf:6}.get(offset)
  assert args is not None,(hex(ip),hex(offset),state['trace'])
  skip(ip,5,args);return
 if b[:2]==b'\xcd\x3d':skip(ip,2);return
 if b[0]==0xcd and 0x34<=b[1]<=0x3b:
  # The audit uses only absolute FLD/FSTP/FADD single-precision values.
  op,modrm=b[1],b[2];at=int.from_bytes(b[3:5],'little')
  if modrm==4:
   state['fp'].append(struct.unpack('<f',uc.mem_read(ds+uc.reg_read(UC_X86_REG_SI),4))[0]);skip(ip,3);return
  if modrm in [0x84,0x9c]:at+=uc.reg_read(UC_X86_REG_SI)
  if modrm in [0x85,0x9d]:at+=uc.reg_read(UC_X86_REG_DI)
  if op==0x35 and modrm in [6,0x84,0x85]:state['fp'].append(struct.unpack('<f',uc.mem_read(ds+at,4))[0])
  elif op==0x35 and modrm in [0x1e,0x9c,0x9d]:u.mem_write(ds+at,struct.pack('<f',state['fp'].pop()))
  elif op==0x34 and modrm==6:state['fp'][-1]+=struct.unpack('<f',uc.mem_read(ds+at,4))[0]
  elif op==0x34 and modrm==0x0e:state['fp'][-1]*=struct.unpack('<f',uc.mem_read(ds+at,4))[0]
  elif op==0x34 and modrm==0x36:state['fp'][-1]/=struct.unpack('<f',uc.mem_read(ds+at,4))[0]
  else:raise AssertionError((hex(ip),b[:5].hex()))
  skip(ip,5);return
u.hook_add(UC_HOOK_CODE,hook)
def run(entry,stops,values,random_tape=(),flor=False,round_mode=False,deal_mode=False):
 u.mem_write(ds+0x1830,bytes(0x90))
 u.mem_write(ds+0x1c60,bytes(0x310));u.mem_write(ds+0x1ee6,bytes(4))
 for at,value in values.items():word(at,value)
 for reg,val in [(UC_X86_REG_CS,0x1000),(UC_X86_REG_DS,0x1de2),(UC_X86_REG_ES,0x1de2),(UC_X86_REG_SS,0x4000),(UC_X86_REG_SP,0x1000),(UC_X86_REG_BP,0x1000),(UC_X86_REG_AX,0),(UC_X86_REG_BX,0),(UC_X86_REG_CX,0),(UC_X86_REG_DX,0),(UC_X86_REG_SI,0),(UC_X86_REG_DI,0),(UC_X86_REG_EFLAGS,2)]:u.reg_write(reg,val)
 state.clear();state.update(stops=stops,stop=None,random=random_tape,draws=0,fp=[],trace=[],flor=flor,round=round_mode,deal=deal_mode)
 u.emu_start(0x10000+entry,0,count=4000)
 assert state['stop'] is not None,(hex(u.reg_read(UC_X86_REG_IP)),state)
 return state['stop']
