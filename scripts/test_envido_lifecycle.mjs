import assert from 'node:assert/strict';
import fs from 'node:fs';
import { originalCpuEnvidoOpening, originalCpuEnvidoCounterResponse, originalEnvidoDeclaration, originalEnvidoAudit, originalEnvidoRaiseAllowed, originalEnvidoRaisedWager, originalEnvidoForcedAcceptance, originalEnvidoClosure } from '../src/original-envido-lifecycle.ts';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/envido-lifecycle-fixtures.json', import.meta.url)));
let failures = 0;
let group = "", counts = {};
function compare(actual, expected, c) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    counts[group] = (counts[group] || 0) + 1;
    failures++;
    if (counts[group] <= 3) console.log(JSON.stringify({ c, actual, expected }));
  }
}
group = "openings";
for (const c of fixture.openings) {
  let draws = 0;
  const actual = originalCpuEnvidoOpening(c.context, () => c.random[draws++]);
  compare({...actual, draws}, {action:c.action,strategyRoll:c.strategyRoll > 32767 ? c.strategyRoll-65536 : c.strategyRoll,draws:c.draws}, c);
}
group = "counters";
for (const c of fixture.counters) {
  let draws = 0;
  const actual = originalCpuEnvidoCounterResponse(c.context,c.strategyRoll,c.currentWager,() => c.random[draws++]);
  compare({...actual, draws}, {action:c.action,strategyRoll:c.nextStrategyRoll > 32767 ? c.nextStrategyRoll-65536 : c.nextStrategyRoll,draws:c.draws}, c);
}
group = "declarations";
for (const [mano, actual, claim, winner, auditClaim] of fixture.declarations) {
  compare(originalEnvidoDeclaration(actual,claim,!!mano), {winner,auditClaim}, [mano,actual,claim]);
}
const suits = ['espada','basto','oro','copa'];
group = "audits";
for (const c of fixture.audits) {
  const cards=c.cards.map(i => ({suit:suits[Math.floor(i/10)],rank:i%10<7?i%10+1:i%10+3}));
  compare(originalEnvidoAudit(cards,c.claim,c.cpuActual,c.cpuIsMano,c.florEnabled,c.wager), {playerPoints:c.playerPoints,cpuPoints:c.cpuPoints,penalized:c.penalized},c);
}
group = "transitions";
const calls = {1:"envido",2:"real-envido",3:"dos-reales",4:"falta-envido",5:"falta-envido"};
for (const [origin, previous, last, incoming, valid, wager, prior, faltas] of fixture.transitions) {
  const allowed = originalEnvidoRaiseAllowed(previous,calls[last],calls[incoming],origin);
  compare(allowed, valid, [origin, previous, last, incoming]);
  if (valid) {
    compare(originalEnvidoRaisedWager(previous,calls[incoming]), wager, [origin,previous,last,incoming]);
    assert.equal(prior, previous);
    assert.equal(faltas, origin === "cpu" && incoming === 4 ? 1 : 0);
  }
}
for (const [previous,current,player,cpu,forced] of fixture.rejectCaps) assert.equal(originalEnvidoForcedAcceptance(previous,current,player,cpu),forced);
const { allowedEnvidoRaises } = await import('../src/bids.ts');
assert.deepEqual(allowedEnvidoRaises(['dos-reales']), ['dos-reales','falta-envido']);
assert.deepEqual(allowedEnvidoRaises(['envido','envido','envido']), ['envido','real-envido','dos-reales','falta-envido']);
assert.deepEqual(allowedEnvidoRaises(['real-envido','real-envido','real-envido']), ['real-envido','dos-reales','falta-envido']);
assert.deepEqual(allowedEnvidoRaises(Array(15).fill('envido'),'player'), []);
assert.deepEqual(allowedEnvidoRaises(Array(15).fill('envido'),'cpu'), ['envido','real-envido','dos-reales','falta-envido']);
group = "closures";
for (const c of fixture.closures) {
  const cards=c.cards.map(i => ({suit:suits[Math.floor(i/10)],rank:i%10<7?i%10+1:i%10+3}));
  const { immediate, ...actual } = originalEnvidoClosure(cards,c.claim,c.cpuActual,c.cpuIsMano,c.florEnabled,c.wager,c.playerScore,c.cpuScore);
  compare(actual,{matchWinner:c.matchWinner,playerPoints:c.playerPoints,cpuPoints:c.cpuPoints},c);
}
assert.equal(failures,0);
console.log(`Envido lifecycle: ${fixture.openings.length} openings, ${fixture.counters.length} counters, ${fixture.declarations.length} declarations, ${fixture.audits.length} audits, ${fixture.transitions.length} transitions, ${fixture.rejectCaps.length} forced-acceptance cases, ${fixture.closures.length} closures OK`);
