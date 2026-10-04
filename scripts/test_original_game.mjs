import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { originalCardStrength, originalCpuOrder, originalHandPoints, originalWagerCap, originalInitialEnvidoWager, originalCpuEnvidoGate } from "../src/original-game-logic.ts";
import { acceptedEnvidoPoints, faltaEnvidoPoints, rejectedEnvidoPoints } from "../src/bids.ts";
import { envidoPoints, florPoints, trucoStrength, orderedCpuCards } from "../src/game.ts";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/original-game-fixtures.json", import.meta.url)));
for (const card of fixture.deck) { assert.equal(originalCardStrength(card), card.strength, card.id); assert.equal(trucoStrength(card), card.strength, card.id); }
for (const row of fixture.hands) {
  const cards = row.slice(0, 3).map((id) => fixture.deck[id]);
  const name = cards.map((card) => card.id).join(", ");
  assert.deepEqual(orderedCpuCards(cards).map((card) => cards.indexOf(card)), row.slice(3, 6), `port order: ${name}`);
  assert.equal(envidoPoints(cards), row[8], `port envido: ${name}`);
  assert.equal(florPoints(cards), row[7], `port flor: ${name}`);
  assert.deepEqual(originalCpuOrder(cards.map(originalCardStrength)), row.slice(3, 6), `order: ${name}`);
  assert.deepEqual(originalHandPoints(cards, true), { envido: row[6], flor: row[7] }, `Flor on: ${name}`);
  assert.deepEqual(originalHandPoints(cards, false), { envido: row[8], flor: row[9] }, `Flor off: ${name}`);
}
for (let player = 0; player < 30; player++) for (let cpu = 0; cpu < 30; cpu++) for (let stake = 1; stake <= 30; stake++) {
  assert.equal(originalWagerCap(stake, player, cpu), Math.min(stake, 30 - Math.max(player, cpu)));
}
assert.deepEqual([1, 2, 3, 4].map(originalInitialEnvidoWager), fixture.initialEnvidoWagers);
assert.equal(faltaEnvidoPoints(3, 5), 25);
assert.equal(faltaEnvidoPoints(14, 14), 16);
assert.equal(faltaEnvidoPoints(18, 20), 10);
assert.equal(acceptedEnvidoPoints(["real-envido", "real-envido"], 28, 27), 2);
assert.equal(rejectedEnvidoPoints(["real-envido", "real-envido", "falta-envido"], 28, 27), 2);
console.log(`Original DOS differential fixtures: 40 cards, ${fixture.hands.length} hands (both Flor modes), ${fixture.nativeCapCases} wager caps, 4 initial wagers OK`);

let gateIndex = 0;
for (let points = 0; points < 34; points++) for (let player = 0; player < 30; player++) for (let cpu = 0; cpu < 30; cpu++) for (let code = 1; code <= 4; code++) {
  const expected = { S: "strong", W: "weak", R: "reject" }[fixture.cpuEnvidoGate[gateIndex++]];
  assert.equal(originalCpuEnvidoGate(points, code, player, cpu), expected, `Envido gate ${points}/${code}/${player}/${cpu}`);
}
assert.equal(gateIndex, fixture.cpuEnvidoGate.length);
console.log(`Original CPU Envido preflight: ${gateIndex} native branch cases OK`);
