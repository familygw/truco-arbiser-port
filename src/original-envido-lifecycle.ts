import type { OriginalEnvidoAction, OriginalEnvidoContext } from "./original-envido.ts";
import type { EnvidoCall } from "./bids.ts";

export type OriginalEnvidoOpeningContext = {
  points: number;
  playerScore: number;
  cpuScore: number;
  cpuIsMano: boolean;
  playerAheadWithPending: boolean;
  handNumber: number;
};
export type OriginalEnvidoOpening = { action: EnvidoCall | null; strategyRoll: number };

/** 57E7–5A39 (CPU mano) and 230A–23E0 / 2737–289E (CPU pie). */
export function originalCpuEnvidoOpening(c: OriginalEnvidoOpeningContext, random: () => number = Math.random): OriginalEnvidoOpening {
  const roll = () => Math.floor(random() * 10) + 1;
  let strategyRoll = 0;
  const result = (action: EnvidoCall | null): OriginalEnvidoOpening => ({ action, strategyRoll });
  if (c.cpuIsMano) {
    if (c.points < 23 && (c.playerScore === 29 || c.cpuScore === 29)) return result(null);
    const bluff = roll();
    if ((((c.playerScore > c.cpuScore + 7 || (c.playerScore > 23 && c.playerScore > c.cpuScore + 5)) && bluff > 1 && c.handNumber < 4)) || (c.cpuScore === 29 && c.points > 22)) return result("falta-envido");
    const choice = roll();
    if (c.playerScore < c.cpuScore) {
      if (c.points <= 24) return result(c.playerScore + 4 < c.cpuScore || (c.cpuScore === 28 && c.playerScore + 1 < c.cpuScore) ? null : choice < 3 ? "envido" : null);
      if (c.points <= 26) return result(c.playerScore + 6 < c.cpuScore ? null : choice < 5 ? "envido" : null);
      if (c.points <= 29) return result(c.playerScore + 8 < c.cpuScore ? null : choice > (c.playerAheadWithPending ? 4 : 2) ? "envido" : null);
      return result(choice < 4 ? null : "envido");
    }
    if (c.points <= 24 && (choice < 6 || c.playerScore > 27)) return result(null);
    if (c.points <= 24) return result(choice < 8 ? "envido" : choice === 8 ? "real-envido" : choice === 9 ? "dos-reales" : c.handNumber < 6 ? "real-envido" : "falta-envido");
    if (c.points <= 26) return result(choice < 7 ? "envido" : choice < 9 ? "real-envido" : choice === 9 ? "dos-reales" : c.handNumber < 6 ? "real-envido" : "falta-envido");
    if (c.points <= 29) return result(choice < 6 ? "envido" : choice < 9 ? "real-envido" : choice === 9 ? "dos-reales" : c.handNumber < 6 ? "real-envido" : "falta-envido");
    if (choice < 4 && c.cpuScore < 28) return result(null);
    return result(choice < 6 ? "envido" : choice < 8 ? "real-envido" : choice === 8 ? "dos-reales" : c.handNumber < 6 ? "real-envido" : "falta-envido");
  }
  // CPU pie: 22D4 has already drawn the persistent strategy value.
  strategyRoll = roll();
  if (c.cpuScore === 29 && c.points > 23) return result("falta-envido");
  if (c.points < 24 && (c.playerScore === 29 || c.cpuScore === 29)) return result(null);
  const bluff = roll();
  if (c.playerScore > c.cpuScore + 8 && bluff > 1) return result("falta-envido");
  // 2355 consumes the bluff draw even when the score condition is false.
  if (c.playerScore >= 25) {
    const choice = roll();
    if (c.cpuScore + 5 < c.playerScore && choice >= 2) return result("falta-envido");
  }
  if (c.points <= 25) {
    if (strategyRoll < (c.playerAheadWithPending ? 8 : 6)) return result(null);
    strategyRoll = roll() - (c.cpuScore > c.playerScore + 3 ? 2 : 0);
    return result(strategyRoll < 7 ? "envido" : strategyRoll < 9 ? "real-envido" : strategyRoll === 10 ? "falta-envido" : "dos-reales");
  }
  if (c.points <= 27) {
    const threshold = c.cpuScore > c.playerScore + 2 ? 5 : 3;
    return result(strategyRoll < threshold ? null : strategyRoll <= threshold + 3 ? "envido" : strategyRoll <= threshold + 5 ? "real-envido" : strategyRoll === 9 ? "dos-reales" : "falta-envido");
  }
  if (strategyRoll < 6) return result("envido");
  if (c.points <= 30) return result(strategyRoll < 9 ? "real-envido" : strategyRoll === 9 ? "dos-reales" : "falta-envido");
  return result(strategyRoll < 8 ? "real-envido" : strategyRoll === 8 ? "dos-reales" : "falta-envido");
}

