/** QuickBasic PLAY subset and original Truco Arbiser audio resources. */

import music from "./original-music.json" with { type: "json" };
export const MUSIC = Object.fromEntries(Object.entries(music.tracks).map(([name, track]) => [name, track.score])) as { [K in keyof typeof music.tracks]: string };

export type MusicName = keyof typeof MUSIC;
import { parsePlay } from "./original-play.ts";
export { parsePlay } from "./original-play.ts";
export type { PlayEvent } from "./original-play.ts";

// Empirically closer to VOZ.EXE than 48 kHz; kept separate from PLAY timing.
const VOZ_SAMPLE_RATE = 16_000;
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

let context: AudioContext | null = null;

function getAudioContextCtor(): typeof AudioContext | null {
  const audioGlobal = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return globalThis.AudioContext ?? audioGlobal.webkitAudioContext ?? null;
}

function audioContext(): AudioContext | null {
  if (context) return context;
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;
  try {
    context = new AudioContextCtor();
  } catch {
    context = null;
  }
  return context;
}

class PlayEngine {
  private generation = 0;
  private activeOscillators: OscillatorNode[] = [];

  stop(): void {
    this.generation += 1;
    for (const oscillator of this.activeOscillators) {
      try { oscillator.stop(); oscillator.disconnect(); } catch { /* already stopped */ }
    }
    this.activeOscillators = [];
  }

  async play(playString: string): Promise<boolean> {
    const ctx = audioContext();
    if (!ctx) return false;
    this.stop();
    const generation = this.generation;
    if (ctx.state === "suspended") {
      let resumeTimeout = 0;
      const resumed = await Promise.race([
        ctx.resume().then(() => true).catch(() => false),
        new Promise<boolean>((resolve) => {
          resumeTimeout = window.setTimeout(() => resolve(false), 300);
        }),
      ]);
      window.clearTimeout(resumeTimeout);
      if (!resumed) return false;
    }
    if (ctx.state !== "running" || generation !== this.generation) return false;

    const events = parsePlay(playString);
    let cursor = ctx.currentTime + 0.02;
    for (const event of events) {
      if ("rest" in event) { cursor += event.rest / 1000; continue; }
      const duration = event.soundMs / 1000;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const attack = Math.min(0.005, duration / 4);
      const release = Math.min(0.012, duration / 4);
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(event.freq, cursor);
      gain.gain.setValueAtTime(0, cursor);
      gain.gain.linearRampToValueAtTime(0.105, cursor + attack);
      gain.gain.setValueAtTime(0.105, Math.max(cursor + attack, cursor + duration - release));
      gain.gain.linearRampToValueAtTime(0, cursor + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + duration + 0.005);
      this.activeOscillators.push(oscillator);
      oscillator.onended = () => {
        gain.disconnect();
        oscillator.disconnect();
        this.activeOscillators = this.activeOscillators.filter((active) => active !== oscillator);
      };
      cursor += event.ms / 1000;
    }
    return events.length > 0;
  }
}

const musicEngine = new PlayEngine();

export function playMusic(name: MusicName, enabled = true): Promise<boolean> {
  if (!enabled) { musicEngine.stop(); return Promise.resolve(false); }
  return musicEngine.play(MUSIC[name]);
}

export function stopMusic(): void {
  musicEngine.stop();
}

export async function playVoice(index: number, enabled = true): Promise<void> {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") await ctx.resume();
  const response = await fetch(assetUrl(`original/voices/t${String(index).padStart(3, "0")}.voz`));
  if (!response.ok) return;
  const packed = new Uint8Array(await response.arrayBuffer());
  const buffer = ctx.createBuffer(1, packed.length * 8, VOZ_SAMPLE_RATE);
  const samples = buffer.getChannelData(0);
  for (let byte = 0; byte < packed.length; byte += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      samples[byte * 8 + bit] = packed[byte] & (0x80 >> bit) ? 0.32 : -0.32;
    }
  }
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = "lowpass";
  filter.frequency.value = 3_200;
  gain.gain.value = 0.34;
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}
