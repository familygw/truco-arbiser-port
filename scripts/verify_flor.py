#!/usr/bin/env python3
"""Native CPU opening/counter, declaration and audit fixtures.
Emulate original branches; supply verified RNG, UI and integer/x87 runtime contracts.
Original bytes are never patched. Flor response strategy is outside this harness.
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
for stub,expected in [(0x258,bytes.fromhex('99 55 8b ec 53 52 50 8b dc cd 37 07 83 c4 04 5b 8b e5 5d cb')),(0x234,bytes.fromhex('55 8b ec cd 3a d9 cd 39 3e b0 0a cd 3d 8a 26 b1 0a 9e 8b e5 5d cb'))]:
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
 b=bytes(uc.mem_read(address,15))
 if b[:3]==bytes.fromhex('cd3506') and b[5:12]==bytes.fromhex('cd351e921ccd3d') and b[12]==0xe8:
  bound=struct.unpack('<f',uc.mem_read(ds+int.from_bytes(b[3:5],'little'),4))[0]
  value=state['random'][state['draws']];state['draws']+=1
  uc.reg_write(UC_X86_REG_AX,int(value*bound)+1);skip(ip,15);return
 if b[0]==0xe8:
  target=(ip+3+int.from_bytes(b[1:3],'little',signed=True))&65535
  if target in [0x29d,0x99f,0x671,0x74e1]:skip(ip,3);return
 if b[0]==0x9a:
  offset=int.from_bytes(b[1:3],'little');segment=int.from_bytes(b[3:5],'little')
  assert segment==0xd41,(hex(ip),hex(segment),hex(offset))
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
  args={0x185:4,0x188:4,0x1a3:2,0x1a9:4}.get(offset)
  assert args is not None,(hex(ip),hex(offset),state['trace'])
  skip(ip,5,args);return
 if b[:2]==b'\xcd\x3d':skip(ip,2);return
 if b[0]==0xcd and 0x34<=b[1]<=0x3b:
  # The audit uses only absolute FLD/FSTP/FADD single-precision values.
  op,modrm=b[1],b[2];at=int.from_bytes(b[3:5],'little')
  if op==0x35 and modrm==6:state['fp'].append(struct.unpack('<f',uc.mem_read(ds+at,4))[0])
  elif op==0x35 and modrm==0x1e:u.mem_write(ds+at,struct.pack('<f',state['fp'].pop()))
  elif op==0x34 and modrm==6:state['fp'][-1]+=struct.unpack('<f',uc.mem_read(ds+at,4))[0]
  else:raise AssertionError((hex(ip),b[:5].hex()))
  skip(ip,5);return
u.hook_add(UC_HOOK_CODE,hook)
def run(entry,stops,values,random_tape=(),flor=False):
 u.mem_write(ds+0x1c70,bytes(0x300));u.mem_write(ds+0x1ee6,bytes(4))
 for at,value in values.items():word(at,value)
 for reg,val in [(UC_X86_REG_CS,0x1000),(UC_X86_REG_DS,0x1de2),(UC_X86_REG_ES,0x1de2),(UC_X86_REG_SS,0x4000),(UC_X86_REG_SP,0x1000),(UC_X86_REG_BP,0x1000),(UC_X86_REG_AX,0),(UC_X86_REG_BX,0),(UC_X86_REG_CX,0),(UC_X86_REG_DX,0),(UC_X86_REG_SI,0),(UC_X86_REG_DI,0),(UC_X86_REG_EFLAGS,2)]:u.reg_write(reg,val)
 state.clear();state.update(stops=stops,stop=None,random=random_tape,draws=0,fp=[],trace=[],flor=flor)
 u.emu_start(0x10000+entry,0,count=4000)
 assert state['stop'] is not None,(hex(u.reg_read(UC_X86_REG_IP)),state)
 return state['stop']
rng=random.Random(198509)
fixtures={'image_sha256':hashlib.sha256(image).hexdigest(),'openings':[],'responses':[],'replies':[]}
for points in range(20,39):
 for roll in range(10):
  run(0x5aa5,{0x5b62},{0x1d76:points},[roll/10])
  fixtures['openings'].append([points,roll/10,read(0x1d8e)])
for points in [0,*range(20,39)]:
 for incoming in range(5,9):
  for _ in range(100):
   player=rng.randrange(30);cpu=rng.randrange(30);tape=[rng.randrange(10)/10 for _ in range(2)]
   stop=run(0x292a,{0x1b06,0x1c0a,0x2aa6,0x2b79},{0x1d76:points,0x1c98:incoming,0x1d48:player,0x1d4a:cpu},tape)
   action='accept' if stop==0x2aa6 else 'cpu' if stop==0x1c0a else 'player'
   wager=read(0x1d8e) if action=='accept' else read(0x1d86) if action=='cpu' else read(0x1d9c)
   fixtures['responses'].append([points,incoming,player,cpu,tape,action,wager,read(0x1de0),state['draws']])
for points in range(20,39):
 for opening in [3,4,30]:
  for incoming in [0,1,5,6,7,8,9,24,25,26]:
   for _ in range(10):
    player=rng.randrange(30);cpu=rng.randrange(30)
    stop=run(0x5b6b,{0x1b06,0x1c0a,0x2aa6,0x5cc2,0x2b79,0x8927},{0x1d76:points,0x1c98:incoming,0x1d48:player,0x1d4a:cpu,0x1d8e:opening},[.1]*10)
    action='invalid' if stop==0x8927 else 'accept' if stop in [0x2aa6,0x5cc2] else 'cpu' if stop==0x1c0a else 'player'
    wager=0 if action=='invalid' else read(0x1d8e) if action=='accept' else read(0x1d86) if action=='cpu' else read(0x1d9c)
    fixtures['replies'].append([opening,incoming,points,player,cpu,action,wager,read(0x1de0)])
fixtures['audits']=[]
for _ in range(6000):
 ids=rng.sample(range(40),3);ranks=[i%10+1 for i in ids];suits=[i//10 for i in ids]
 claim=rng.choice([0,50,*range(20,39)]);cpuClaims=rng.choice([False,True]);mode=rng.choice([0,40,50,60]);winner=rng.choice(['player','cpu']);wager=rng.randrange(1,31)
 values={0x1e14:1,0x1d96:claim,0x1dde:int(cpuClaims),0x1de0:mode,0x1d9c:wager if winner=='player' else 0,0x1d86:wager if winner=='cpu' else 0}
 for i,(rank,suit) in enumerate(zip(ranks,suits)):values[0x1c7c+i*2]=rank;values[0x1c74+i*2]=suit
 run(0x7b86,{0x7c45,0x7d41,0x7e95,0x7f81,0x80a9,0x80f0},values,[.1]*12,True)
 actual=20+sum(r if r<=7 else 0 for r in ranks) if len(set(suits))==1 else 0
 pip=[r if r<=7 else 0 for r in ranks];envido=max(pip)
 for i in range(3):
  for j in range(i+1,3):
   if suits[i]==suits[j]:envido=pip[i]+pip[j]+20
 fixtures['audits'].append([envido,actual,claim,winner,wager,mode,cpuClaims,read(0x1d9c),read(0x1d86),bool(read(0x1d9e))])
fixtures['declarations']=[]
for mano in [False,True]:
 for actual in range(20,39):
  for claim in range(39):
   stop=run(0x5a90 if mano else 0x1aaf,{0x1bd5,0x1bdb,0x1ade,0x1b00,0x1c04},{0x1d90:38,0x1d92:20,0x1d94:actual,0x1d96:claim})
   fixtures['declarations'].append([int(mano),actual,claim,'invalid' if stop==0x1bd5 else 'cpu' if stop in [0x1bdb,0x1c04] else 'player',read(0x1d96)])
output=root/'web/scripts/fixtures/original-flor-fixtures.json'
output.write_text(json.dumps(fixtures,separators=(',',':'))+'\n')
print({k:len(v) for k,v in fixtures.items() if isinstance(v,list)})
