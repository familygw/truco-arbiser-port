/**
 * Text parser reconstructed from TRUCO.EXE.
 *
 * Stable literal tokens and their numeric codes come from the disassembled
 * QuickBASIC routine at linear 08957-08DCB. Codes 24/25 used runtime strings;
 * the web port maps those roles to "quiero" and "no quiero".
 */

export type OriginalCommandCode =
  | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13
  | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26;

export type OriginalCommand = {
  code: OriginalCommandCode;
  normalized: string;
  cardIndex?: 0 | 1 | 2;
};

export const ORIGINAL_INSULT_STEMS = [
  "put", "mierd", "pij", "conch", "bolud", "pelotu", "caraj", "chot", "fuck", "garch",
] as const;

export const ORIGINAL_DIRTY_REPLIES = [
  "Shh ... @$?%!~@^",
  "Eso no se dice !",
  "Mal educado !!",
  "Boca sucia !!",
  "Quien te educo ?",
  "Que lexico[s] !!",
  "Lexico'e merda !",
] as const;

export const ORIGINAL_TRUQUE_REPLIES = [
  "Digue bien !!",
  "No joroibe !!",
  "Joigue bien !",
  "Tomate buque!",
  "Anda batuque!",
] as const;

export const ORIGINAL_EXIT_TOKENS = ["salir", "sistema", "system", "aborto", "abortar"] as const;
export const ORIGINAL_ABANDON_REPLY = "Abandonaste, cobarde![#El cuello te arde!][#y llegaste tarde!]";
export const ORIGINAL_DIMINUTIVE_REPLY = "[No sea ]tontito!";
export const ORIGINAL_SEXUAL_REPLY = "El sexo [te ]llama...[#pero papa'gana!][#sana, sana!][#colita de rana!]";
export const ORIGINAL_CREDITS_REPLY = "Graficos, musica,#adaptaciones a#PC y coautoria:#";

const ACCEPTANCE_TOKENS = ["de acuerdo", "esta bien", "olor", "buen", "ok"] as const;
const FOLD_CONTAINS_TOKENS = ["me voy", "mazo", "baraja", "chau", "huyo"] as const;

export function normalizeOriginalText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function has(text: string, token: string): boolean {
  return text.includes(token);
}

function cardSuffix(text: string): 0 | 1 | 2 | undefined {
  const match = text.match(/(?:^| )([123])(?:$| )/);
  return match ? (Number(match[1]) - 1) as 0 | 1 | 2 : undefined;
}

export function parseOriginalCommand(value: string): OriginalCommand {
  const text = normalizeOriginalText(value);
  const cardIndex = cardSuffix(text);
  let code: OriginalCommandCode = -1;

  // The order matters: later matches overwrite broader earlier matches, just
  // like the sequence of MOV [DS:1C98], value instructions in the executable.
  if (has(text, "envido")) code = 1;
  if (has(text, "real envido")) code = 2;
  if (has(text, "dos reales envido")) code = 3;
  if (has(text, "falta envido")) code = 4;

  if (has(text, "carta 1")) code = 9;
  if (has(text, "carta 2")) code = 10;
  if (has(text, "carta 3")) code = 11;

  if (has(text, "truco")) code = 15;
  if (has(text, "truco") && cardIndex === 0) code = 12;
  if (has(text, "truco") && cardIndex === 1) code = 13;
  if (has(text, "truco") && cardIndex === 2) code = 14;

  if (has(text, "flor")) code = 5;
  if (has(text, "con flor ") && has(text, "quiero")) code = 6;
  if (has(text, "contraflor")) code = 7;
  if (has(text, "con flor me achico")) code = 8;

  if (has(text, "quiero") && has(text, " retruco")) code = 19;
  if (has(text, "quiero") && (has(text, " vale 4") || has(text, " vale cuatro"))) code = 23;
  if (has(text, "quiero retruco") && cardIndex === 0) code = 16;
  if (has(text, "quiero retruco") && cardIndex === 1) code = 17;
  if (has(text, "quiero retruco") && cardIndex === 2) code = 18;
  if (has(text, "quiero vale 4") && cardIndex === 0) code = 20;
  if (has(text, "quiero vale 4") && cardIndex === 1) code = 21;
  if (has(text, "quiero vale 4") && cardIndex === 2) code = 22;

  // Runtime descriptors DS:1C8A and DS:1C8E represented the current positive
  // and negative answers. Exact standalone answers are their web equivalents.
  if (text === "quiero") code = 24;
  if (text === "no quiero") code = 25;

  if (code < 0 && ACCEPTANCE_TOKENS.some((token) => has(text, token))) code = 0;
  if (
    code < 0
    && (FOLD_CONTAINS_TOKENS.some((token) => has(text, token)) || text === "rajo")
  ) code = 26;

  return { code, normalized: text, cardIndex };
}

export type OriginalLanguageReply =
  | "insult"
  | "truque"
  | "diminutive"
  | "sexual"
  | "abandon"
  | "credits"
  | "short-yes"
  | "yes"
  | "short-no"
  | "no"
  | null;

export function classifyOriginalLanguage(text: string): OriginalLanguageReply {
  if (text === "s") return "short-yes";
  if (text === "si") return "yes";
  if (text === "n") return "short-no";
  if (text === "no") return "no";
  if (has(text, "abandono")) return "abandon";
  if (ORIGINAL_INSULT_STEMS.some((stem) => has(text, stem))) return "insult";
  if (has(text, "truque")) return "truque";
  if (["envidito", "quierito", "truquito"].some((token) => has(text, token))) return "diminutive";
  if (["coge", "cogi", "coj", "sexo", "sexu"].some((token) => has(text, token))) return "sexual";
  if (has(text, "!&^*$v")) return "credits";
  return null;
}

export function randomOriginalReply(replies: readonly string[]): string {
  return expandOriginalPhrase(replies[Math.floor(Math.random() * replies.length)]);
}

export function expandOriginalPhrase(value: string): string {
  return value
    .replace(/\[([^\]]*)\]/g, (_match, optional: string) => (Math.random() < 0.5 ? optional : ""))
    .replaceAll("#", "\n")
    .trim();
}
