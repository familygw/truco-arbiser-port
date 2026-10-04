#!/usr/bin/env python3
"""Execute original Envido response with a supplied random tape.
Intercept only the verified 15-byte random helper call sequence; preserve control flow.
Stop before speech/point declaration, record the action and random draws consumed.
"""
from pathlib import Path
import hashlib,json,random,struct
from unicorn import Uc,UC_ARCH_X86,UC_MODE_16,UC_HOOK_CODE
from unicorn.x86_const import *
root=Path(__file__).resolve().parents[2];image=(root/'web/reverse-engineering/TRUCO.UNPACKED.BIN').read_bytes()
u=Uc(UC_ARCH_X86,UC_MODE_16);u.mem_map(0,0x100000);u.mem_write(0x10000,image);ds=0x1de20
state={}
def word(at,value):u.mem_write(ds+at,struct.pack('<H',value&65535))
def read(at):return struct.unpack('<H',u.mem_read(ds+at,2))[0]
def hook(uc,address,size,_):
 ip=address-0x10000
 state.setdefault('trace',[]).append(hex(ip))
 state['trace']=state['trace'][-80:]

 if ip in [0x1db2,0x1ea6,0x1f9c,0x208c,0x74e1]:
  state['action']= 'reject' if ip==0x1db2 else 'accept' if ip in [0x1ea6,0x1f9c,0x74e1] else {1:'envido',2:'real-envido',3:'dos-reales',5:'falta-envido'}[read(0x1dac)]
  uc.emu_stop();return
 b=bytes(uc.mem_read(address,15))
 if b[:3]==bytes.fromhex('cd 35 06') and b[5:12]==bytes.fromhex('cd 35 1e 92 1c cd 3d') and b[12]==0xe8:
  bound_at=int.from_bytes(b[3:5],'little');bound=struct.unpack('<f',uc.mem_read(ds+bound_at,4))[0]
  assert bound in [2,4,10,100],(hex(ip),bound)
  value=state['tape'][state['draws']];state['draws']+=1
  uc.reg_write(UC_X86_REG_AX,int(value*bound)+1);uc.reg_write(UC_X86_REG_IP,ip+15)
  state['sites'].append([hex(ip),int(bound)])
u.hook_add(UC_HOOK_CODE,hook)
def execute(context,tape):
 u.mem_write(ds+0x1d00,bytes(0x200))
 for at,key in [(0x1d74,'points'),(0x1c98,'incoming'),(0x1d48,'playerScore'),(0x1d4a,'cpuScore'),(0x1d6a,'cpuIsMano'),(0x1d78,'openingStarted'),(0x1dba,'playerAheadWithPending'),(0x1db0,'previousWager'),(0x1d50,'faltaCount')]:word(at,int(context[key]))
 wager=30 if context['incoming']==4 else context['previousWager']+[0,2,3,6][context['incoming']];word(0x1d8e,wager)
 for reg,val in [(UC_X86_REG_CS,0x1000),(UC_X86_REG_DS,0x1de2),(UC_X86_REG_ES,0x1de2),(UC_X86_REG_SS,0x4000),(UC_X86_REG_SP,0x1000),(UC_X86_REG_BP,0x1000),(UC_X86_REG_EFLAGS,2)]:u.reg_write(reg,val)
 state.clear();state.update(tape=tape,draws=0,sites=[],action=None)
 if context['playerScore']>=29 or context['cpuScore']>=29:state['action']='accept'
 else:u.emu_start(0x11ca1,0,count=2000)
 assert state['action'] is not None,(context,hex(u.reg_read(UC_X86_REG_IP)),state)
 return {'context':context,'random':tape,'action':state['action'],'draws':state['draws'],'sites':state['sites']}
generator=random.Random(73421);cases=[]
for points in range(34):
 for incoming in range(1,5):
  for _ in range(100):
   context=dict(points=points,incoming=incoming,playerScore=generator.choice([0,3,8,14,20,25,26,27,28,29]),cpuScore=generator.choice([0,3,8,14,20,25,26,27,28,29]),cpuIsMano=bool(generator.randrange(2)),openingStarted=bool(generator.randrange(2)),playerAheadWithPending=bool(generator.randrange(2)),previousWager=generator.choice([1,2,3,4,5,6,8,9]),faltaCount=generator.choice([0,1,2,3,4,5]))
   tape=[generator.choice([0,0.1,0.19,0.2,0.29,0.3,0.39,0.4,0.49,0.5,0.59,0.6,0.69,0.7,0.79,0.8,0.89,0.9,0.99]) for _ in range(12)]
   cases.append(execute(context,tape))
fixture={'image_sha256':hashlib.sha256(image).hexdigest(),'cases':cases,'scope':'response branch 1CA1 plus near-win bypass 1A35; RNG helper supplied, voice/points excluded'}
(root/'web/scripts/fixtures/original-envido-fixtures.json').write_text(json.dumps(fixture,separators=(',',':'))+'\n')
print('Original native Envido response:',len(cases),'cases recorded')
