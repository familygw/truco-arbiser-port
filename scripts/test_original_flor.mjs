import assert from 'node:assert/strict';
import fs from 'node:fs';
import { originalCpuFlorOpening, originalCpuFlorResponse, originalFlorReply } from '../src/original-flor.ts';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/original-flor-fixtures.json',import.meta.url)));
for (const [points,roll,wager] of f.openings) assert.equal(originalCpuFlorOpening(points,()=>roll),wager);
for (const [points,incoming,player,cpu,tape,action,wager,mode,draws] of f.responses) {
 let n=0; assert.deepEqual(originalCpuFlorResponse(points,incoming,player,cpu,()=>tape[n++]),{action,points:wager,mode}); assert.equal(n,draws);
}
for (const [opening,incoming,points,player,cpu,action,wager,mode] of f.replies) assert.deepEqual(originalFlorReply(opening,incoming,points,player,cpu),{action,points:wager,mode});
console.log(`Flor: ${f.openings.length+f.responses.length+f.replies.length} decisiones coinciden con el binario.`);
const { originalFlorAudit } = await import('../src/original-flor.ts');
for (const [envido,actual,claim,winner,wager,mode,cpuClaims,playerPoints,cpuPoints,penalized] of f.audits) {
 const result=originalFlorAudit(actual,claim,winner,wager,mode,cpuClaims,envido);
 assert.deepEqual(result,{winner:playerPoints>0?'player':'cpu',points:playerPoints+cpuPoints,penalized},JSON.stringify([actual,claim,winner,wager,mode,cpuClaims]));
}
console.log(`Flor: ${f.audits.length} auditorías coinciden con el binario.`);

const { originalFlorDeclaration } = await import('../src/original-flor.ts');
for(const [mano,actual,claim,winner,auditClaim] of f.declarations) assert.deepEqual(originalFlorDeclaration(actual,claim,!!mano),{winner,auditClaim});
console.log(`Flor: ${f.declarations.length} declaraciones coinciden con el binario.`);
