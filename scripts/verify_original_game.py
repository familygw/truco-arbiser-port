#!/usr/bin/env python3
"""Execute isolated original 16-bit routines; emit differential-test fixtures.
No game/runtime execution: one string comparison is supplied by its verified ZF contract.
"""
from pathlib import Path
from itertools import combinations, product
import hashlib,json,struct
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'web/reverse-engineering'
image=(OUT/'TRUCO.UNPACKED.BIN').read_bytes()
u=Uc(UC_ARCH_X86,UC_MODE_16);u.mem_map(0,0x100000);u.mem_write(0x10000,image)
DS=0x1de20
state={'stop':None,'stop_set':set(),'flor':True,'compare_calls':0}
def word(offset,value):u.mem_write(DS+offset,struct.pack('<H',value&65535))
def read(offset):return struct.unpack('<H',u.mem_read(DS+offset,2))[0]
def hook(uc,address,size,_):
 if address==state['stop'] or address in state['stop_set'] or bytes(uc.mem_read(address,1))==b'\xc3':uc.emu_stop();return
 if address==0x11830:
  assert bytes(uc.mem_read(address,5))==bytes.fromhex('9a 20 02 41 0d')
  # CMP configured Flor option against literal "n"; ZF=true means disabled.
  flags=uc.reg_read(UC_X86_REG_EFLAGS)
  uc.reg_write(UC_X86_REG_EFLAGS,(flags&~0x40)|(0 if state['flor'] else 0x40))
  uc.reg_write(UC_X86_REG_SP,uc.reg_read(UC_X86_REG_SP)+4)
  uc.reg_write(UC_X86_REG_IP,0x1835)
  state['compare_calls']+=1
u.hook_add(UC_HOOK_CODE,hook)
def run(entry,stop=None):
 for reg,val in [(UC_X86_REG_CS,0x1000),(UC_X86_REG_DS,0x1de2),(UC_X86_REG_ES,0x1de2),(UC_X86_REG_SS,0x4000),(UC_X86_REG_SP,0x1000),(UC_X86_REG_BP,0x1000),(UC_X86_REG_AX,0),(UC_X86_REG_BX,0),(UC_X86_REG_CX,0),(UC_X86_REG_DX,0),(UC_X86_REG_SI,0),(UC_X86_REG_DI,0),(UC_X86_REG_EFLAGS,2)]:u.reg_write(reg,val)
 state['stop']=None if stop is None else 0x10000+stop
 u.emu_start(0x10000+entry,0,count=2000)
 ip=u.reg_read(UC_X86_REG_IP)
 assert (stop is not None and ip==stop) or bytes(u.mem_read(0x10000+ip,1))==b'\xc3',hex(ip)
# DOS suit codes: espada=0,basto=1,oro=2,copa=3; figure ranks 8/9/10 mean 10/11/12.
suits=['espada','basto','oro','copa'];ranks=[1,2,3,4,5,6,7,10,11,12]
deck=[]
for suit_code,suit in enumerate(suits):
 for rank in ranks:
  dos_rank=rank if rank<=7 else rank-2
  word(0x1d7c,dos_rank);word(0x1d7e,suit_code);run(0x94f6)
  deck.append({'id':f'{rank}-{suit}','rank':rank,'suit':suit,'dosRank':dos_rank,'suitCode':suit_code,'strength':read(0x1d80)})
rows=[]
for ids in combinations(range(40),3):
 cards=[deck[i] for i in ids]
 for i,card in enumerate(cards):
  word(0x184a+i*2,card['suitCode']);word(0x185a+i*2,card['rank'] if card['rank']<=7 else 0);word(0x1840+i*2,card['strength'])
 run(0x960a);order=[read(x)-1 for x in [0x1dee,0x1df6,0x1df0]]
 results=[]
 for enabled in [True,False]:
  state['flor']=enabled;word(0x1d74,0);word(0x1d76,0);run(0x175c,0x18ee)
  results.extend([read(0x1d74),read(0x1d76)])
 rows.append([*ids,*order,*results])
 print('',end='',flush=True)
print('Executed all 9880 distinct three-card hands with Flor on and off.',flush=True)
# A wager cap is score-independent except for max(player,cpu); exhaust all legal scores and stakes.
cap_count=0
for player,cpu in product(range(30),repeat=2):
 for stake in range(1,31):
  word(0x1d48,player);word(0x1d4a,cpu);word(0x1db2,stake);run(0x816f)
  assert read(0x1db2)==min(stake,30-max(player,cpu))
  cap_count+=1
wagers=[]
for code in range(1,5):
 word(0x1c98,code);word(0x1d8e,0);run(0x19df,0x1a23);wagers.append(read(0x1d8e))
assert wagers==[2,3,6,30]
# Exact preflight of the CPU Envido branch, before stochastic decisions.
gate=[]
state['stop_set']={0x11de8,0x11db2,0x11d29}
for points in range(34):
 for player,cpu in product(range(30),repeat=2):
  for code in range(1,5):
   word(0x1d74,points);word(0x1d48,player);word(0x1d4a,cpu);word(0x1c98,code)
   # Bypass run's single-RET assertion: these three addresses are verified branch boundaries.
   for reg,val in [(UC_X86_REG_CS,0x1000),(UC_X86_REG_DS,0x1de2),(UC_X86_REG_SS,0x4000),(UC_X86_REG_SP,0x1000),(UC_X86_REG_EFLAGS,2)]:u.reg_write(reg,val)
   state['stop']=None;u.emu_start(0x11ce4,0,count=300)
   ip=u.reg_read(UC_X86_REG_IP)
   assert ip in [0x1de8,0x1db2,0x1d29],hex(ip)
   gate.append({0x1de8:'S',0x1db2:'R',0x1d29:'W'}[ip])
state['stop_set']=set()
print(f'Executed {len(gate)} CPU Envido preflight branches.',flush=True)
fixture={'cpuEnvidoGate':''.join(gate),'image_sha256' :hashlib.sha256(image).hexdigest(),'deck':deck,'row_layout':['card0','card1','card2','weakestSlot','middleSlot','strongestSlot','envidoFlorOn','florFlorOn','envidoFlorOff','florFlorOff'],'hands':rows,'initialEnvidoWagers':wagers,'nativeCapCases':cap_count,'runtimeStringCompareStubs':state['compare_calls']}
(ROOT/'web/scripts/fixtures/original-game-fixtures.json').write_text(json.dumps(fixture,separators=(',',':'))+'\n')
summary={k:v for k,v in fixture.items() if k not in ['hands','deck','cpuEnvidoGate']};summary['handsTested']=len(rows);summary['cardsTested']=len(deck);summary['envidoGateCases']=len(gate)
(OUT/'original-game-verification.json').write_text(json.dumps(summary,indent=2)+'\n')
print(f'Native verification: 40 cards, {len(rows)} hands, {cap_count} wager caps and 4 initial wagers.',flush=True)
