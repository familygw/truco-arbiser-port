import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parsePlay } from '../src/original-play.ts';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/original-music-events.json', import.meta.url)));
let count=0;
for(const c of fixture.cases) {
  assert.deepEqual(parsePlay(c.score),c.events,c.name);count+=c.events.length;
}
const music=JSON.parse(fs.readFileSync(new URL('../src/original-music.json',import.meta.url)));
for (const [name,track] of Object.entries(music.tracks)) {
  assert.equal(fixture.cases.find(c=>c.name===name)?.score,track.score,name);
}
// The DOS image is an optional local source, outside the distributable repo.
const imagePath=new URL('../reverse-engineering/TRUCO.UNPACKED.BIN',import.meta.url);
if(fs.existsSync(imagePath)) {
  const image=fs.readFileSync(imagePath);
  for(const [name,track] of Object.entries(music.tracks)) {
    const at=music.dataSegment*16+track.descriptorOffset;
    assert.equal(image.readUInt16LE(at),track.length);
    assert.equal(image.readUInt16LE(at+2),track.dataOffset);
    assert.equal(image.subarray(music.dataSegment*16+track.dataOffset,music.dataSegment*16+track.dataOffset+track.length).toString('ascii'),track.score,name);
  }
}
assert.equal(music.reset,'mno3l10');
assert.throws(()=>parsePlay('x10'));
console.log(`Música: ${Object.keys(music.tracks).length} partituras extraídas y ${count} eventos de ${fixture.cases.length} casos coinciden con BRUN40.`);
