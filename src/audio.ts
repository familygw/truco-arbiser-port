/** QuickBasic PLAY subset and original Truco Arbiser audio resources. */

const MUSIC = {
  intro: "msl10o3e..f25el5e-eebg#ep10l10e..f25el5e-ee>c<aep10l10efel5e-eebg#ep10l10fedc40d40c20<bp10l20ag#l5a>el44ababababababababababa10",
  envido: "l20gab>c<b>cdedefg5o1g20l10ggo3e20ae20aeffp10",
  deal: "<e.l20efl10feeaa>ccfl5fep10l10e.l20eal10aeeccddcl5c<bp10l10eeffeeg#g#bb>fl5fep10l10eebbg#g#eedc<bb5a5p10.",
  real: "c#20d20e20f20bf20bfaap10",
  flor: "geceba5.geceag5.",
  truco: "ggafge5defgedg5.",
  retruco: "ggafge5defgedc5.",
  vale4: "eeddc.c20<bba.a20gf3.>d.d20cc<bbaag.g20fe3.b>d<b>c<ab>c<bg.a20b20a3.>cc<abgabafgag3.",
  win: "l20<g>c10cd10degec10<g>c10cd10de6c8",
  lose: "l20<g>c10cd10degec6>g7<d8fe7c7",
  mazo: "<g20>c<g20>c<g20>c5<l20g>cdc<b10>cd5",
  quiero: "l20<gb10gb10gb5gb>c<bl10ab20>c",
  noQuiero: "l20c<ba>c<bag#10bag#bag#l10a>",
  fanfare: "l20cdefgagfl10edc5",
  handWin: "ggl20efedcdcdl10ec",
  handLose: "ggl20efedcdc<b>c5",
  taunt: "<eaa-.l20ab>c5<a5msl10baa-bl10a5.>",
  idle: "msefdecd<b>c<al10mnbaa-bl10a.>",
  march: "o3l20dd-de<a-52>f24ed<ba52>c24<b>cd<a52>e24dc<a<a-52>b24aa-a<e52>b24aa-bl10ap10",
  short: "o3l10cdmseedc<bp10b>cddc<bap10",
  arpeggio: "l15<ceg>ceg>c4",
  rise: "<l20gab>cdefg10ab>cdefg6",
  fall: "l20edcdc<b>c10",
  scale: "l50cegab>ceg>cg",
  trill: "l20cdefl25gagagagagagag10",
  bells: "l10cceecc<gg>cel20dc<b>dc5c10",
  cascade: "l20>c<bagfedl10cg>c",
  afano: "<<gab>c5p5p10cdef5p5p10fed<g5g5p10>fedc5p5p5p10",
  llora: "aagga5e.e20aagga5e.e20aagga",
  envidoReply: "cceegg>c5<cceegg>c",
  realReply: "e.l20fgfefede10ce10.fgfefed>c10",
  florReply: "l20efl10edc<b>c<baag#ab>c<ap10>ep10ap10",
  sting: "a5b5>c<p20.l10",
  long: "l15fedfededcedcdc<b>dc<b>cde7p8fedfededcedcdc<b>dc<ba7>a2",
  cde: "l15cde.e20e20e.cde.e20e20e.cde.e20e20e.e-20e20l5ag",
  finale: "l5<g.g10>c2.<g.>c10e2.c.e10g2.e.c10e2.",
  theme: "o4l10<cc.de.c.f3.c.<b.b.a.b.>c3.<",
  good: "l10o3ab>c5<b5a5ab>ce<b>c<a5",
  chord: "l15cec<a>c<aeae<a3",
} as const;

export type MusicName = keyof typeof MUSIC;
export type PlayEvent = { freq: number; ms: number } | { rest: number };

const NOTE_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DEFAULT_OCTAVE = 4;
const DEFAULT_LENGTH = 4;
const DEFAULT_TEMPO = 120;
// Empirically closer to VOZ.EXE than 48 kHz; kept separate from PLAY timing.
const VOZ_SAMPLE_RATE = 16_000;

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

function readDigits(source: string, index: number): { value: number | null; next: number } {
  let next = index;
  while (next < source.length && source[next] >= "0" && source[next] <= "9") next += 1;
  return next === index ? { value: null, next: index } : { value: Number.parseInt(source.slice(index, next), 10), next };
}

function readDots(source: string, index: number): { count: number; next: number } {
  let next = index;
  while (source[next] === ".") next += 1;
  return { count: next - index, next };
}

function lengthToMs(length: number, tempo: number, dots: number): number {
  const safeLength = Math.max(1, length);
  const safeTempo = Math.max(32, Math.min(255, tempo));
  let duration = 240_000 / (safeTempo * safeLength);
  if (dots) duration *= 2 - 2 ** -dots;
  return duration;
}

function noteToFrequency(pitchClass: number, octave: number): number {
  const midi = 12 * (octave + 1) + pitchClass;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Parse the subset used by the recovered QuickBasic PLAY strings. */
export function parsePlay(playString: string): PlayEvent[] {
  const source = playString.toLowerCase();
  const events: PlayEvent[] = [];
  let octave = DEFAULT_OCTAVE;
  let length = DEFAULT_LENGTH;
  let tempo = DEFAULT_TEMPO;
  let index = 0;

  while (index < source.length) {
    const command = source[index];
    if (/\s/.test(command)) { index += 1; continue; }
    if (command === ">") { octave = Math.min(6, octave + 1); index += 1; continue; }
    if (command === "<") { octave = Math.max(0, octave - 1); index += 1; continue; }

    if (command === "o" || command === "l" || command === "t") {
      const digits = readDigits(source, index + 1);
      if (digits.value !== null) {
        if (command === "o") octave = Math.max(0, Math.min(6, digits.value));
        if (command === "l") length = Math.max(1, Math.min(64, digits.value));
        if (command === "t") tempo = Math.max(32, Math.min(255, digits.value));
        index = digits.next;
      } else index += 1;
      continue;
    }

    if (command === "p") {
      const digits = readDigits(source, index + 1);
      index = digits.next;
      const dots = readDots(source, index);
      index = dots.next;
      events.push({ rest: lengthToMs(digits.value ?? length, tempo, dots.count) });
      continue;
    }

    // MS/MN/ML select articulation in QuickBasic. The recovered score mostly
    // uses them as phrasing markers, so timing remains unchanged here.
    if (command === "m" && ["s", "n", "l"].includes(source[index + 1])) {
      index += 2;
      continue;
    }

    if (command in NOTE_PC) {
      let pitchClass = NOTE_PC[command];
      index += 1;
      if (source[index] === "#" || source[index] === "+") { pitchClass += 1; index += 1; }
      else if (source[index] === "-") { pitchClass -= 1; index += 1; }
      const digits = readDigits(source, index);
      index = digits.next;
      const dots = readDots(source, index);
      index = dots.next;
      events.push({ freq: noteToFrequency(pitchClass, octave), ms: lengthToMs(digits.value ?? length, tempo, dots.count) });
      continue;
    }

    index += 1;
  }
  return events;
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
      const duration = Math.max(event.ms / 1000, 0.025);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const attack = Math.min(0.01, duration / 4);
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
  const response = await fetch(`/original/voices/t${String(index).padStart(3, "0")}.voz`);
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
