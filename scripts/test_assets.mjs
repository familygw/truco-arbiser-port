import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root=new URL('../public/original/',import.meta.url);
const meta=JSON.parse(fs.readFileSync(new URL('metadata.json',root)));
const dialogues=JSON.parse(fs.readFileSync(new URL('dialogos.json',root)));
assert.equal(dialogues.length,meta.dialogueRecords);
assert.equal(meta.voiceSamples,156);
assert.equal(fs.readdirSync(new URL('voices/',root)).filter(n=>n.endsWith('.voz')).length,meta.voiceSamples);
for(let i=0;i<dialogues.length;i++) {
  const item=dialogues[i];assert.equal(item.record,i+1);
  assert.equal(item.voice,`t${String(i+1).padStart(3,'0')}.voz`);
  assert.ok(item.text.trim().length>0);
  assert.ok(fs.statSync(new URL(`voices/${item.voice}`,root)).size>0);
}
for(const [name,expected] of Object.entries(meta.assetHashes)) {
  assert.ok(!path.isAbsolute(name)&&!name.split('/').includes('..'));
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(name,root))).digest('hex'),expected,name);
}
for(const name of ['carta-espada.png','carta-basto.png','carta-oro.png','carta-copa.png','pantalla-bsave.png']) {
  const png=fs.readFileSync(new URL(name,root));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',name);
  assert.equal(png.readUInt32BE(16),name.startsWith('pantalla')?320:46);
  assert.equal(png.readUInt32BE(20),name.startsWith('pantalla')?200:60);
}
const music=JSON.parse(fs.readFileSync(new URL('../src/original-music.json',import.meta.url)));
assert.equal(Object.keys(music.tracks).length,meta.musicScores);
for(const name of ['carta-espada-fullcolor.png','carta-basto-fullcolor.png','carta-oro-fullcolor.png','carta-copa-fullcolor.png','pantalla-fullcolor.png']) {
  assert.equal(fs.readFileSync(new URL(`../public/restored/${name}`,import.meta.url)).subarray(0,8).toString('hex'),'89504e470d0a1a0a',name);
}
console.log(`Recursos: ${meta.voiceSamples} voces, ${dialogues.length} diálogos, ${meta.musicScores} partituras, 10 PNG y ${Object.keys(meta.assetHashes).length} hashes OK.`);
