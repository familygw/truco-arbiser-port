import fs from 'node:fs';
import assert from 'node:assert/strict';
import { OriginalTruco } from '../src/original-truco.ts';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/original-truco-rounds.json',import.meta.url)));
const suits=['espada','basto','oro','copa'];let events=0, earlyWins=0;
for(const c of f.cases){
 const cards=c.cards.map(i=>({suit:suits[i/10|0],rank:i%10<7?i%10+1:i%10+3}));let draws=0;const rnd=()=>c.random[draws++];
 const engine=new OriginalTruco(cards.slice(0,3),cards.slice(3),c.cpuMano,c.playerScore,c.cpuScore,rnd,m=>{m.florEnabled=c.florEnabled;for(const [at,value]of Object.entries(c.context ?? {}))m.write(Number(at),value)});
 for(let i=0;i<c.events.length;i++){
  const e=c.events[i];const m=engine.machine;
  assert.equal(engine.event.address,e.address,JSON.stringify({cards:c.cards,cpuMano:c.cpuMano,event:i,actual:engine.event,expected:e}));assert.equal(draws,e.draws);
  for(const [at,value]of Object.entries(e.memory))assert.equal(m.read(Number(at)),value,`${c.cards} event ${i} word ${Number(at).toString(16)}`);
  events++;
  if(i===c.events.length-1) {
    const base={player:c.context?.[0x1d9c]??0,cpu:c.context?.[0x1d86]??0};
    const award=engine.award(base);
    if(e.address===0x1c26 && m.read(0x1d84)===1) {
      assert.equal(award.winner,'cpu');
      assert.equal(award.points,e.memory[0x1e2c]);
      assert.ok(c.cpuScore+base.cpu+award.points>=30); earlyWins++;
    } else {
      assert.equal(award.points,e.memory[award.winner==='cpu'?0x1d86:0x1d9c]-base[award.winner]);
    }
  }
  if(i<c.events.length-1){if(e.input!==undefined)engine.answer(e.input);else engine.next();}
 }
}
console.log(`Truco: ${f.cases.length} manos completas y ${events} eventos y ${earlyWins} cierres anticipados coinciden con el binario.`);