/** CPU initiated the exchange: response to a player's raise at 24AD–2737.
 * strategyRoll is the persistent 1D7A, changed by the opening adjustment at 18AF.
 */
export function originalCpuEnvidoCounterResponse(c: OriginalEnvidoContext, initialStrategyRoll: number | null, currentWager: number, random: () => number = Math.random): { action: OriginalEnvidoAction; strategyRoll: number } {
  const roll = () => Math.floor(random() * 10) + 1;
  let strategyRoll = initialStrategyRoll ?? 0;
  const result = (action: OriginalEnvidoAction) => ({ action, strategyRoll });
  if (c.playerScore + c.previousWager > 29) return result("accept");
  if (initialStrategyRoll === null) strategyRoll = roll();
  const acceptCheck = () => c.points >= 24 && roll() <= (c.previousWager > 5 ? 8 : c.playerAheadWithPending ? 4 : 6) - (c.openingStarted ? 2 : 0);
  const real = () => { roll(); return result("real-envido"); }; // 2227 uses a two-way voice draw; one random value.
  const adjust = () => { if (c.openingStarted) strategyRoll += 2; };
  const three = () => { adjust(); return result(strategyRoll > 3 ? "reject" : strategyRoll > 1 ? "falta-envido" : "dos-reales"); };
  const one = () => { adjust(); return result(strategyRoll > 2 ? "reject" : strategyRoll === 1 ? "falta-envido" : "dos-reales"); };
  if (c.points <= 24) {
    if (c.incoming === 4 || c.points < 23) strategyRoll = 5;
    return result(strategyRoll < 4 ? "accept" : "reject");
  }
  if (c.points <= 27) {
    if (c.incoming === 4) return acceptCheck() ? result("accept") : result(strategyRoll < 4 ? "accept" : "reject");
    if (c.incoming === 3) return three();
    if (c.incoming === 1) return roll() > 30 - c.points ? result("accept") : one();
    if (strategyRoll > 4) return result("reject");
    if (strategyRoll > 2) return result("falta-envido");
    return strategyRoll === 2 ? result("dos-reales") : real();
  }
  if (c.points <= 30) {
    if (c.incoming === 1) return result(c.points === 30 && strategyRoll > 8 ? "falta-envido" : c.points === 30 || strategyRoll >= 2 ? "accept" : "reject");
    if (c.incoming === 2) return result(c.points === 30 || strategyRoll >= 2 ? "accept" : "reject");
    if (c.incoming === 3) return result(c.points - 25 - (c.openingStarted ? 2 : 0) > strategyRoll ? "accept" : "reject");
    const threshold = (c.playerScore + currentWager < c.cpuScore ? 4 : 6) - (c.openingStarted ? 3 : 0);
    return result(strategyRoll <= threshold ? "accept" : "reject");
  }
  if (c.incoming === 4) return result("accept");
  if (c.incoming === 3) return result(strategyRoll > 1 ? "falta-envido" : "dos-reales");
  if (c.incoming === 2) return strategyRoll < 3 ? real() : result(strategyRoll < 6 ? "dos-reales" : "falta-envido");
  if (strategyRoll < 3) return result("envido");
  return strategyRoll < 5 ? result("real-envido") : result(strategyRoll < 8 ? "dos-reales" : "falta-envido");
}

export type OriginalEnvidoDeclaration = { winner: "player" | "cpu"; auditClaim: number };
/** 1AAF / 5A90: CPU mano accepts "son buenas" as zero, and wins ties. */
export function originalEnvidoDeclaration(cpuActual: number, playerClaim: number, cpuIsMano: boolean): OriginalEnvidoDeclaration {
  const cpuWins = cpuIsMano ? cpuActual >= playerClaim : cpuActual > playerClaim;
  return { winner: cpuWins ? "cpu" : "player", auditClaim: cpuIsMano && cpuWins ? 0 : playerClaim };
}

