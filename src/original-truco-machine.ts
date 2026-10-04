import { originalDosPhrase } from './original-phrase.ts';
import program from './original-truco-program.json' with { type: 'json' };
/** A small interpreter for the recovered 8086 decision graph. UI and BRUN40
 * calls are explicit boundaries. Unsupported instructions fail visibly. */
export type OriginalTrucoEvent = { kind: 'input' | 'call' | 'card' | 'end' | 'invalid' | 'tanto'; address: number; value?: number };
type RecoveredProgram=typeof program & {strings?:Record<string,string>;voices?:string[]};
function decode(program: RecoveredProgram) {
const instructions: Record<number, [number, string, string | number[]]> = {};
// Four little-endian uint16 fields per row: address, successor, opcode, operands.
const encodedRows = Uint8Array.from(atob(program.rowsEncoded), c => c.charCodeAt(0));
const rows = new DataView(encodedRows.buffer);
for (let i=0;i<encodedRows.length;i+=8) {
  const ip=rows.getUint16(i,true), next=rows.getUint16(i+2,true), opcode=rows.getUint16(i+4,true), operand=rows.getUint16(i+6,true);
  instructions[ip] = [next,program.opcodes[opcode],program.operands[operand]];
}
return instructions;
}
const defaultInstructions=decode(program);
const signed = (v: number) => v & 0x8000 ? (v & 65535) - 65536 : v & 65535;
export class OriginalTrucoMachine {
  memory = new Uint16Array(32768);
  regs: Record<string, number> = { ax: 0, bx: 0, cx: 0, dx: 0, si: 0, di: 0, bp: 0x1000, sp: 0x1000 };
  ip: number;
  stack: number[] = [];
  fp: number[] = [];
  florEnabled = false;
  zero = false; less = false; carry = false;
  trace: number[] = [];
  observer?: (address: number) => void;
  private program: RecoveredProgram;
  strings=new Map<number,string>();
  onText?: (text:string)=>void;
  private procedureFrames:{returnAddress:number;regs:Record<string,number>}[]=[];
  private tempString=0xf000;
  private string(at:number){return this.strings.get(at)??"";}
  private allocateString(text:string){this.tempString=(this.tempString+2)&65535;this.strings.set(this.tempString,text);return this.tempString;}
  private instructions: typeof defaultInstructions;
  fullMatch = false;
  stops = new Set<number>();
  floats = new DataView(this.memory.buffer);
  constructor(entry = 0x2b79, recovered:RecoveredProgram = program) {
    this.program=recovered;this.instructions=recovered===program?defaultInstructions:decode(recovered);
    this.ip = entry;
    for(const [at,text]of Object.entries(recovered.strings??{}))this.strings.set(Number(at),text);
    this.strings.set(0x1d3e,"jugador");this.strings.set(0x1c8a,"quiero");this.strings.set(0x1c8e,"no quiero");
    for (const [address,value] of Object.entries(recovered.floats)) this.floats.setFloat32(Number(address),value,true);
  }
  read(address: number) { return this.memory[(address & 65535) >>> 1]; }
  write(address: number, value: number) { this.memory[(address & 65535) >>> 1] = value & 65535; }
  private address(operand: string) {
    const content = operand.slice(operand.indexOf('[') + 1, operand.indexOf(']'));
    return content.replace(/-/g, '+-').split('+').reduce((sum, term) => {
      const t = term.trim(); return sum + (t in this.regs ? this.regs[t] : t.startsWith('-0x') ? -Number(t.slice(1)) : Number(t));
    }, 0) & 65535;
  }
  private get(operand: string): number {
    if (operand.includes('[')) return this.read(this.address(operand));
    if (operand in this.regs) return this.regs[operand];
    if (/^[abcd][hl]$/.test(operand)) return this.regs[operand[0]+'x'] >>> (operand[1] === 'h' ? 8 : 0) & 255;
    return (operand.startsWith('-0x') ? -Number(operand.slice(1)) : Number(operand)) & 65535;
  }
  private set(operand: string, value: number) {
    if (operand.includes('[')) this.write(this.address(operand), value);
    else if (operand in this.regs) this.regs[operand] = value & 65535;
    else if (/^[abcd][hl]$/.test(operand)) {
      const reg = operand[0]+'x'; const shift = operand[1] === 'h' ? 8 : 0;
      this.regs[reg] = this.regs[reg] & ~(255 << shift) | (value & 255) << shift;
    } else throw Error(`Unsupported destination ${operand}`);
  }
  private flags(value: number, a = value, b = 0, compare = false) {
    this.zero = (value & 65535) === 0;
    this.less = compare ? signed(a) < signed(b) : signed(value) < 0;
    this.carry = compare ? a < b : value < 0 || value > 65535;
  }
  /** Resume after a UI boundary. The return address has already been saved. */
  resume() { if (!this.stack.length) throw Error('Missing original RETURN'); this.ip = this.stack.pop()!; }
  run(random = Math.random): OriginalTrucoEvent {
    for (let step = 0; step < 20000; step++) {
      const ip = this.ip;
      this.observer?.(ip);
      this.trace.push(ip); if (this.trace.length > 40) this.trace.shift();
      if (this.stops.has(ip)) return {kind:'end',address:ip};
      if (this.program.ends.includes(ip)) return { kind: ip === 0x19cc ? 'tanto' : 'end', address: ip };
      if (ip === 0x8957) return { kind: 'input', address: ip };
      if (ip === 0x93c3) return { kind: 'card', address: ip, value: this.read(0x1d70) };
      if (ip === 0xbd && this.fullMatch) { this.observer?.(0xc2);this.regs.ax=Math.floor(random()*this.floats.getFloat32(0x1c92,true))+1;this.resume();continue; }
      if (ip === 0x671 && !this.fullMatch) {
        const group = this.read(0x1cc2);
        if (group >= 7 && group <= 9) return { kind: 'call', address: ip, value: group - 5 };
        this.resume(); continue;
      }
      if (ip === 0x8927) { return { kind: 'invalid', address: ip }; }
      if(ip===0x29d&&this.fullMatch) {
        const text=originalDosPhrase(this.string(0x1ca8),()=>{this.observer?.(0xc9e5);return random();});
        this.strings.set(0x1ca8,text);this.onText?.(text);this.resume();continue;
      }
      if (this.program.boundaries.includes(ip)) { this.resume(); continue; }
      const instruction = this.instructions[ip];
      if (!instruction) throw Error(`Missing original instruction ${ip.toString(16)} (${this.trace.map(x=>x.toString(16)).join(' ')})`);
      const [next, opcode, raw] = instruction;
      this.ip = next;
      if (opcode === 'dispatch') {
        const targets = raw as number[]; const index = this.regs.bx;
        if (index > 0 && index <= targets.length) this.ip = targets[index-1];
        continue;
      }
      const args = (raw as string).split(', ').filter(Boolean);
      const a = args[0] ? this.get(args[0]) : 0; const b = args[1] ? this.get(args[1]) : 0;
      switch (opcode) {
        case 'lea': this.set(args[0],this.address(args[1]));break;
        case 'retf': {const frame=this.procedureFrames.pop();if(!frame)throw Error('Missing original procedure frame');const value=this.regs.ax;this.regs=frame.regs;this.regs.ax=value;this.ip=frame.returnAddress;break;}
        case 'mov': this.set(args[0], b); break;
        case 'cmp': this.flags(a-b,a,b,true); break;
        case 'and': case 'or': case 'xor': {
          const v = opcode === 'and' ? a & b : opcode === 'or' ? a | b : a ^ b;
          this.set(args[0],v); this.flags(v); this.carry=false; break;
        }
        case 'add': case 'sub': { const v = opcode === 'add' ? a+b : a-b; this.set(args[0],v); this.flags(v); break; }
        case 'inc': case 'dec': { const v=a+(opcode==='inc'?1:-1); this.set(args[0],v); const c=this.carry; this.flags(v); this.carry=c; break; }
        case 'shl': { const v=a<<b; this.set(args[0],v); this.flags(v); break; }
        case 'cdq': this.regs.dx=signed(this.regs.ax)<0?65535:0;break;
        case 'idiv': {const dividend=(signed(this.regs.dx)*65536)+this.regs.ax;const divisor=signed(a);this.regs.ax=Math.trunc(dividend/divisor)&65535;this.regs.dx=(dividend%divisor)&65535;break;}
        case 'imul': { const v=signed(this.regs.ax)*signed(a); this.regs.ax=v&65535; this.regs.dx=v>>16&65535; break; }
        case 'push': this.stack.push(a); this.regs.sp-=2; break;
        case 'call': this.stack.push(next); this.ip=a; break;
        case 'ret': if (!this.stack.length) return {kind:'end',address:ip}; this.ip=this.stack.pop()!; break;
        case 'jmp': this.ip=a; break;
        case 'je': if(this.zero)this.ip=a;break;
        case 'jne': if(!this.zero)this.ip=a;break;
        case 'jl': if(this.less)this.ip=a;break;
        case 'jle': if(this.less||this.zero)this.ip=a;break;
        case 'jg': if(!this.less&&!this.zero)this.ip=a;break;
        case 'jge': if(!this.less)this.ip=a;break;
        case 'jb': if(this.carry)this.ip=a;break;
        case 'ja': if(!this.carry&&!this.zero)this.ip=a;break;
        case 'jae': if(!this.carry)this.ip=a;break;
        case 'jbe': if(this.carry||this.zero)this.ip=a;break;
        case 'random': if(this.fullMatch)this.observer?.(0xc2);this.regs.ax=Math.floor(random()*Number(raw))+1;break;
        case 'nop': break;
        case 'fld': this.fp.push(this.floats.getFloat32(this.address(args[0]),true));break;
        case 'fstp': this.floats.setFloat32(this.address(args[0]),this.fp.pop()!,true);break;
        case 'fmul': case 'fdiv': case 'fadd': {
          const f=this.floats.getFloat32(this.address(args[0]),true);const index=this.fp.length-1;
          this.fp[index]=opcode==='fmul'?this.fp[index]*f:opcode==='fdiv'?this.fp[index]/f:this.fp[index]+f;break;
        }
        case 'lcall': {
          const offset = Number(args[1]);
          if(this.fullMatch && [0x185,0x188,0xf8,0x10d,0xbf,0x1a3,0x1a9,0x3b0,0x224].includes(offset)&&Number(args[0])===0xd41) {
            const count=offset===0x3b0||offset===0xbf?3:offset===0x1a3||offset===0x224?1:2;
            const values=this.stack.splice(-count);
            if(offset===0x185)this.strings.set(values[1],this.string(values[0]));
            else if(offset===0x188)this.regs.ax=this.allocateString(this.string(values[0])+this.string(values[1]));
            else if(offset===0xf8)this.regs.ax=this.string(values[0]).indexOf(this.string(values[1]))+1;
            else if(offset===0x10d)this.regs.ax=this.allocateString(this.string(values[0]).slice(0,values[1]));
            else if(offset===0xbf)this.regs.ax=this.allocateString(this.string(values[0]).slice(Math.max(0,values[1]-1),Math.max(0,values[1]-1)+values[2]));
            else if(offset===0x1a3)this.regs.ax=this.allocateString(`${signed(values[0])>=0?' ':''}${signed(values[0])}`);
            else if(offset===0x1a9){const data=new DataView(new ArrayBuffer(4));data.setUint16(0,values[0],true);data.setUint16(2,values[1],true);const n=data.getFloat32(0,true);this.regs.ax=this.allocateString(`${n>=0?' ':''}${Number(n.toPrecision(7))}`);}
            else if(offset===0x224)this.regs.ax=values[0];
            else this.strings.set(0x1ca0,this.program.voices?.[values[2]-1]??'');
            continue;
          }
          if(this.fullMatch && Number(args[0])===0 && offset===0xbc6e){this.procedureFrames.push({returnAddress:next,regs:{...this.regs}});this.regs.bp=0xc000;this.regs.sp=0xbfc0;this.ip=0xbc76;continue;}
          if(this.fullMatch && offset===0x1ee)continue;
          if (this.fullMatch && Number(args[0])===0) {
            const count=({0xc8b4:1,0xc279:1,0xba42:3,0xcc77:0,0xbb36:1,0xcada:1,0xbae0:1,0xcbd4:2} as Record<number,number>)[offset];
            if(count===undefined)throw Error(`Unsupported match helper ${offset.toString(16)} at ${ip.toString(16)}`);
            if(offset===0xcada){this.observer?.(0xcae2);this.regs.ax=Math.floor(random()*this.read(this.stack.at(-1)!))+1;}
            this.stack.splice(this.stack.length-count,count);continue;
          }
          if(this.fullMatch && offset===0x3f8) {this.floats.setFloat32(0x1800,random(),true);this.regs.ax=0x1800;continue;}
          if(this.fullMatch && [0x1a0,0x3b0,0xf8,0x10d,0x152,0x155,0x161,0xe6,0x2ce,0x2d4,0x2cb].includes(offset)) {
            const count=offset===0x3b0?3:offset===0xf8?2:offset===0x10d?2:offset===0x2ce||offset===0x2d4?2:offset===0x2cb?3:1;
            this.stack.splice(-count);continue;
          }
          if (offset === 0x274) this.fp[this.fp.length-1]=Math.floor(this.fp.at(-1)!);
          else if (offset === 0x260) this.regs.ax=Math.round(this.fp.pop()!)&65535;
          else if (offset === 0x258) this.fp.push(signed(this.regs.ax));
          else if (offset === 0x220) {
            const literal=this.stack.at(-1);
            if (literal !== 0x24ec && literal !== 0x24f2) throw Error(`Unsupported string comparison at ${ip.toString(16)}`);
            this.zero=this.florEnabled === (literal===0x24ec); this.stack.splice(-2);this.regs.sp+=4;
          }
          else if (offset === 0x234) { const right=this.fp.pop()!; const left=this.fp.pop()!;this.zero=right===left;this.less=right<left;this.carry=this.less; }
          else if ([0x185,0x188,0x1a3,0x1a9,0xbf].includes(offset)) { const count=offset===0x1a3?1:offset===0xbf?3:2;this.stack.splice(-count);this.regs.sp+=count*2; }
          else throw Error(`Unsupported original runtime ${offset.toString(16)} at ${ip.toString(16)}`);
          break;
        }
        default: throw Error(`Unsupported original opcode ${opcode} at ${ip.toString(16)}`);
      }
    }
    throw Error('Original decision limit exceeded');
  }
}
