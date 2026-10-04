#!/usr/bin/env python3
"""Decode reachable QuickBASIC game decisions, including inline ON GOTO tables.
UI/runtime boundaries remain explicit; no executable is distributed or patched.
"""
from pathlib import Path
from capstone import *
import json,hashlib,struct,base64,sys
root=Path(__file__).resolve().parents[2];image=(root/'web/reverse-engineering/TRUCO.UNPACKED.BIN').read_bytes()
cs=Cs(CS_ARCH_X86,CS_MODE_16)
# Graphics, audio, parser and completed-hand boundaries are supplied by the host.
boundaries={0x29d,0x99f,0x671,0x74e1,0x8957,0x8927,0x92a8,0x93c3,0x7b86,0x81ab,0x72a8,0x851,0xb874,0x76fa,0x661}
ends={0x1c26,0x1b15,0x2c46,0x1b06,0x1c0a,0x19cc,0x1325,0x1609}
match='--match' in sys.argv
# Ranges contain only rendering/delay code; none calls RND, RANDOMIZE or CADA.
render_ranges={0x132b:0x134f,0x136c:0x137b,0x143e:0x1612,0x1729:0x175c,
 0x8297:0x82b9,0x82c7:0x8325,0x8339:0x84de,0x779a:0x77a9}
if match:
 boundaries={0x29d,0x8957,0x8927,0x92a8,0x93c3,0x72a8,0x851,0x661}
 ends={0x1c26,0x1b22}
program={};pending=[0x2b79,0x8613,0x960a,0x2c97,0x5cd7,0x60f5,0x633a]
if match:pending += [0x1325,0x81ab,0x671,0x74e1,0x76fa,0x7b86,0xbc76]
while pending:
 ip=pending.pop()&65535
 if ip in program or ip in boundaries or ip in ends:continue
 if match and ip in render_ranges:
  target=render_ranges[ip];program[ip]=[target,'jmp',hex(target)];pending.append(target);continue
 b=image[ip:ip+15]
 if b[:3]==bytes.fromhex('cd3506') and b[5:12]==bytes.fromhex('cd351e921ccd3d') and b[12]==0xe8:
  bound=struct.unpack('<f',image[0xde20+int.from_bytes(b[3:5],'little'):0xde24+int.from_bytes(b[3:5],'little')])[0]
  program[ip]=[ip+15,'random',str(int(bound))];pending.append(ip+15);continue
 if b[0]==0xcd and 0x34<=b[1]<=0x3b:
  # Decode software x87 at the same length (WAIT prefix replaces interrupt byte).
  patched=bytes([0x9b,0xd8+b[1]-0x34])+b[2:]
  decoded=list(cs.disasm(patched,ip,count=2));ins=decoded[1]
  length=ins.size+1;name=ins.mnemonic;args=ins.op_str
 elif b[:2]==b'\xcd\x3d':length=2;name='nop';args=''
 else:
  ins=next(cs.disasm(b,ip,count=1));length=ins.size;name=ins.mnemonic;args=ins.op_str
 nextip=ip+length
 if name=='lcall' and args=='0xd41, 0x209':
  count=image[nextip];targets=[int.from_bytes(image[nextip+1+i*2:nextip+3+i*2],'little') for i in range(count)]
  program[ip]=[nextip+1+count*2,'dispatch',targets];pending.extend(targets);pending.append(nextip+1+count*2);continue
 program[ip]=[nextip,name,args]
 if name in ['jmp','call']:
  target=int(args,16)&65535;pending.append(target)
  if name=='call':pending.append(nextip)
 elif name.startswith('j') or name.startswith('loop'):
  pending.extend([int(args,16)&65535,nextip])
 elif name not in ['ret','retf']:pending.append(nextip)
output=root/('web/src/original-match-program.json' if match else 'web/src/original-truco-program.json')
floats={}
for _,name,args in program.values():
 if name in ['fld','fmul','fdiv','fadd'] and args.startswith('dword ptr [0x'):
  at=int(args[args.index('[')+1:args.index(']')],16);floats[at]=struct.unpack('<f',image[0xde20+at:0xde24+at])[0]
opcodes=sorted({v[1] for v in program.values()});pool=[];pool_index={};rows=[]
for ip,(nextip,name,args) in sorted(program.items()):
 key=json.dumps(args)
 if key not in pool_index:pool_index[key]=len(pool);pool.append(args)
 rows.append([ip,nextip,opcodes.index(name),pool_index[key]])
strings={}
if match:
 for at in range(0x1f70,len(image)-0xde20-4):
  length,ptr=struct.unpack_from('<HH',image,0xde20+at)
  if ptr==at+4 and 0<length<=4096 and 0xde20+ptr+length<=len(image):
   data=image[0xde20+ptr:0xde20+ptr+length]
   if all(v in [9,10,13] or 32<=v<127 for v in data):strings[at]=data.decode('ascii')
 voices=[(root/'MVYTRUC@').read_bytes()[i*180:(i+1)*180].decode('cp437') for i in range(156)]
else:voices=[]
output.write_text(json.dumps({'strings':strings,'voices':voices,'floats':floats,'image_sha256':hashlib.sha256(image).hexdigest(),'boundaries':sorted(boundaries),'ends':sorted(ends),'opcodes':opcodes,'operands':pool,'rowsEncoded':base64.b64encode(b''.join(struct.pack('<4H',*row) for row in rows)).decode()},separators=(',',':'))+'\n')
from collections import Counter
print(len(program),Counter(v[1] for v in program.values()))
