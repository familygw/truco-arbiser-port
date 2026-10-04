import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runDosMatch,replayDosMatch,DOS_MATCH_WATCH} from '../src/original-seeded-match.ts';
const fixtures=JSON.parse(fs.readFileSync(new URL('fixtures/original-seeded-matches.json',import.meta.url),'utf8'));
assert.deepEqual(DOS_MATCH_WATCH,fixtures.watch);
let eventCount=0,drawCount=0;
for(const c of fixtures.cases){
 eventCount+=c.events.length;drawCount+=c.randomCalls.length;
 const result=runDosMatch(c,c.inputs);
 assert.deepEqual(result.randomCalls,c.randomCalls,`every original RND call ${c.seed}`);
 assert.deepEqual(result.events,c.events,`native seeded match ${c.seed}`);
 assert.deepEqual(replayDosMatch(JSON.parse(JSON.stringify(result.replay))),result);
 assert.deepEqual(runDosMatch(c).replay.inputs,c.inputs,`demo policy ${c.seed}`);
 assert.equal(result.winner,c.winner);assert.deepEqual(result.score,c.score);
 assert.ok(result.score[result.winner]>=30);
}
const reference=JSON.parse(fs.readFileSync(new URL('../replays/dos-327680.json',import.meta.url),'utf8'));
assert.deepEqual(reference,runDosMatch({seed:327680,flor:true,cpuMano:true}).replay);
assert.throws(()=>runDosMatch({seed:-1,flor:true,cpuMano:false}));
assert.throws(()=>runDosMatch({seed:0,flor:true,cpuMano:false},[]));
assert.throws(()=>replayDosMatch({format:'truco-dos-replay',version:99}));
console.log(`${fixtures.cases.length} complete seeded DOS matches, ${eventCount} events and ${drawCount} RND calls: cards, commands, score, RNG state and 20 RAM fields agree at every event.`);
