import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root=new URL('../dist/',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');
for(const [,asset]of html.matchAll(/(?:src|href)="(\/truco-arbiser-port\/assets\/[^" ]+)"/g)) {
  assert.ok(fs.existsSync(new URL(asset.replace('/truco-arbiser-port/',''),root)),asset);
}
const meta=JSON.parse(fs.readFileSync(new URL('original/metadata.json',root)));
for(const [name,hash]of Object.entries(meta.assetHashes)) {
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(`original/${name}`,root))).digest('hex'),hash,name);
}
for(const name of fs.readdirSync(new URL('../public/restored/',import.meta.url))) {
  assert.deepEqual(fs.readFileSync(new URL(`restored/${name}`,root)),fs.readFileSync(new URL(`../public/restored/${name}`,import.meta.url)),name);
}
const js=fs.readdirSync(new URL('assets/',root)).filter(name=>name.endsWith('.js')).map(name=>fs.readFileSync(new URL(`assets/${name}`,root),'utf8')).join('');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url)));
assert.ok(js.includes(pkg.version));
assert.ok(!js.includes('WEB PORT // BUILD 0.2'));
if(process.env.VITE_BUILD_ID)assert.ok(js.includes(process.env.VITE_BUILD_ID));
console.log('Build: rutas base, bundle, versión, recursos y hashes de producción OK.');
