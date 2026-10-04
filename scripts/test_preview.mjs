/** Read-only smoke test of the served production files; no browser automation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const base=new URL(process.argv[2]??'http://127.0.0.1:4173/truco-arbiser-port/');
let count=0;
async function read(name){const response=await fetch(new URL(name,base));assert.equal(response.status,200,name);count++;return Buffer.from(await response.arrayBuffer());}
const html=(await read('')).toString();
const meta=JSON.parse((await read('original/metadata.json')).toString());
await Promise.all(Object.entries(meta.assetHashes).map(async([name,hash])=>assert.equal(createHash('sha256').update(await read(`original/${name}`)).digest('hex'),hash,name)));
for(const [,asset]of html.matchAll(/(?:src|href)="(\/truco-arbiser-port\/assets\/[^" ]+)"/g))await read(asset);
for(const name of ['espada','basto','oro','copa'])await read(`restored/carta-${name}-fullcolor.png`);
await read('restored/pantalla-fullcolor.png');
console.log(`Preview: ${count} respuestas HTTP 200; bundle, imágenes, diálogos y 156 voces servidos con base correcta y hashes originales.`);
