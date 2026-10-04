import fs from 'node:fs';
import assert from 'node:assert/strict';
import { OriginalTrucoMachine } from '../src/original-truco-machine.ts';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/original-truco-fixtures.json',import.meta.url)));
for(const c of f.cases) {
 const machine=new OriginalTrucoMachine(c.entry); machine.stops=new Set([0x671,0x74e1,0x93c3,0x8957,0x2c46,0x1b06,0x1c0a,0x19cc,0x8927,0x76fa]);
 for(const [address,value] of Object.entries(c.values)) machine.write(Number(address),value);
 let draws=0;
 const event=machine.run(()=>c.random[draws++]);
 assert.equal(event.address,c.stop,JSON.stringify(c));assert.equal(draws,c.draws);
 for(const [address,value] of Object.entries(c.result))assert.equal(machine.read(Number(address)),value,`${c.entry.toString(16)} ${Number(address).toString(16)}`);
}
console.log(`Truco: ${f.cases.length} decisiones coinciden con el binario.`);
