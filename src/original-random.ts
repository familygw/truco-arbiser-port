/** BRUN40.EXE 0177:BC47–BC8C. RND's 24-bit state and single result
 * are exact; integer products remain below JS's 53-bit precision limit. */
export class OriginalRandom {
  state: number;
  constructor(seed = 0x50000) { this.state = seed & 0xffffff; }
  next = (): number => {
    this.state = (this.state * 0xfd43fd + 0xc39ec3) & 0xffffff;
    return this.state / 0x1000000;
  };
  /** BRUN40 0177:BC8D: RANDOMIZE's double argument mixes its upper words.
   * Keep the low seed byte, as the original runtime does. */
  randomize(seconds: number) {
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, seconds, true);
    const mixed = bits.getUint16(4, true) ^ bits.getUint16(6, true);
    this.state = (this.state & 255) | (mixed << 8);
  }
}

export function clockSeededRandom() {
  const random = new OriginalRandom();
  const now = new Date();
  // TIMER returns a single before TRUCO widens it to RANDOMIZE's double.
  random.randomize(Math.fround(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000));
  return random;
}
