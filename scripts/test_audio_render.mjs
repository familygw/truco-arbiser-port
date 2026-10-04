/** Check actual WebAudio scheduling against the original runtime's event fixtures.
 * A fake device avoids needing a speaker or a browser policy in headless CI. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { playMusic, stopMusic } from '../src/audio.ts';
const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/original-music-events.json',import.meta.url))).cases;
let context;
class FakeContext {
  currentTime=100;state='running';destination={};oscillators=[];gains=[];
  constructor(){context=this;}
  createOscillator(){
    const node={frequency:{setValueAtTime(freq,time){node.freq=freq;node.frequencyTime=time;}},connect(){return node.gain;},start(time){node.startTime=time;},stop(time){node.stopTime=time;},disconnect(){node.disconnected=true;}};
    this.oscillators.push(node);return node;
  }
  createGain(){
    const gain={gain:{setValueAtTime(){},linearRampToValueAtTime(value,time){if(value===0)gain.silentAt=time;}},connect(){return gain;},disconnect(){}};
    this.oscillators.at(-1).gain=gain;this.gains.push(gain);return gain;
  }
}
const originalCtor=globalThis.AudioContext;globalThis.AudioContext=FakeContext;
let notes=0;
try {
  for(const c of fixtures.slice(0,46)) {
    const before=context?.oscillators.length??0;
    assert.equal(await playMusic(c.name),true,c.name);
    const scheduled=context.oscillators.slice(before);let cursor=context.currentTime+0.02,index=0;
    for(const e of c.events) {
      if('rest' in e){cursor+=e.rest/1000;continue;}
      const node=scheduled[index++];assert.equal(node.freq,e.freq,c.name);
      assert.ok(Math.abs(node.startTime-cursor)<1e-9,c.name);
      assert.ok(Math.abs(node.gain.silentAt-(cursor+e.soundMs/1000))<1e-9,c.name);
      cursor+=e.ms/1000;notes++;
    }
    assert.equal(scheduled.length,index,c.name);
  }
  const before=context.oscillators.length;
  assert.equal(await playMusic('intro',false),false);
  assert.equal(context.oscillators.length,before);
  assert.ok(context.oscillators.every(node=>node.disconnected));
  stopMusic();
} finally {globalThis.AudioContext=originalCtor;}
console.log(`WebAudio: ${notes} notas de las 46 partituras programadas con frecuencia y articulación nativas; silencio y cancelación OK.`);
