/** Flor strategy recovered from TRUCO.UNPACKED.BIN, CS:292A–2B76 / 5AA5–5CD4. */
export type FlorCode = 5 | 6 | 7 | 8;
export type FlorResult = { action: "accept" | "player" | "cpu" | "invalid"; points: number; mode: 0 | 40 | 50 | 60 };
export function originalCpuFlorOpening(points: number, random = Math.random): 3 | 4 | 30 {
  if (points < 20 || points > 38) throw new RangeError("CPU sin Flor");
  const roll = Math.floor(random() * 10) + 1;
  return points <= 27 ? roll >= 3 && roll <= 6 ? 4 : 3 : roll > 8 ? 30 : 3;
}
export function originalCpuFlorResponse(points: number, incoming: FlorCode, playerScore: number, cpuScore: number, random = Math.random): FlorResult {
  if (!points) return { action: "player", points: 3, mode: incoming === 7 ? 60 : incoming === 8 ? 40 : 50 };
  if (incoming === 8) return { action: "cpu", points: 4, mode: 40 };
  let roll = Math.floor(random() * 10) + 1;
  let accept: boolean;
  if (incoming === 7) accept = points > 32 || points >= 28 && roll <= 6;
  else if (playerScore > 25 || points > 32) accept = true;
  else if (points <= 27) accept = playerScore + 4 >= cpuScore && roll >= 8;
  else {
    if (incoming === 6) {
      if (roll < 7) return { action: "player", points: 4, mode: 50 };
      roll = Math.floor(random() * 10) + 1;
    }
    accept = roll >= (playerScore + 4 < cpuScore ? 7 : 5);
  }
  return accept ? { action: "accept", points: incoming === 7 ? originalFlorResto(playerScore, cpuScore) : 6, mode: 50 } : { action: "player", points: 4, mode: 50 };
}
export function originalFlorResto(playerScore: number, cpuScore: number): number { return Math.min(30 - playerScore, 30 - cpuScore); }
export function originalFlorReply(opening: 3 | 4 | 30, incoming: number, cpuFlor: number, playerScore: number, cpuScore: number): FlorResult {
  if (incoming === 0 || incoming > 8 && incoming !== 24 && incoming !== 26) return { action: "cpu", points: 3, mode: 0 };
  if (incoming === 26) return { action: "cpu", points: 4, mode: 0 };
  if (incoming === 24) return { action: "accept", points: opening === 30 ? originalFlorResto(playerScore, cpuScore) : 6, mode: 0 };
  if (incoming < 5 || incoming === 8 && opening === 4 || incoming !== 8 && opening === 30 || incoming === 6 && opening === 4) return { action: "invalid", points: 0, mode: 0 };
  if (incoming === 8) return { action: "cpu", points: 4, mode: 40 };
  if (incoming === 5 && opening === 4) return { action: "player", points: 4, mode: 60 };
  if (incoming === 6 && opening === 3) return { action: "accept", points: 6, mode: 50 };
  return cpuFlor < 32 && playerScore < 26 ? { action: "player", points: 4, mode: 60 } : { action: "accept", points: originalFlorResto(playerScore, cpuScore), mode: 60 };
}
/** 7B86–8132: a false Flor adds four; a wrong numeric claim transfers only the wager. */
export function originalFlorAudit(actual: number, effectiveClaim: number, declaredWinner: "player" | "cpu", wager: number, mode: 0 | 40 | 50 | 60, cpuClaimed = true, envido = 0): { winner: "player" | "cpu"; points: number; penalized: boolean } {
  const falseFlor = mode !== 0 && actual === 0;
  const skip = mode === 0 && cpuClaimed && (effectiveClaim === 0 || effectiveClaim > 38);
  const hiddenFlor = !skip && mode === 0 && actual > 0;
  const wrongClaim = !skip && effectiveClaim > 0 && effectiveClaim <= 38 && (mode !== 0 ? actual !== effectiveClaim : !actual && envido !== effectiveClaim);
  const penalized = falseFlor || hiddenFlor || wrongClaim;
  return { winner: penalized ? "cpu" : declaredWinner, points: wager + (falseFlor || hiddenFlor ? 4 : 0), penalized };
}

/** Shared declaration comparison at 1AAF / 5A90 with Flor's 20..38 bounds. */
export function originalFlorDeclaration(cpuActual: number, playerClaim: number, cpuIsMano: boolean): { winner: "player" | "cpu" | "invalid"; auditClaim: number } {
  if (!Number.isInteger(playerClaim) || playerClaim > 38 || playerClaim < (cpuIsMano ? 0 : 20)) return { winner: "invalid", auditClaim: playerClaim };
  const cpuWins = cpuIsMano ? cpuActual >= playerClaim : cpuActual > playerClaim;
  return { winner: cpuWins ? "cpu" : "player", auditClaim: cpuIsMano && cpuWins ? 0 : playerClaim };
}
