import { originalEnvidoCode, originalEnvidoRaiseAllowed, originalEnvidoRaisedWager } from "./original-envido-lifecycle.ts";
import { originalWagerCap } from "./original-game-logic.ts";

export type EnvidoCall = "envido" | "real-envido" | "dos-reales" | "falta-envido";

export const envidoLabel: Record<EnvidoCall, string> = {
  envido: "Envido",
  "real-envido": "Real Envido",
  "dos-reales": "Dos Reales Envido",
  "falta-envido": "Falta Envido",
};

export function allowedEnvidoRaises(sequence: EnvidoCall[], origin: "player" | "cpu" = "player"): EnvidoCall[] {
  if (sequence.includes("falta-envido")) return [];
  const last = sequence.at(-1);
  if (!last) return [];
  const wager = sequence.reduce(originalEnvidoRaisedWager, 0);
  const calls = Object.keys(originalEnvidoCode) as EnvidoCall[];
  return calls.filter(call => originalEnvidoRaiseAllowed(wager, last, call, origin));
}

export function faltaEnvidoPoints(playerScore: number, cpuScore: number): number {
  return originalWagerCap(30, playerScore, cpuScore);
}

export function acceptedEnvidoPoints(sequence: EnvidoCall[], playerScore: number, cpuScore: number): number {
  if (sequence.includes("falta-envido")) return faltaEnvidoPoints(playerScore, cpuScore);
  const stake = sequence.reduce(originalEnvidoRaisedWager, 0);
  return originalWagerCap(stake, playerScore, cpuScore);
}

export function rejectedEnvidoPoints(sequence: EnvidoCall[], playerScore: number, cpuScore: number): number {
  if (sequence.length === 1) return 1;
  return acceptedEnvidoPoints(sequence.slice(0, -1), playerScore, cpuScore);
}

export function describeEnvido(sequence: EnvidoCall[]): string {
  const envidos = sequence.filter((call) => call === "envido").length;
  const reales = sequence.filter((call) => call === "real-envido").length;
  if (sequence.at(-1) === "falta-envido") return "Falta Envido";
  if (reales === 2 && envidos === 0) return "Dos Reales Envido";
  return sequence.map((call) => envidoLabel[call]).join(" + ");
}
