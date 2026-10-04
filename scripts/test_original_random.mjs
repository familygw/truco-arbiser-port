import fs from 'node:fs';
import assert from 'node:assert/strict';
import { OriginalRandom } from '../src/original-random.ts';
import { originalDealIds } from '../src/original-deal.ts';
import { dealHand } from '../src/game.ts';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/original-random.json', import.meta.url)));
let count = 0;
for (const row of fixture.sequences) {
  const random = new OriginalRandom(row.seed);
  for (const expected of row.states) {
    assert.equal(random.next(), expected / 0x1000000);
    assert.equal(random.state, expected); count++;
  }
}
for (const [seed, seconds, expected] of fixture.randomize) {
  const random = new OriginalRandom(seed); random.randomize(seconds);
  assert.equal(random.state, expected);
}
const deals = JSON.parse(fs.readFileSync(new URL('./fixtures/original-deal.json', import.meta.url)));
const suits = ['espada', 'basto', 'oro', 'copa'];
for (const row of deals) {
  let i = 0;
  assert.deepEqual(originalDealIds(() => row.tape[i++]), [row.player, row.cpu]);
  assert.equal(i, row.draws);
  i = 0; const hand = dealHand(() => row.tape[i++]);
  assert.deepEqual([...hand.player, ...hand.cpu].map(c => suits.indexOf(c.suit)*10 + (c.rank>7?c.rank-2:c.rank)-1), [...row.player, ...row.cpu]);
}
console.log(`Azar DOS: ${count} estados, ${fixture.randomize.length} semillas RANDOMIZE y ${deals.length} repartos coinciden con los binarios.`);
