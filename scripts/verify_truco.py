#!/usr/bin/env python3
"""Generate isolated original Truco decisions."""
from original_native_truco import *
rng=random.Random(198510)
fixtures={'image_sha256':hashlib.sha256(image).hexdigest(),'cases':[]}
for entry in [0x5cd7,0x60f5,0x633a,0x2d06]:
 for _ in range(3000):
  strengths=[rng.randrange(1,15) for _ in range(3)];order=sorted(range(3),key=lambda i:(strengths[i],i));player=rng.randrange(30);cpu=rng.randrange(30)
  values={0x1d48:player,0x1d4a:cpu,0x1dee:order[0]+1,0x1df6:order[1]+1,0x1df0:order[2]+1,0x1d88:1 if entry==0x60f5 else 5 if entry==0x633a else 0,0x1d96:39,0x1d94:rng.randrange(34),0x1d6a:1 if entry==0x5cd7 else 0,0x1838:rng.randrange(1,15)}
  for i,strength in enumerate(strengths):values[0x1840+i*2]=strength;values[0x1852+i*2]=rng.randrange(1,11);values[0x184a+i*2]=rng.randrange(4);values[0x185a+i*2]=rng.randrange(8)
  tape=[rng.randrange(10)/10 for _ in range(20)]
  stop=run(entry,{0x671,0x74e1,0x93c3,0x8957,0x2c46,0x1b06,0x1c0a,0x19cc,0x8927,0x76fa},values,tape)
  fixtures['cases'].append(dict(entry=entry,values=values,random=tape,stop=stop,draws=state['draws'],result={at:read(at) for at in [0x1d88,0x1d70,0x1cc2,0x1d9c,0x1d86,0x1e46,0x1dac]}))
output=root/'web/scripts/fixtures/original-truco-fixtures.json';output.write_text(json.dumps(fixtures,separators=(',',':'))+'\n');print(len(fixtures['cases']))
