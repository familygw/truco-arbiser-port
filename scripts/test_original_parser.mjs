import assert from "node:assert/strict";
import {
  classifyOriginalLanguage,
  expandOriginalPhrase,
  parseOriginalCommand,
} from "../src/original-parser.ts";
import { acceptedEnvidoPoints, allowedEnvidoRaises, rejectedEnvidoPoints } from "../src/bids.ts";
import { trucoStrength } from "../src/game.ts";

const commands = [
  ["envido", 1], ["real envido", 2], ["dos reales envido", 3], ["falta envido", 4],
  ["flor", 5], ["con flor quiero", 6], ["contraflor", 7], ["con flor me achico", 8],
  ["carta 1", 9], ["carta 2", 10], ["carta 3", 11],
  ["truco 1", 12], ["truco 2", 13], ["truco 3", 14], ["truco", 15],
  ["quiero retruco 1", 16], ["quiero retruco 2", 17], ["quiero retruco 3", 18],
  ["quiero retruco", 19], ["quiero vale 4 1", 20], ["quiero vale 4 2", 21],
  ["quiero vale 4 3", 22], ["quiero vale cuatro", 23], ["quiero", 24],
  ["no quiero", 25], ["chau", 26], ["rajo", 26], ["abandono", -1], ["de acuerdo", 0],
  ["envido boludo", 1], ["bueno", 0],
];

for (const [text, expected] of commands) {
  assert.equal(parseOriginalCommand(text).code, expected, text);
}

const languageCases = [
  ["s", "short-yes"], ["si", "yes"], ["n", "short-no"], ["no", "no"],
  ["abandono", "abandon"], ["sos un boludo", "insult"], ["truque", "truque"],
  ["envidito", "diminutive"], ["sexo", "sexual"], ["!&^*$v", "credits"],
];

for (const [text, expected] of languageCases) {
  assert.equal(classifyOriginalLanguage(text), expected, text);
}

assert.equal(expandOriginalPhrase("hola#mundo").includes("\n"), true);
assert.equal(expandOriginalPhrase("Que lexico[s] !!").includes("["), false);

assert.deepEqual(allowedEnvidoRaises(["real-envido", "real-envido"]), ["falta-envido"]);
assert.equal(acceptedEnvidoPoints(["real-envido", "real-envido"], 1, 2), 6);
assert.equal(rejectedEnvidoPoints(["real-envido", "real-envido", "falta-envido"], 1, 2), 6);
assert.equal(trucoStrength({ id: "11-basto", rank: 11, suit: "basto" }) > trucoStrength({ id: "4-basto", rank: 4, suit: "basto" }), true);

console.log(`Parser y apuestas originales: ${commands.length + languageCases.length + 6} casos OK`);
