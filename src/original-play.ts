/** Recovered BRUN40 PLAY contracts: note table 0177:442A, duration/dots
 * 4342–4375, articulation 4376–43C7. The TRUCO helper resets MN O3 L10. */
export type PlayEvent = { freq: number; ms: number; soundMs: number } | { rest: number };
const NOTE_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const OCTAVE_6 = [4186, 4435, 4699, 4978, 5274, 5588, 5920, 6272, 6645, 7040, 7459, 7902];
export function parsePlay(playString: string): PlayEvent[] {
  const source=playString.toLowerCase();
  const events: PlayEvent[]=[];
  let octave=3, length=10, tempo=120, mode: 'n'|'s'|'l'='n', index=0;
  const digits=(): number|null => {
    const start=index;
    while (/\d/.test(source[index] ?? '')) index++;
    return start===index ? null : Number(source.slice(start,index));
  };
  const units=(denominator: number) => {
    let duration=Math.floor(96000/(tempo*denominator)), addition=duration;
    while (source[index]==='.') { addition=Math.floor(addition/2);duration+=addition;index++; }
    return duration;
  };
  while(index<source.length) {
    const command=source[index++];
    if (/\s/.test(command)) continue;
    if(command==='>') { octave=Math.min(6,octave+1);continue; }
    if(command==='<') { octave=Math.max(0,octave-1);continue; }
    if(command==='m') {
      const articulation=source[index++];
      if(!['n','s','l'].includes(articulation)) throw Error(`Unsupported PLAY mode ${articulation}`);
      mode=articulation as 'n'|'s'|'l';continue;
    }
    if(['o','l','t'].includes(command)) {
      const value=digits();
      if(value===null || value<(command==='o'?0:command==='t'?32:1) || value>(command==='o'?6:command==='t'?255:64)) throw Error(`Invalid PLAY ${command}`);
      if(command==='o')octave=value;else if(command==='l')length=value;else tempo=value;
      continue;
    }
    if(command==='p') {
      const denominator=digits();
      if(denominator===null || denominator<1 || denominator>64) throw Error('Invalid PLAY pause');
      events.push({rest:units(denominator)*2.5});continue;
    }
    if(!(command in NOTE_PC)) throw Error(`Unsupported PLAY command ${command}`);
    let pitch=NOTE_PC[command];
    if(source[index]==='#'||source[index]==='+') {pitch++;index++;}
    else if(source[index]==='-') {pitch--;index++;}
    // The original XLAT table rejects B#/C-flat and E#/F-flat.
    if(pitch<0||pitch>11||((command==='e'||command==='b')&&pitch===NOTE_PC[command]+1)||((command==='f'||command==='c')&&pitch===NOTE_PC[command]-1)) throw Error('Invalid PLAY accidental');
    const denominator=digits()??length;
    if(denominator<1||denominator>64) throw Error('Invalid PLAY note length');
    const duration=units(denominator);
    const sound=mode==='l'?duration:Math.max(1,Math.floor(duration*(mode==='s'?3/4:7/8)));
    const gap=mode==='l'?0:Math.floor(duration/(mode==='s'?4:8));
    const frequency=Math.round(OCTAVE_6[pitch]/2**(6-octave));
    events.push({freq:frequency,ms:(sound+gap)*2.5,soundMs:sound*2.5});
  }
  return events;
}