export type OriginalEnvidoAuditCard = { rank: number; suit: string };
/** 7B86–8135. Cards use web ranks (10/11/12 are figures).
 * With Flor disabled, a three-card suit may justify any two-card sum +20.
 */
export function originalEnvidoAudit(cards: readonly OriginalEnvidoAuditCard[], playerClaim: number, cpuActual: number, cpuIsMano: boolean, florEnabled: boolean, wager: number): { playerPoints: number; cpuPoints: number; penalized: boolean } {
  const declaration = originalEnvidoDeclaration(cpuActual, playerClaim, cpuIsMano);
  const claim = declaration.auditClaim;
  const pip = cards.map(card => card.rank <= 7 ? card.rank : 0);
  const sameSuit = cards.every(card => card.suit === cards[0].suit);
  let invalid = sameSuit && florEnabled;
  if (!invalid && claim !== 0) {
    if (sameSuit) {
      invalid = ![pip[0] + pip[1] + 20, pip[0] + pip[2] + 20, pip[1] + pip[2] + 20].includes(claim);
    } else {
      let actual = Math.max(...pip);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (cards[i].suit === cards[j].suit) actual = pip[i] + pip[j] + 20;
      invalid = claim !== actual;
    }
  }
  return invalid
    ? { playerPoints: 0, cpuPoints: wager + (sameSuit && florEnabled ? 4 : 0), penalized: true }
    : { playerPoints: declaration.winner === "player" ? wager : 0, cpuPoints: declaration.winner === "cpu" ? wager : 0, penalized: false };
}

export const originalEnvidoCode: Record<EnvidoCall, 1 | 2 | 3 | 4> = {
  envido: 1, "real-envido": 2, "dos-reales": 3, "falta-envido": 4,
};
/** 2197 / 2438: repeat or increase the CPU's last canto; no fixed repeat limit. */
export function originalEnvidoRaiseAllowed(currentWager: number, lastCpuCall: EnvidoCall, incoming: EnvidoCall, origin: "player" | "cpu" = "player"): boolean {
  return lastCpuCall !== "falta-envido" && (origin === "cpu" || currentWager !== 30) && originalEnvidoCode[incoming] >= originalEnvidoCode[lastCpuCall];
}
/** 227C / 246A: Falta replaces the stake, rather than adding thirty. */
export function originalEnvidoRaisedWager(currentWager: number, incoming: EnvidoCall): number {
  const code = originalEnvidoCode[incoming];
  return code === 4 ? 30 : currentWager + (code === 3 ? 6 : code + 1);
}


/** 1DB2–1DDC: a capped rejection equal to acceptance triggers Quiero Obligada. */
export function originalEnvidoForcedAcceptance(previousWager: number, currentWager: number, playerScore: number, cpuScore: number): boolean {
  const cap = 30 - Math.max(playerScore, cpuScore);
  return Math.min(previousWager, cap) === Math.min(currentWager, cap);
}


/** 1B06 / 1C0A: audit immediately only if the declared winner reaches thirty. */
export function originalEnvidoClosure(cards: readonly OriginalEnvidoAuditCard[], playerClaim: number, cpuActual: number, cpuIsMano: boolean, florEnabled: boolean, wager: number, playerScore: number, cpuScore: number): { immediate: boolean; matchWinner: "player" | "cpu" | null; playerPoints: number; cpuPoints: number } {
  const declared = originalEnvidoDeclaration(cpuActual, playerClaim, cpuIsMano);
  const immediate = (declared.winner === "player" ? playerScore : cpuScore) + wager >= 30;
  const points = immediate ? originalEnvidoAudit(cards, playerClaim, cpuActual, cpuIsMano, florEnabled, wager) : { playerPoints: declared.winner === "player" ? wager : 0, cpuPoints: declared.winner === "cpu" ? wager : 0 };
  const matchWinner = immediate ? playerScore + points.playerPoints >= 30 ? "player" : cpuScore + points.cpuPoints >= 30 ? "cpu" : null : null;
  return { immediate, matchWinner, playerPoints: points.playerPoints, cpuPoints: points.cpuPoints };
}
