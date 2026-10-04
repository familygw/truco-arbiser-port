import assert from 'node:assert/strict';
import fs from 'node:fs';
import { originalCpuEnvidoResponse } from '../src/original-envido.ts';
const data = JSON.parse(fs.readFileSync(new URL('./fixtures/original-envido-fixtures.json', import.meta.url)));
const cases = data.cases;
let failures = 0;
for (const c of cases) {
  let draws = 0;
  const action = originalCpuEnvidoResponse(c.context, () => c.random[draws++]);
  if (action !== c.action || draws !== c.draws) {
    if (failures++ < 8) console.log(JSON.stringify({c, action, draws}));
  }
}
assert.equal(failures, 0);
console.log(`Envido: ${cases.length} native cases passed`);

const { acceptedEnvidoPoints, rejectedEnvidoPoints } = await import("../src/bids.ts");
assert.equal(acceptedEnvidoPoints(["envido", "dos-reales"], 0, 0), 8);
assert.equal(rejectedEnvidoPoints(["envido", "dos-reales"], 0, 0), 2);
assert.equal(acceptedEnvidoPoints(["real-envido", "dos-reales"], 25, 0), 5);
