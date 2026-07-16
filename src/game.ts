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

export function shuffledDeck(): Card[] {
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function trucoStrength(card: Card): number {
  if (card.rank === 1 && card.suit === "espada") return 14;
  if (card.rank === 1 && card.suit === "basto") return 13;
  if (card.rank === 7 && card.suit === "espada") return 12;
  if (card.rank === 7 && card.suit === "oro") return 11;
  if (card.rank === 3) return 10;
  if (card.rank === 2) return 9;
  if (card.rank === 1) return 8;
  if (card.rank === 12) return 7;
  if (card.rank === 11) return 6;
  if (card.rank === 10) return 5;
  if (card.rank === 7) return 4;
  if (card.rank === 6) return 3;
  if (card.rank === 5) return 2;
  return 1;
}

export function envidoPoints(cards: Card[]): number {
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
  return 20 + cards.reduce((total, card) => total + (card.rank <= 7 ? card.rank : 0), 0);
}

export function pickCpuCard(cards: Card[], playerCard: Card, trickResults: number[]): Card {
  const ordered = [...cards].sort((a, b) => trucoStrength(a) - trucoStrength(b));
  const winner = ordered.find((card) => trucoStrength(card) > trucoStrength(playerCard));
  if (trickResults[0] === -1 && winner) return winner;
  if (winner && Math.random() > 0.28) return winner;
  return ordered[0];
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
