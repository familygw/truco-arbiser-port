#!/usr/bin/env python3
"""Execute seeded complete matches in original 8086 bytes, with presentation off.
The seed is BRUN40's 24-bit RND state immediately before the first deal.
Rendering/delays are replaced; phrase, music-selection and voice-selection RND
calls still execute. Keyboard inputs are explicit recorded QuickBASIC commands.
"""
import original_native_truco as native
from original_native_truco import *
from unicorn import UC_HOOK_CODE
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--count',type=int,default=128);args=parser.parse_args()
# These spans contain rendering only; keep score and RNG instructions intact.
ranges={0x132b:0x134f,0x136c:0x137b,0x143e:0x1612,0x1729:0x175c,0x8297:0x82b9,0x82c7:0x8325,0x8339:0x84de,0x779a:0x77a9}
watch=[0x1d48,0x1d4a,0x1d82,0x1d6a,0x1d88,0x1d86,0x1d9c,0x1d74,0x1d76,0x1d96,0x1d9e,0x1d50,0x1d52,0x1d6e,0x18bc,0x1dee,0x1df6,0x1df0,0x1d84,0x1e2c]
events=[]
strings={};string_heap=0xf000
voices=[(root/'MVYTRUC@').read_bytes()[i*180:(i+1)*180].decode('cp437') for i in range(156)]
def string(at):
 if at in strings:return strings[at]
 if at+4<len(image)-0xde20:
  length,ptr=struct.unpack_from('<HH',image,0xde20+at)
  if ptr==at+4 and length<=4096:return image[0xde20+ptr:0xde20+ptr+length].decode('ascii')
 return ''
def allocate(text):
 global string_heap
 string_heap=(string_heap+2)&65535;strings[string_heap]=text;return string_heap

def string_runtime(ip,offset):
 count={0x185:2,0x188:2,0xf8:2,0x10d:2,0xbf:3,0xb9:1,0x224:1,0x1a3:1,0x1a9:2,0x3b0:3,0x220:2}.get(offset)
 if count is None:return False
 if offset in [0x220,0xb9,0x224] and not (state.get('phrase') or state.get('helper')):return False
 sp=u.reg_read(UC_X86_REG_SP)
 values=list(struct.unpack('<'+'H'*count,u.mem_read(0x40000+sp,count*2)))[::-1]
 if offset==0x185:strings[values[1]]=string(values[0])
 elif offset==0x188:u.reg_write(UC_X86_REG_AX,allocate(string(values[0])+string(values[1])))
 elif offset==0xf8:u.reg_write(UC_X86_REG_AX,string(values[0]).find(string(values[1]))+1)
 elif offset==0x10d:u.reg_write(UC_X86_REG_AX,allocate(string(values[0])[:values[1]]))
 elif offset==0xbf:u.reg_write(UC_X86_REG_AX,allocate(string(values[0])[max(0,values[1]-1):max(0,values[1]-1)+values[2]]))
 elif offset==0xb9:u.reg_write(UC_X86_REG_AX,len(string(values[0])))
 elif offset==0x224:u.reg_write(UC_X86_REG_AX,values[0])
 elif offset==0x220:u.reg_write(UC_X86_REG_EFLAGS,(u.reg_read(UC_X86_REG_EFLAGS)&~0x40)|(0x40 if string(values[0])==string(values[1]) else 0))
 elif offset==0x1a3:
  n=values[0] if values[0]<32768 else values[0]-65536;u.reg_write(UC_X86_REG_AX,allocate((' ' if n>=0 else '')+str(n)))
 elif offset==0x1a9:
  n=struct.unpack('<f',struct.pack('<HH',*values))[0];u.reg_write(UC_X86_REG_AX,allocate((' ' if n>=0 else '')+format(n,'.7g')))
 elif offset==0x3b0:strings[0x1ca0]=voices[values[2]-1]
 skip(ip,5,count*2);return True

class RandomTape:
 def __init__(self,seed):self.seed=seed;self.calls=[]
 def __getitem__(self,index):
  self.seed=(self.seed*0xfd43fd+0xc39ec3)&0xffffff
  self.calls.append({'address':state.pop('random_address',u.reg_read(UC_X86_REG_IP)),'state':self.seed})
  return self.seed/0x1000000

def snapshot(ip):
 return {'address':ip,'draws':state['draws'],'randomState':state['random'].seed,'memory':[read(at) for at in watch]}

def resume():
 sp=u.reg_read(UC_X86_REG_SP);target=int.from_bytes(u.mem_read(0x40000+sp,2),'little');u.reg_write(UC_X86_REG_SP,sp+2);u.reg_write(UC_X86_REG_IP,target);return target

