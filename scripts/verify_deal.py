#!/usr/bin/env python3
"""Execute both original rejection-sampling deal loops, including duplicate retries."""
import json,random,struct
from original_native_truco import *
rng=random.Random(13811612);cases=[]
for n in range(2000):
 # Exactly representable QB RND results; occasional repeats exercise rejection.
 tape=[rng.randrange(1<<24)/(1<<24) for _ in range(80)]
 if n%2==0:tape[1:4]=[tape[0]]*3
 values={0x1862:50,0x1864:50,0x1866:50,0x186e:0x4248,0x1872:0x4248,0x1876:0x4248}
 run(0x1381,{0x143e},values,tape,deal_mode=True)
 player=[read(a) for a in [0x1862,0x1864,0x1866]]
 state['stops']={0x1729};state['stop']=None
 u.emu_start(0x11612,0,count=4000)
 assert state['stop']==0x1729
 cpu=[int(struct.unpack('<f',u.mem_read(ds+a,4))[0]) for a in [0x186c,0x1870,0x1874]]
 cases.append({'tape':tape[:state['draws']],'player':player,'cpu':cpu,'draws':state['draws']})
(root/'web/scripts/fixtures/original-deal.json').write_text(json.dumps(cases,separators=(',',':')))
print(f'Native TRUCO: {len(cases)} deals, including 1000 forced duplicate retries.')
