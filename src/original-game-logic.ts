/** Translations of isolated DOS routines. See reverse-engineering/original-game-verification.json. */
export type OriginalCard = { rank: number; suit: "espada" | "basto" | "oro" | "copa" };

/** DOS 1000:94F6–9609. The original encodes figures as ranks 8, 9, 10. */
export function originalCardStrength(card: OriginalCard): number {
  const rank = card.rank <= 7 ? card.rank : card.rank - 2;
  const fixed: Record<number, number> = { 4: 1, 5: 2, 6: 3, 8: 5, 9: 6, 10: 7, 3: 10, 2: 9 };
  if (rank in fixed) return fixed[rank];
  if (rank === 7) return card.suit === "espada" ? 12 : card.suit === "oro" ? 11 : 4;
  return card.suit === "espada" ? 14 : card.suit === "basto" ? 13 : 8;
}

/** DOS 1000:960A–96AB. Returns slot indices from weakest to strongest, including original tie order. */
export function originalCpuOrder(strengths: readonly [number, number, number]): [number, number, number] {
  const [a, b, c] = strengths;
  if (b >= a) {
    if (c < a) return [2, 0, 1];
    return c < b ? [0, 2, 1] : [0, 1, 2];
  }
  if (c < b) return [2, 1, 0];
  return c < a ? [1, 2, 0] : [1, 0, 2];
}

/** DOS 1000:175C–18EE. Includes the original Flor-disabled branch. */
export function originalHandPoints(cards: readonly [OriginalCard, OriginalCard, OriginalCard], florEnabled = true): { envido: number; flor: number } {
  const [a, b, c] = cards.map((card) => card.rank <= 7 ? card.rank : 0);
  const [sa, sb, sc] = cards.map((card) => card.suit);
  if (sa === sb && sa === sc) {
    if (florEnabled) return { envido: 0, flor: 20 + a + b + c };
    // 1854–1874 handles all three values equal (the three figures give zero).
    if (b === a && c === a) return { envido: 20, flor: 0 };
    const pair = b <= a ? a + Math.max(b, c) : b + Math.max(a, c);
    return { envido: 20 + pair, flor: 0 };
  }
  if (sa !== sb && sa !== sc && sb !== sc) return { envido: Math.max(a, b, c), flor: 0 };
  if (sa === sb) return { envido: 20 + a + b, flor: 0 };
  if (sa === sc) return { envido: 20 + a + c, flor: 0 };
  return { envido: 20 + b + c, flor: 0 };
}

/** DOS 1000:816F–81AA. Both scores are total scores, including malas. */
export function originalWagerCap(stake: number, playerScore: number, cpuScore: number): number {
  return Math.min(stake, Math.max(0, 30 - Math.max(playerScore, cpuScore)));
}

/** DOS 1000:19DF–1A23. Falta starts with 30 and is reduced by the wager-cap routine. */
export function originalInitialEnvidoWager(code: 1 | 2 | 3 | 4): number {
  return [2, 3, 6, 30][code - 1];
}

/** DOS 1000:1CE4–1D29. A branch classifier, not the complete response policy.
 * "strong" and "weak" continue into distinct stochastic strategies; only "reject" is final here.
 * Earlier bluff/near-win checks can bypass this block, so callers must preserve that context.
 */
export function originalCpuEnvidoGate(points: number, incomingCode: 1 | 2 | 3 | 4, playerScore: number, cpuScore: number): "strong" | "weak" | "reject" {
  if (points > 24) return "strong";
  if (incomingCode === 4) return "reject";
  if (playerScore + 3 < cpuScore || cpuScore > 26 || playerScore > 26) return "reject";
  return "weak";
}