def full_hook(uc,address,size,_):
 ip=address-0x10000
 previous=state.get('last_ip');state['last_ip']=ip
 if ip in [0x1b22,0x1c26]:state['finish_source']=previous
 if ip in [0x192c,0x82c7,0x0691,0x87e8]:
  e=snapshot(ip)
  if ip==0x192c:e['cards']=[read(0x1862+i*2) for i in range(3)]+[round(struct.unpack('<f',uc.mem_read(ds+0x186c+i*4,4))[0]) for i in range(3)]
  if ip==0x87e8:e['playerSlot']=read(0x1d72)
  if ip==0x0691:e['voice']=read(0x1cc4)
  events.append(e)
 if ip==0x29d:
  # Run actual C94A bytes with an isolated procedure frame, preserving the
  # caller. This formatter's branches decide optional/nested text and RND.
  state['phrase']={reg:uc.reg_read(reg) for reg in [UC_X86_REG_AX,UC_X86_REG_BX,UC_X86_REG_CX,UC_X86_REG_DX,UC_X86_REG_SI,UC_X86_REG_DI,UC_X86_REG_BP,UC_X86_REG_SP,UC_X86_REG_EFLAGS]}
  uc.reg_write(UC_X86_REG_BP,0xd000);uc.reg_write(UC_X86_REG_SP,0xcfc0);uc.mem_write(0x4d006,struct.pack('<H',0x1ca8));uc.reg_write(UC_X86_REG_IP,0xc952);return
 if ip==0xcad4 and state.get('phrase'):
  text=string(uc.reg_read(UC_X86_REG_AX));strings[0x1ca8]=text
  e=snapshot(0x29d);e['text']=text;events.append(e)
  saved=state.pop('phrase')
  for reg,value in saved.items():uc.reg_write(reg,value)
  resume();return
 if ip==0xc273 and state.get('helper'):
  value=uc.reg_read(UC_X86_REG_AX);saved=state.pop('helper')
  for reg,v in saved['registers'].items():uc.reg_write(reg,v)
  uc.reg_write(UC_X86_REG_AX,value);uc.reg_write(UC_X86_REG_IP,saved['return']);return
 if ip in ranges:uc.reg_write(UC_X86_REG_IP,ranges[ip]);return
 if ip==0xbd:
  bound=struct.unpack('<f',uc.mem_read(ds+0x1c92,4))[0];state['random_address']=0xc2;value=state['random'][state['draws']];state['draws']+=1
  uc.reg_write(UC_X86_REG_AX,int(value*bound)+1);resume();return
 if ip in [0x72a8,0x661,0x92a8,0x851]:resume();return
 b=bytes(uc.mem_read(address,15))
 # Execute 99F's sound-off path, rather than skipping its state writes.
 if b[0]==0xe8 and (ip+3+int.from_bytes(b[1:3],'little',signed=True))&65535 in [0x99f,0x29d]:return
 if b[0]==0x9a:
  offset=int.from_bytes(b[1:3],'little');segment=int.from_bytes(b[3:5],'little')
  if segment==0xd41 and offset==0x1ee and (state.get('phrase') or state.get('helper')):skip(ip,5);return
  if segment==0xd41 and string_runtime(ip,offset):return
  if segment==0 and offset==0xbc6e:
   state['helper']={'registers':{reg:uc.reg_read(reg) for reg in [UC_X86_REG_AX,UC_X86_REG_BX,UC_X86_REG_CX,UC_X86_REG_DX,UC_X86_REG_SI,UC_X86_REG_DI,UC_X86_REG_BP,UC_X86_REG_SP,UC_X86_REG_EFLAGS]},'return':ip+5}
   uc.reg_write(UC_X86_REG_BP,0xc000);uc.reg_write(UC_X86_REG_SP,0xbfc0);uc.reg_write(UC_X86_REG_IP,0xbc76);return
  if segment==0:
   count={0xc8b4:2,0xc279:2,0xba42:6,0xcc77:0,0xbb36:2,0xcada:2,0xbae0:2,0xcbd4:4}.get(offset)
   assert count is not None,(hex(ip),hex(offset))
   if offset==0xcada:
    at=int.from_bytes(uc.mem_read(0x40000+uc.reg_read(UC_X86_REG_SP),2),'little')
    state['random_address']=0xcae2;value=state['random'][state['draws']];state['draws']+=1;bound=int.from_bytes(uc.mem_read(0x40000+at,2),'little') if state.get('helper') and at==0xbff4 else read(at);uc.reg_write(UC_X86_REG_AX,int(value*bound)+1)
   skip(ip,5,count);return
  count={0x1a0:2,0x3b0:6,0xf8:4,0x10d:4,0x152:2,0x155:2,0x161:2,0xe6:2,0x2ce:4,0x2d4:4,0x2cb:6}.get(offset)
  if count is not None:skip(ip,5,count);return
 if b[:3]==bytes.fromhex('cd3506') and b[5:12]==bytes.fromhex('cd351e921ccd3d') and b[12]==0xe8:state['random_address']=0xc2
 native.hook(uc,address,size,_)

