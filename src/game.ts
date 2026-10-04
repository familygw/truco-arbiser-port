import { originalDealIds } from "./original-deal.ts";
import { originalCardStrength, originalCpuOrder, originalHandPoints } from "./original-game-logic.ts";

export type Suit = "espada" | "basto" | "copa" | "oro";

export type Card = {
  id: string;
  rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
  suit: Suit;
};

export const suits: Suit[] = ["espada", "basto", "copa", "oro"];
export const ranks = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;

export function makeDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ id: `${rank}-${suit}`, rank, suit })));
}

export function dealHand(random: () => number): { player: Card[]; cpu: Card[] } {
  const deck = (["espada", "basto", "oro", "copa"] as Suit[])
    .flatMap(suit => ranks.map(rank => ({ id: `${rank}-${suit}`, rank, suit })));
  const [player, cpu] = originalDealIds(random);
  return { player: player.map(id => deck[id]), cpu: cpu.map(id => deck[id]) };
}

export function trucoStrength(card: Card): number {
  return originalCardStrength(card);
}

export function envidoPoints(cards: Card[]): number {
  if (cards.length === 3) return originalHandPoints(cards as [Card, Card, Card], false).envido;
  let best = 0;
  for (const suit of suits) {
    const values = cards
      .filter((card) => card.suit === suit)
      .map((card) => (card.rank <= 7 ? card.rank : 0))
      .sort((a, b) => b - a);
    if (values.length >= 2) best = Math.max(best, 20 + values[0] + values[1]);
    else if (values.length === 1) best = Math.max(best, values[0]);
  }
  return best;
}

export function hasFlor(cards: Card[]): boolean {
  return cards.length === 3 && cards.every((card) => card.suit === cards[0].suit);
}

export function florPoints(cards: Card[]): number {
  if (!hasFlor(cards)) return 0;
  return originalHandPoints(cards as [Card, Card, Card], true).flor;
}

/** Original stable ordering of equal-strength CPU cards. */
export function orderedCpuCards(cards: Card[]): Card[] {
  if (cards.length === 3) {
    const order = originalCpuOrder(cards.map(trucoStrength) as [number, number, number]);
    return order.map((slot) => cards[slot]);
  }
  return [...cards].sort((a, b) => trucoStrength(a) - trucoStrength(b));
}

export function splitScore(score: number): { malas: number; buenas: number } {
  return score < 15 ? { malas: score, buenas: 0 } : { malas: 0, buenas: score - 15 };
}

export const suitLabel: Record<Suit, string> = {
  espada: "Espada",
  basto: "Basto",
  copa: "Copa",
  oro: "Oro",
};
