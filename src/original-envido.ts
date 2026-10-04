/** CPU response block 1000:1CA1–227C. See native differential fixtures.
 * Flor handling, legality, statement of points and award resolution happen outside this block.
 */
export type OriginalEnvidoContext = {
  points: number;
  incoming: 1 | 2 | 3 | 4;
  playerScore: number;
  cpuScore: number;
  cpuIsMano: boolean;
  openingStarted: boolean;
  playerAheadWithPending: boolean;
  previousWager: number;
  faltaCount: number;
};
export type OriginalEnvidoAction = "accept" | "reject" | "envido" | "real-envido" | "dos-reales" | "falta-envido";

export function originalCpuEnvidoResponse(context: OriginalEnvidoContext, random: () => number = Math.random): OriginalEnvidoAction {
  const c = context;
  const roll = (limit: number) => Math.floor(random() * limit) + 1;
  // The caller at 1A35 bypasses this strategy when either side is one point from winning.
  if (c.playerScore >= 29 || c.cpuScore >= 29) return "accept";
  const acceptCheck = (): boolean => {
    if (c.points < 24) return false;
    const threshold = (c.previousWager > 5 ? 8 : c.playerAheadWithPending ? 4 : 6) - (c.openingStarted ? 2 : 0);
    return roll(10) <= threshold;
  };
  const realRaise = (): OriginalEnvidoAction => { roll(2); return "real-envido"; }; // Choose one of two voice variants.
  const envidoRaise = (): OriginalEnvidoAction => {
    if (c.incoming === 1) { roll(2); return "envido"; }
    const choice = roll(10);
    if (c.incoming !== 2 || choice > 6) return "reject";
    return realRaise();
  };
  const dosReales = (): OriginalEnvidoAction => {
    if (c.incoming === 4) return c.points > 25 && acceptCheck() ? "accept" : "reject";
    return "dos-reales";
  };
  const falta = (choice: number): OriginalEnvidoAction => {
    if (c.incoming === 4) return choice > 8 && c.points > 25 ? "accept" : "reject";
    return "falta-envido";
  };
  const choiceRaise = (choice: number): OriginalEnvidoAction => {
    while (c.incoming === 2 && choice < 2) choice = roll(4);
    if (choice === 1) return envidoRaise();
    if (choice === 2) return c.incoming === 2 ? realRaise() : "real-envido";
    if (choice === 3) return dosReales();
    return falta(choice);
  };
  // Initial score-sensitive bluff precedes the weak/strong split.
  const firstRoll = roll(10);
  if (c.playerScore > c.cpuScore + 8 && c.incoming < 3 && firstRoll > 2) return falta(5);
  if (c.points <= 24) {
    if (c.incoming === 4 || c.cpuScore > c.playerScore + 3 || c.playerScore > 26 || c.cpuScore > 26) return "reject";
    if (c.points >= 24 && !c.openingStarted && roll(10) < 4) return "accept";
    if (roll(10) < 9) return "reject";
    const choice = roll(10);
    if (choice < 2) return envidoRaise();
    if (choice < 5) return c.incoming === 1 ? "real-envido" : c.incoming === 2 ? realRaise() : "reject";
    if (choice < 7) return dosReales();
    return falta(choice);
  }
  // 25..27 (except 27 while CPU is mano): weaker raising strategy.
  if (!(c.points > 27 || (c.points > 26 && c.cpuIsMano))) {
    if (c.incoming > 2) {
      if (c.previousWager >= 6 && acceptCheck()) return "accept";
      if (c.cpuScore > c.playerScore + 3 || c.playerScore > 26 || c.cpuScore > 26) return "reject";
      if (c.points >= 24 && !c.openingStarted && roll(10) < 4) return "accept";
      if (roll(10) < 9) return "reject";
      const choice = roll(10);
      if (choice < 2) return envidoRaise();
      if (choice < 5) return c.incoming === 1 ? "real-envido" : c.incoming === 2 ? realRaise() : "reject";
      if (choice < 7) return dosReales();
      return falta(choice);
    }
    const willingness = roll(10) + (c.cpuIsMano ? 1 : 0);
    if (willingness > 3) return "reject";
    if (willingness === 1) return "accept";
    const choice = roll(10);
    if (choice <= 2 && c.incoming === 1) return envidoRaise();
    if (choice <= 5) return c.incoming === 2 ? realRaise() : "real-envido";
    if (choice <= 7) return dosReales();
    return falta(choice);
  }
  // 27 while CPU is mano, and 28..30.
  if (c.points <= 30) {
    const choice = roll(10);
    if (c.incoming < 3 && (choice < 9 || c.playerAheadWithPending)) return "accept";
    if (c.incoming >= 3) {
      if ((c.cpuScore > c.playerScore + 10 && c.cpuScore > 25) || c.cpuScore > 26) return "accept";
      if (acceptCheck()) return "accept";
      const threshold = c.faltaCount < 2 ? 60 : c.faltaCount < 4 ? 45 : 30;
      const chance = roll(100);
      return (c.points > 27 && c.cpuIsMano) || (c.points > 26 && chance > threshold) ? "accept" : "reject";
    }
    return choiceRaise(roll(4));
  }
  // 31..33 branch.
  if (c.incoming === 4) return "accept";
  if (c.playerScore > c.cpuScore + 8) return falta(5);
  if (c.incoming === 3) {
    const choice = roll(10);
    return choice <= 5 ? dosReales() : falta(5);
  }
  const choice = roll(4);
  return choiceRaise(choice);
}
