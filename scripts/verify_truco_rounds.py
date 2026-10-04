#!/usr/bin/env python3
"""Differential complete-hand traces through original 8086 strategy and card branches.
Only graphics, voices and completed score settlement are replaced by host events.
"""
from pathlib import Path
import json,random,hashlib
from original_native_truco import *
rng=random.Random(198511);fixtures={'image_sha256':hashlib.sha256(image).hexdigest(),'cases':[]}
watch=[0x1d84,0x1e2c,0x1d48,0x1d4a,0x1d88,0x1d70,0x1d6e,0x18bc,0x187a,0x187c,0x187e,0x1dee,0x1df6,0x1df0,0x1d9c,0x1d86]
for case in range(3000):
 ids=rng.sample(range(40),6);mano=bool(case%2);enabled=case%4<2;player=rng.randrange(23 if case>=1200 else 30);cpu=rng.randrange(23 if case>=1200 else 30)
 strengths=[]
 for i in ids[3:]:
  rank=i%10+1;suit=i//10
  strength={4:1,5:2,6:3,8:5,9:6,10:7,3:10,2:9}.get(rank,12 if suit==0 else 11 if suit==2 else 4) if rank!=1 else 14 if suit==0 else 13 if suit==1 else 8
  strengths.append(strength)
 a,b,c=strengths
 order=([2,0,1] if c<a else [0,2,1] if c<b else [0,1,2]) if b>=a else ([2,1,0] if c<b else [1,2,0] if c<a else [1,0,2])
 values={0x1d48:player,0x1d4a:cpu,0x1d6a:int(mano),0x1d96:39,0x1e00:3,0x1f28:4,0x1dee:order[0]+1,0x1df6:order[1]+1,0x1df0:order[2]+1}
 for n in range(3):
  p,c=ids[n],ids[n+3];values[0x1c7c+n*2]=p%10+1;values[0x1c74+n*2]=p//10
  values[0x1840+n*2]=strengths[n];values[0x1852+n*2]=c%10+1;values[0x184a+n*2]=c//10;values[0x185a+n*2]=c%10+1 if c%10<7 else 0
  values[0x186c+n*4]=0;values[0x186e+n*4]=0x4248;values[0x1862+n*2]=50;values[0x1894+n*2]=8;values[0x189c+n*2]=4;values[0x18a4+n*2]=8
 context={}
 if case>=1200:
  cpuIds=ids[3:];pip=[i%10+1 if i%10<7 else 0 for i in cpuIds];same=len({i//10 for i in cpuIds})==1
  cp=max(pip)
  for i in range(3):
   for j in range(i+1,3):
    if cpuIds[i]//10==cpuIds[j]//10:cp=pip[i]+pip[j]+20
  cpFlor=20+sum(pip) if same else 0
  isFlor=same and enabled
  cp=cpFlor if isFlor else cp
  claim=rng.randrange(20,39) if isFlor and not mano else rng.randrange(39 if isFlor else 34)
  wager=rng.randrange(1,7);wins=claim>cp if mano else claim>=cp
  context={0x1d94:cp,0x1d96:0 if mano and not wins else claim,0x1da2:1,0x1d9c:wager if wins else 0,0x1d86:0 if wins else wager,0x1d74:0 if isFlor else cp,0x1d76:cpFlor if isFlor else 0,0x1dde:int(isFlor),0x1de0:50 if isFlor else 0}
  values.update(context)
 tape=[rng.randrange(100)/100 for _ in range(100)];events=[];used=set();asked=False;invalid=False
 stops={0x8957,0x93c3,0x671,0x1c26,0x1b15,0x2c46,0x1b06,0x1c0a,0x19cc,0x8927}
 stop=run(0x2b79,stops,values,tape,enabled,round_mode=True)
 for step in range(50):
  attemptedSlot=None;beforePlayerCards=read(0x18bc)
  event=dict(address=stop,draws=state['draws'],memory={at:read(at) for at in watch})
  if stop==0x671 and read(0x1cc2) not in [7,8,9]:pass
  else:
   events.append(event)
   if stop in [0x1c26,0x1b15,0x2c46,0x1b06,0x1c0a,0x19cc]:break
   if stop==0x8927:invalid=True
   if stop==0x8957:
    bid=read(0x1d88)
    if case>=2400 and beforePlayerCards>=case%3:code=26
    elif bid in [2,6,10]:
     code=24
     if case%5==0:code=25
     elif case%5==1 and bid<10 and not invalid:
      code=19 if bid==2 else 23
      slot=next((i for i in [1,2,3] if i not in used),None)
      if case%2==0 and slot is not None:attemptedSlot=slot;code=(15 if bid==2 else 19)+slot
    elif not asked and case%3==0:
     code=15;asked=True
     if case%2==0:
      slot=next(i for i in [1,2,3] if i not in used);attemptedSlot=slot;code=11+slot
    else:
     slot=next(i for i in [1,2,3] if i not in used);attemptedSlot=slot;code=8+slot
    event['input']=code;word(0x1c98,code)
  sp=u.reg_read(UC_X86_REG_SP);target=int.from_bytes(u.mem_read(0x40000+sp,2),'little');u.reg_write(UC_X86_REG_SP,sp+2);u.reg_write(UC_X86_REG_IP,target)
  state['stop']=None;u.emu_start(0x10000+target,0,count=8000);stop=state['stop'];assert stop is not None,state
  if attemptedSlot is not None and read(0x18bc)>beforePlayerCards:used.add(attemptedSlot)
 else:raise AssertionError((case,[(hex(e['address']),e.get('input'),e['memory'][0x1d88]) for e in events],state))
 fixtures['cases'].append(dict(cards=ids,cpuMano=mano,playerScore=player,cpuScore=cpu,random=tape,events=events,context=context,florEnabled=enabled))
output=root/'web/scripts/fixtures/original-truco-rounds.json';output.write_text(json.dumps(fixtures,separators=(',',':'))+'\n');print(len(fixtures['cases']),'native hands')