# Use a fresh emulator: one hook and untouched source image for each session.
u=Uc(UC_ARCH_X86,UC_MODE_16);native.u=u;u.mem_map(0,0x100000);u.mem_write(0x10000,image);u.hook_add(UC_HOOK_CODE,full_hook)
fixtures={'image_sha256':hashlib.sha256(image).hexdigest(),'profile':'dos-silent-v1','watch':watch,'cases':[]}
for case in range(args.count):
 seeds=[0x50000,0,1,2,0xffffff,0x800000,0x123456,0xabcdef]
 seed=seeds[case] if case<len(seeds) else (case*0x71ab53)&0xffffff
 u.mem_write(ds+0x1830,bytes(0x90));u.mem_write(ds+0x1c60,bytes(0x310))
 for reg,val in [(UC_X86_REG_CS,0x1000),(UC_X86_REG_DS,0x1de2),(UC_X86_REG_ES,0x1de2),(UC_X86_REG_SS,0x4000),(UC_X86_REG_SP,0x1000),(UC_X86_REG_BP,0x1000),(UC_X86_REG_AX,0),(UC_X86_REG_BX,0),(UC_X86_REG_CX,0),(UC_X86_REG_DX,0),(UC_X86_REG_SI,0),(UC_X86_REG_DI,0),(UC_X86_REG_EFLAGS,2)]:u.reg_write(reg,val)
 strings.clear();strings.update({0x1d3e:'jugador',0x1c8a:'quiero',0x1c8e:'no quiero'});string_heap=0xf000
 state.clear();events.clear();state.update(stops={0x8957,0x93c3,0x8927,0x1b22,0x1c26},stop=None,random=RandomTape(seed),draws=0,fp=[],trace=[],flor=case%2==0,deal=True)
 # Execute native per-hand reset; put a sentinel RETURN onto its stack.
 u.mem_write(0x40ffe,struct.pack('<H',0xd3f0));u.reg_write(UC_X86_REG_SP,0xffe);state['stops'].add(0xd3f0)
 u.emu_start(0x18613,0,count=100000);assert state['stop']==0xd3f0;state['stops'].remove(0xd3f0)
 word(0x1d6a,case%3==0);entry=0x1609 if case%3==0 else 0x1325
 used=set();hand=0;attempt=None;before=0;commands=[]
 for step in range(3000):
  state['stop']=None;u.emu_start(0x10000+entry,0,count=100000)
  stop=state['stop'];assert stop is not None,(case,state)
  if attempt is not None and read(0x18bc)>before:used.add(attempt)
  attempt=None
  e=snapshot(stop)
  if stop==0x93c3:e['cpuSlot']=read(0x1d70)
  events.append(e)
  if stop in [0x1b22,0x1c26]:
   e['finishSource']=state['finish_source'];break
  if stop==0x8927:raise AssertionError(('invalid policy',case,events[-8:]))
  if stop==0x8957:
   if hand!=read(0x1d82):used.clear();hand=read(0x1d82)
   return_ip=int.from_bytes(u.mem_read(0x40000+u.reg_read(UC_X86_REG_SP),2),'little')
   code=25 if return_ip in [0x23ec,0x5b6b] else 25 if read(0x1d88)==10 else 24 if read(0x1d88) in [2,6] else next((c for c in [9,10,11] if c not in used),26)
   if 9<=code<=11:attempt=code;before=read(0x18bc)
   e['input']=code;e['returnAddress']=return_ip;commands.append(code);word(0x1c98,code)
  entry=resume()
 else:raise AssertionError(('match limit',case,events[-5:]))
 fixtures['cases'].append({'seed':seed,'flor':case%2==0,'cpuMano':case%3==0,'inputs':commands,'events':list(events),'randomCalls':state['random'].calls,'winner':'player' if stop==0x1b22 else 'cpu','score':{'player':read(0x1d48)+(read(0x1d9c) if read(0x1d48)<30 else 0),'cpu':read(0x1d4a)+(read(0x1d86)+(read(0x1e2c) if state['finish_source']==0x45b3 else 0) if read(0x1d4a)<30 else 0)}})
output=root/'web/scripts/fixtures/original-seeded-matches.json';output.write_text(json.dumps(fixtures,separators=(',',':'))+'\n')
print(len(fixtures['cases']),'native complete matches;',sum(len(c['events']) for c in fixtures['cases']),'events')
