import { OriginalTrucoMachine, type OriginalTrucoEvent } from './original-truco-machine.ts';
import { originalCardStrength, originalCpuOrder } from './original-game-logic.ts';
type Card = { rank: number; suit: "espada" | "basto" | "oro" | "copa" };
const suits = ['espada','basto','oro','copa'];
/** Persistent native decision state: every card and answer resumes the original
 * branch, retaining inference, bluff and raise flags across all three tricks. */
export class OriginalTruco {
  machine: OriginalTrucoMachine;
  event: OriginalTrucoEvent;
  private random: () => number;
  constructor(player: readonly Card[], cpu: readonly Card[], cpuMano: boolean, playerScore: number, cpuScore: number, random = Math.random, prepare?: (machine: OriginalTrucoMachine) => void) {
    this.random=random;
    this.machine=new OriginalTrucoMachine(0x8613);
    this.machine.run();
    const m=this.machine;
    m.write(0x1d48,playerScore);m.write(0x1d4a,cpuScore);m.write(0x1d6a,Number(cpuMano));
    m.write(0x1d88,0);m.write(0x1d6e,0);m.write(0x18bc,0);
    for(let i=0;i<3;i++) {
      const p=player[i],c=cpu[i];
      m.write(0x1c7c+i*2,p.rank>7?p.rank-2:p.rank);m.write(0x1c74+i*2,suits.indexOf(p.suit));
      m.write(0x1840+i*2,originalCardStrength(c));m.write(0x1852+i*2,c.rank>7?c.rank-2:c.rank);m.write(0x184a+i*2,suits.indexOf(c.suit));m.write(0x185a+i*2,c.rank<=7?c.rank:0);
    }
    const order=originalCpuOrder(cpu.map(originalCardStrength) as [number,number,number]);
    m.write(0x1dee,order[0]+1);m.write(0x1df6,order[1]+1);m.write(0x1df0,order[2]+1);
    prepare?.(m);
    m.ip=0x2b79;
    this.event=m.run(random);
  }
  /** Terminal CS:45B3 jumps straight to CPU match victory without banking
   * the last Truco in 1D86. CS:3BA5 supplies that stake in 1E2C. */
  award(base: { player: number; cpu: number }) {
    if (this.event.kind !== 'end') throw Error('Original hand is still playing');
    const player=this.machine.read(0x1d9c)-base.player;
    let cpu=this.machine.read(0x1d86)-base.cpu;
    if (this.event.address===0x1c26 && this.machine.read(0x1d84)===1 && cpu===0) cpu=this.machine.read(0x1e2c);
    if (player>0 && cpu===0) return { winner: 'player' as const, points: player };
    if (cpu>0 && player===0) return { winner: 'cpu' as const, points: cpu };
    throw Error(`Unsupported original award: player=${player}, cpu=${cpu}`);
  }
  next(random = this.random) { this.machine.resume();return this.event=this.machine.run(random); }
  answer(code: number, random = this.random) {
    // Voice boundaries finish before the original parser waits for an answer.
    while(this.event.kind==='call') this.next(random);
    if(this.event.kind!=='input') throw Error(`Original Truco is not awaiting an answer (${this.event.kind})`);
    this.machine.write(0x1c98,code);
    return this.next(random);
  }
}
