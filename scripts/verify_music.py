#!/usr/bin/env python3
"""Execute BRUN40's note, accidental, dot, duration and articulation routines.
Replace only the hardware queue at 0177:444C. Control commands are applied
by their independently disassembled byte assignments; strings are original.
"""
from pathlib import Path
import hashlib,json,re,struct
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
root=Path(__file__).resolve().parents[2]
raw=(root/'BRUN40.EXE').read_bytes();b=raw[int.from_bytes(raw[8:10],'little')*16:]
u=Uc(UC_ARCH_X86,UC_MODE_16);u.mem_map(0,0x100000);u.mem_write(0x10000,b);u.mem_write(0x60000,b[:0x1770]);events=[]
def word(at,value):u.mem_write(0x60000+at,struct.pack('<H',value))
def read(at):return int.from_bytes(u.mem_read(0x60000+at,2),'little')
def byte(at,value):u.mem_write(0x60000+at,bytes([value]))
def hook(uc,address,size,_):
 if address==0x11770+0x444c:
  events.append([uc.reg_read(UC_X86_REG_AX)&255,uc.reg_read(UC_X86_REG_CX),uc.reg_read(UC_X86_REG_DX)])
  sp=uc.reg_read(UC_X86_REG_SP);target=read(sp);uc.reg_write(UC_X86_REG_SP,sp+2)
  uc.reg_write(UC_X86_REG_EFLAGS,uc.reg_read(UC_X86_REG_EFLAGS)&~1);uc.reg_write(UC_X86_REG_IP,target)
u.hook_add(UC_HOOK_CODE,hook)
for reg,value in [(UC_X86_REG_CS,0x1177),(UC_X86_REG_DS,0x6000),(UC_X86_REG_SS,0x6000)]:u.reg_write(reg,value)
def parse(score):
 global events
 # The TRUCO helper resets MN O3 L10 after each PLAY; default tempo is 120.
 byte(0x58e,120);byte(0x590,10);byte(0x593,3);byte(0x592,3);byte(0x591,0);byte(0x536,0)
 source=score.lower();u.mem_write(0x62000,source.encode());result=[];i=0
 while i<len(source):
  command=source[i];i+=1
  if command.isspace():continue
  if command in '<>':
   oct=int.from_bytes(u.mem_read(0x60593,1),'little');byte(0x593,max(0,min(6,oct+(1 if command=='>' else -1))));continue
  if command=='m':byte(0x592,{'l':1,'s':2,'n':3}[source[i]]);i+=1;continue
  if command in 'olt':
   match=re.match(r'\d+',source[i:]);assert match
   value=int(match[0]);i+=len(match[0]);byte({'o':0x593,'l':0x590,'t':0x58e}[command],value);continue
  assert command in 'abcdefgp',command
  events=[];entry=0x42da;flags=2
  u.reg_write(UC_X86_REG_CX,ord(command.upper()))
  if command=='p':
   match=re.match(r'\d+',source[i:]);assert match
   value=int(match[0]);i+=len(match[0]);u.reg_write(UC_X86_REG_DX,value);entry=0x429e;flags=3
  word(0x241,0x2000+i);word(0x243,len(source)-i);word(0x1000,0xf000)
  u.reg_write(UC_X86_REG_SP,0x1000);u.reg_write(UC_X86_REG_EFLAGS,flags)
  u.emu_start(0x11770+entry,0x11770+0xf000,count=3000)
  assert u.reg_read(UC_X86_REG_IP)==0xf000,(score,i,hex(u.reg_read(UC_X86_REG_IP)))
  i=read(0x241)-0x2000
  assert len(events) in [1,2],events
  action,freq,duration=events[0];assert action==1
  if freq==0:result.append({'rest':duration*2.5})
  else:
   gap=events[1][2] if len(events)>1 else 0
   result.append({'freq':freq,'ms':(duration+gap)*2.5,'soundMs':duration*2.5})
 return result
music=json.loads((root/'web/src/original-music.json').read_text())
cases=[{'name':name,'score':track['score'],'events':parse(track['score'])} for name,track in music['tracks'].items()]
# Extra articulation/dots/rest cases, with all three modes and several tempos.
for mode in ['mn','ml','ms']:
 for tempo in [32,120,255]:
  score=f't{tempo}o3l10{mode}c.c..c...p10.p10..g#25a-52>c<';cases.append({'name':f'{mode}-{tempo}','score':score,'events':parse(score)})
(root/'web/scripts/fixtures/original-music-events.json').write_text(json.dumps({'runtimeSha256':hashlib.sha256(raw).hexdigest(),'cases':cases},separators=(',',':'))+'\n')
print(f'BRUN40: {len(cases)} partituras y {sum(len(c["events"]) for c in cases)} eventos musicales nativos.')
