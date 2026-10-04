import { originalWagerCap } from "./original-game-logic.ts";

export type EnvidoCall = "envido" | "real-envido" | "falta-envido";

export const envidoLabel: Record<EnvidoCall, string> = {
  envido: "Envido",
  "real-envido": "Real Envido",
  "falta-envido": "Falta Envido",
};

export function allowedEnvidoRaises(sequence: EnvidoCall[]): EnvidoCall[] {
  if (sequence.includes("falta-envido")) return [];
  const envidos = sequence.filter((call) => call === "envido").length;
  const reales = sequence.filter((call) => call === "real-envido").length;
  const last = sequence.at(-1);
  const raises: EnvidoCall[] = [];
  // El Envido sólo puede repetirse inmediatamente; nunca puede bajar un
  // Real Envido ya cantado (el original responde "mal cantado, che").
  if (last === "envido" && envidos < 2) raises.push("envido");
  if (reales < 2) raises.push("real-envido");
  raises.push("falta-envido");
  return raises;
}

export function faltaEnvidoPoints(playerScore: number, cpuScore: number): number {
  return originalWagerCap(30, playerScore, cpuScore);
}

export function acceptedEnvidoPoints(sequence: EnvidoCall[], playerScore: number, cpuScore: number): number {
  if (sequence.includes("falta-envido")) return faltaEnvidoPoints(playerScore, cpuScore);
  const stake = sequence.reduce((total, call) => total + (call === "envido" ? 2 : 3), 0);
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
