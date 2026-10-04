import program from './original-match-program.json' with { type: 'json' };
import { OriginalTrucoMachine } from './original-truco-machine.ts';
import { OriginalRandom } from './original-random.ts';

export const DOS_MATCH_PROFILE = 'dos-silent-v1';
export const DOS_MATCH_WATCH = [0x1d48,0x1d4a,0x1d82,0x1d6a,0x1d88,0x1d86,0x1d9c,0x1d74,0x1d76,0x1d96,0x1d9e,0x1d50,0x1d52,0x1d6e,0x18bc,0x1dee,0x1df6,0x1df0,0x1d84,0x1e2c];
export type DosMatchOptions = {seed: number; flor: boolean; cpuMano: boolean};
export type DosMatchEvent = {address: number; draws: number; randomState: number; memory: number[]; cards?: number[]; voice?: number; input?: number; returnAddress?: number; playerSlot?: number; cpuSlot?: number; finishSource?: number; text?: string};
export type DosReplay = DosMatchOptions & {format: 'truco-dos-replay'; version: 1; profile: typeof DOS_MATCH_PROFILE; imageSha256: string; inputs: number[]};
export type DosRandomCall = {address: number; state: number};
export type DosMatchResult = {replay: DosReplay; events: DosMatchEvent[]; winner: 'player' | 'cpu'; score: {player: number; cpu: number}; draws: number; randomState: number; randomCalls: DosRandomCall[]};

/** Complete original control flow, including all presentation RNG calls.
 * DOS music and voice playback are disabled in this profile; random selection
 * still executes. Human commands enter the original graph at the parser return.
 * No modular web strategy, timing or Math.random participates in a replay.
 */
export function runDosMatch(options: DosMatchOptions, inputs?: readonly number[]): DosMatchResult {
  if(!Number.isInteger(options.seed)||options.seed<0||options.seed>0xffffff)throw Error('La semilla debe ser un entero entre 0 y 16777215.');
  const m=new OriginalTrucoMachine(0x8613,program);m.fullMatch=true;m.florEnabled=options.flor;
  m.run();m.ip=options.cpuMano?0x1609:0x1325;
  const random=new OriginalRandom(options.seed);let draws=0;let currentIp=0;const randomCalls:DosRandomCall[]=[];
  const next=()=>{draws++;const value=random.next();randomCalls.push({address:currentIp,state:random.state});return value;};
  const events: DosMatchEvent[]=[];const commands:number[]=[];
  const snapshot=(address:number):DosMatchEvent=>({address,draws,randomState:random.state,memory:DOS_MATCH_WATCH.map(at=>m.read(at))});
  m.onText=text=>{const e=snapshot(0x29d);e.text=text;events.push(e);};
  m.observer=ip=>{
    currentIp=ip;
    if(![0x192c,0x82c7,0x0691,0x87e8].includes(ip))return;
    const event=snapshot(ip);
    if(ip===0x192c)event.cards=[...Array.from({length:3},(_,i)=>m.read(0x1862+i*2)),...Array.from({length:3},(_,i)=>m.floats.getFloat32(0x186c+i*4,true))];
    if(ip===0x87e8)event.playerSlot=m.read(0x1d72);
    if(ip===0x0691)event.voice=m.read(0x1cc4);
    events.push(event);
  };
  const used=new Set<number>();let hand=0;let attempt:number|undefined;let before=0;
  for(let step=0;step<3000;step++) {
    const event=m.run(next);
    if(attempt!==undefined&&m.read(0x18bc)>before)used.add(attempt);
    attempt=undefined;
    const record=snapshot(event.address);if(event.kind==='card')record.cpuSlot=event.value;events.push(record);
    if(event.kind==='end') {
      record.finishSource=m.trace.at(-2);
      if(![0x1b22,0x1c26].includes(event.address))throw Error(`Final DOS inesperado: ${event.address.toString(16)}`);
      if(inputs&&commands.length!==inputs.length)throw Error('La transcripción contiene jugadas después del final de la partida.');
      const winner=event.address===0x1b22?'player':'cpu';
      const player=m.read(0x1d48)+(m.read(0x1d48)<30?m.read(0x1d9c):0);
      const cpu=m.read(0x1d4a)+(m.read(0x1d4a)<30?m.read(0x1d86)+(record.finishSource===0x45b3?m.read(0x1e2c):0):0);
      return {replay:{seed:options.seed,flor:options.flor,cpuMano:options.cpuMano,format:'truco-dos-replay',version:1,profile:DOS_MATCH_PROFILE,imageSha256:program.image_sha256,inputs:commands},events,winner,score:{player,cpu},draws,randomState:random.state,randomCalls};
    }
    if(event.kind==='invalid')throw Error(`El DOS rechazó la jugada ${commands.length} (mano ${hand}).`);
    if(event.kind==='input') {
      if(hand!==m.read(0x1d82)){used.clear();hand=m.read(0x1d82);}
      const returnAddress=m.stack.at(-1)!;
      // Demonstration policy: decline the CPU's opening tantos, accept its
      // Truco/Retruco raises and decline Vale 4, then play unused slots in their original deal order.
      const code=inputs?inputs[commands.length]:[0x23ec,0x5b6b].includes(returnAddress)?25:m.read(0x1d88)===10?25:[2,6].includes(m.read(0x1d88))?24:[9,10,11].find(c=>!used.has(c))??26;
      if(code===undefined)throw Error('La transcripción termina antes de completar la partida.');
      if(!Number.isInteger(code)||code<0||code>26)throw Error('Comando DOS inválido.');
      record.input=code;record.returnAddress=returnAddress;commands.push(code);
      if(code>=9&&code<=11){attempt=code;before=m.read(0x18bc);}
      m.write(0x1c98,code);
    }
    m.resume();
  }
  throw Error('La partida supera el límite de ejecución.');
}

export function replayDosMatch(value: unknown): DosMatchResult {
  const r=value as Partial<DosReplay>|null;
  if(!r||r.format!=='truco-dos-replay'||r.version!==1||r.profile!==DOS_MATCH_PROFILE||r.imageSha256!==program.image_sha256||typeof r.flor!=='boolean'||typeof r.cpuMano!=='boolean'||!Array.isArray(r.inputs)||r.inputs.length>3000)throw Error('Formato, perfil o binario de replay incompatible.');
  return runDosMatch({seed:r.seed!,flor:r.flor,cpuMano:r.cpuMano},r.inputs);
}
