import { FormEvent, useEffect, useMemo, useState } from "react";
import { playMusic, playVoice, stopMusic } from "./audio";
import { acceptedEnvidoPoints, allowedEnvidoRaises, describeEnvido, envidoLabel, rejectedEnvidoPoints, type EnvidoCall } from "./bids";
import { Card, envidoPoints, florPoints, hasFlor, pickCpuCard, shuffledDeck, splitScore, suitLabel, trucoStrength } from "./game";

type Side = "player" | "cpu";
type Phase = "playing" | "hand-over" | "match-over";
type Dialogue = { record: number; voice: string; text: string };
type PendingCall =
  | { kind: "envido"; sequence: EnvidoCall[]; deferredTruco?: 2 | 3 | 4 }
  | { kind: "truco"; nextStake: 2 | 3 | 4 }
  | { kind: "flor"; mode: "flor" | "contraflor" | "resto"; deferredTruco?: 2 | 3 | 4 };

const INSULT_STEMS = ["put", "mierd", "pij", "conch", "bolud", "pelotu", "caraj", "chot", "fuck", "garch"];
const DIRTY_REPLIES = [
  "Shh… @$?%!~@^ Eso no se dice!",
  "¡Mal educado!",
  "¡Boca sucia!",
  "¿Quién te educó?",
  "¡Qué léxico!",
  "¡Léxico'e merda!",
];
const CPU_TAUNTS = [
  "¿Sos humano o androide? ¿Cuántos Kbytes tiene tu marote?",
  "No te la vas a llevar de arriba.",
  "Yo juego mejor que cualquiera. ¿Entendiste?",
  "No se te está enfriando el mate?",
  "Te estoy calando y yo no pierdo mi memoria…",
];

function freshHand() {
  const deck = shuffledDeck();
  return { player: deck.slice(0, 3), cpu: deck.slice(3, 6) };
}

function pendingCallLabel(call: PendingCall): string {
  if (call.kind === "envido") return describeEnvido(call.sequence);
  if (call.kind === "flor") return call.mode === "flor" ? "FLOR" : call.mode === "contraflor" ? "CONTRAFLOR" : "CONTRAFLOR AL RESTO";
  return call.nextStake === 2 ? "TRUCO" : call.nextStake === 3 ? "RETRUCO" : "VALE 4";
}

function decideHand(results: number[]): number | null {
  const [a, b, c] = results;
  if (results.length >= 2) {
    if (a === b && a !== 0) return a;
    if (a === 0 && b !== 0) return b;
    if (a !== 0 && b === 0) return a;
  }
  if (results.length === 3) return c || a || 1;
  return null;
}

function PlayingCard({ card, onPlay, disabled = false, compact = false }: { card: Card; onPlay?: () => void; disabled?: boolean; compact?: boolean }) {
  const content = (
    <>
      <span className="card-rank">{card.rank}</span>
      <img src={`/original/carta-${card.suit}.png`} alt={`${card.rank} de ${suitLabel[card.suit]}`} />
      <span className="card-suit">{suitLabel[card.suit]}</span>
    </>
  );
  return onPlay ? (
    <button className={`playing-card suit-${card.suit} ${compact ? "compact" : ""}`} onClick={onPlay} disabled={disabled} aria-label={`Jugar ${card.rank} de ${suitLabel[card.suit]}`}>
      {content}
    </button>
  ) : <div className={`playing-card suit-${card.suit} ${compact ? "compact" : ""}`}>{content}</div>;
}

function CardBack() {
  return <div className="card-back" aria-label="Carta tapada"><span>TA</span></div>;
}

function Score({ label, value, active }: { label: string; value: number; active?: boolean }) {
  const split = splitScore(value);
  return (
    <div className={`score-row ${active ? "active" : ""}`}>
      <span>{label}</span>
      <strong>{split.malas || split.buenas}</strong>
      <em>{value < 15 ? "malas" : "buenas"}</em>
    </div>
  );
}

export default function App() {
  const initial = useMemo(freshHand, []);
  const [started, setStarted] = useState(false);
  const [view, setView] = useState<"game" | "archive">("game");
  const [playerCards, setPlayerCards] = useState(initial.player);
  const [cpuCards, setCpuCards] = useState(initial.cpu);
  const [table, setTable] = useState<Array<{ player: Card; cpu: Card }>>([]);
  const [tricks, setTricks] = useState<number[]>([]);
  const [score, setScore] = useState({ player: 0, cpu: 0 });
  const [stake, setStake] = useState(1);
  const [trucoCaller, setTrucoCaller] = useState<Side | null>(null);
  const [envidoDone, setEnvidoDone] = useState(false);
  const [phase, setPhase] = useState<Phase>("playing");
  const [speech, setSpeech] = useState("Barajando electrones… elegí una carta.");
  const [lastWinner, setLastWinner] = useState<Side | null>(null);
  const [command, setCommand] = useState("");
  const [sound, setSound] = useState(true);
  const [voice, setVoice] = useState(false);
  const [handNumber, setHandNumber] = useState(1);
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [pendingCall, setPendingCall] = useState<PendingCall | null>(null);
  const [openingChecked, setOpeningChecked] = useState(false);
  // Visible until autoplay is positively confirmed. Some browsers leave
  // AudioContext.resume() pending instead of rejecting it.
  const [introBlocked, setIntroBlocked] = useState(true);

  useEffect(() => {
    fetch("/original/dialogos.json").then((response) => response.json()).then(setDialogues).catch(() => setDialogues([]));
  }, []);

  useEffect(() => {
    if (started) {
      stopMusic();
      return;
    }
    // Schedule after the splash is painted. StrictMode cancels its trial
    // effect before this timer fires, so the intro is started only once.
    let cancelled = false;
    const introTimer = window.setTimeout(() => {
      void playMusic("intro", true).then((played) => {
        if (!cancelled) setIntroBlocked(!played);
      });
    }, 225);
    return () => {
      cancelled = true;
      window.clearTimeout(introTimer);
      stopMusic();
    };
  }, [started]);

  const matchWinner = score.player >= 30 ? "Vos" : score.cpu >= 30 ? "La CPU" : null;
  const canFlor = hasFlor(playerCards) && !envidoDone && tricks.length === 0;
  const trucoLabel = stake === 1 ? "Truco" : stake === 2 ? "Retruco" : stake === 3 ? "Vale 4" : "Cantado";

  useEffect(() => {
    if (!started || phase !== "playing" || openingChecked || tricks.length > 0 || pendingCall) return;
    const timer = window.setTimeout(() => {
      setOpeningChecked(true);
      const cpuEnvido = envidoPoints(cpuCards);
      const cpuBestCard = Math.max(...cpuCards.map(trucoStrength));
      if (!envidoDone && hasFlor(cpuCards)) {
        setEnvidoDone(true);
        void playMusic("flor", sound);
        if (hasFlor(playerCards)) {
          setPendingCall({ kind: "flor", mode: "flor" });
          say("¡Flor! Vos también tenés: con flor quiero, contraflor o te achicás.", 49);
        } else {
          addPoints("cpu", 3);
          say("¡Flor! Tres puntos para la CPU.", 49);
        }
      } else if (!envidoDone && cpuEnvido >= 25 && Math.random() < 0.68) {
        const openingCall: EnvidoCall = cpuEnvido >= 32 && Math.random() < 0.32 ? "falta-envido" : cpuEnvido >= 29 && Math.random() < 0.4 ? "real-envido" : "envido";
        setPendingCall({ kind: "envido", sequence: [openingCall] });
        say(`¡${envidoLabel[openingCall]}! Te toca contestar a vos.`, openingCall === "falta-envido" ? 37 : openingCall === "real-envido" ? 13 : 1);
        void playMusic(openingCall === "real-envido" ? "real" : "envido", sound);
      } else if (stake < 4 && trucoCaller !== "cpu" && cpuBestCard >= 12 && Math.random() < 0.48) {
        cpuCallsTruco((stake + 1) as 2 | 3 | 4);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [started, phase, openingChecked, tricks.length, pendingCall, cpuCards, playerCards, envidoDone, stake, trucoCaller, sound]);

  function say(text: string, voiceIndex?: number) {
    setSpeech(text);
    if (voiceIndex) void playVoice(voiceIndex, voice);
  }

  function addPoints(side: Side, points: number) {
    setScore((current) => {
      const next = { ...current, [side]: current[side] + points };
      if (next[side] >= 30) setPhase("match-over");
      return next;
    });
  }

  function finishHand(side: Side, points: number, message: string) {
    addPoints(side, points);
    setLastWinner(side);
    setPhase("hand-over");
    say(message, side === "cpu" ? 145 : undefined);
    void playMusic(side === "player" ? "handWin" : "handLose", sound);
  }

  function cpuCallsTruco(nextStake: 2 | 3 | 4) {
    setPendingCall({ kind: "truco", nextStake });
    const label = nextStake === 2 ? "¡Truco!" : nextStake === 3 ? "¡Retruco!" : "¡Vale cuatro!";
    say(`${label} La CPU cantó; ahora contestás vos.`, nextStake === 3 ? 98 : nextStake === 4 ? 109 : 86);
    void playMusic(nextStake === 2 ? "truco" : nextStake === 3 ? "retruco" : "vale4", sound);
  }

  function playCard(card: Card) {
    if (phase !== "playing" || pendingCall) return;
    const cpuCard = pickCpuCard(cpuCards, card, tricks);
    setPlayerCards((cards) => cards.filter((item) => item.id !== card.id));
    setCpuCards((cards) => cards.filter((item) => item.id !== cpuCard.id));
    setTable((plays) => [...plays, { player: card, cpu: cpuCard }]);
    const result = Math.sign(trucoStrength(card) - trucoStrength(cpuCard));
    const nextTricks = [...tricks, result];
    setTricks(nextTricks);
    const handResult = decideHand(nextTricks);
    if (handResult) {
      finishHand(handResult > 0 ? "player" : "cpu", stake, handResult > 0 ? "Ganaste la mano. No te engrupas…" : "¡Dormiste afuera! ¿Querés una frazada?");
    } else if (stake < 4 && trucoCaller !== "cpu" && Math.max(...cpuCards.filter((item) => item.id !== cpuCard.id).map(trucoStrength)) >= 10 && Math.random() < 0.34) {
      cpuCallsTruco((stake + 1) as 2 | 3 | 4);
    } else if (result > 0) say("Esta baza es tuya. Todavía no terminó.");
    else if (result < 0) say(CPU_TAUNTS[Math.floor(Math.random() * CPU_TAUNTS.length)]);
    else say("Parda. La primera manda.");
  }

  function restoreDeferredTruco(deferredTruco?: 2 | 3 | 4) {
    setPendingCall(deferredTruco ? { kind: "truco", nextStake: deferredTruco } : null);
    if (deferredTruco) say("El Envido terminó. Todavía tenés que contestar el Truco.");
  }

  function resolveAcceptedEnvido(sequence: EnvidoCall[], deferredTruco?: 2 | 3 | 4) {
    const yours = envidoPoints(playerCards);
    const theirs = envidoPoints(cpuCards);
    const side: Side = yours >= theirs ? "player" : "cpu";
    const points = acceptedEnvidoPoints(sequence, score.player, score.cpu);
    setEnvidoDone(true);
    addPoints(side, points);
    restoreDeferredTruco(deferredTruco);
    say(`${describeEnvido(sequence)} querido: ${yours} contra ${theirs}. ${points} para ${side === "player" ? "vos" : "la CPU"}.`, 13);
    void playMusic(side === "player" ? "win" : "lose", sound);
  }

  function cpuRespondsToEnvido(sequence: EnvidoCall[], deferredTruco?: 2 | 3 | 4) {
    const cpuHasFlor = hasFlor(cpuCards);
    if (cpuHasFlor) {
      setEnvidoDone(true);
      void playMusic("flor", sound);
      if (hasFlor(playerCards)) {
        setPendingCall({ kind: "flor", mode: "flor", deferredTruco });
        say("El Envido no corre: tengo Flor. ¿Con flor querés o te achicás?", 49);
      } else {
        addPoints("cpu", 3);
        restoreDeferredTruco(deferredTruco);
        say("El Envido no corre porque tengo Flor. Tres para la CPU.", 49);
      }
      return;
    }

    const cpuPoints = envidoPoints(cpuCards);
    const raises = allowedEnvidoRaises(sequence);
    if (cpuPoints < 22 && Math.random() > 0.28) {
      const points = rejectedEnvidoPoints(sequence, score.player, score.cpu);
      setEnvidoDone(true);
      addPoints("player", points);
      restoreDeferredTruco(deferredTruco);
      say(`No quiero ${describeEnvido(sequence)}. ${points} para vos.`);
      void playMusic("noQuiero", sound);
      return;
    }
    if (raises.length && cpuPoints >= 29 && Math.random() < 0.58) {
      const raise = raises.includes("falta-envido") && cpuPoints >= 31 ? "falta-envido" : raises.includes("real-envido") ? "real-envido" : raises[0];
      const raisedSequence = [...sequence, raise];
      setPendingCall({ kind: "envido", sequence: raisedSequence, deferredTruco });
      say(`La CPU responde ${envidoLabel[raise]}. Ahora decidís vos.`, raise === "falta-envido" ? 37 : 13);
      void playMusic(raise === "real-envido" ? "real" : "envidoReply", sound);
      return;
    }
    resolveAcceptedEnvido(sequence, deferredTruco);
  }

  function callEnvido(call: EnvidoCall = "envido", deferredTruco?: 2 | 3 | 4) {
    if (envidoDone || tricks.length > 0 || phase !== "playing") return;
    if (pendingCall && pendingCall.kind !== "truco") return;
    const sequence = [call];
    setPendingCall(null);
    void playMusic(call === "real-envido" ? "real" : "envido", sound);
    say(`Cantaste ${envidoLabel[call]}. La CPU decide…`);
    cpuRespondsToEnvido(sequence, deferredTruco);
  }

  function raisePendingEnvido(call: EnvidoCall) {
    if (!pendingCall || pendingCall.kind !== "envido") return;
    const sequence = [...pendingCall.sequence, call];
    const deferredTruco = pendingCall.deferredTruco;
    setPendingCall(null);
    say(`Subís a ${describeEnvido(sequence)}. La CPU decide…`);
    void playMusic(call === "real-envido" ? "real" : call === "falta-envido" ? "envidoReply" : "envido", sound);
    cpuRespondsToEnvido(sequence, deferredTruco);
  }

  function resolveFlor(mode: "flor" | "contraflor" | "resto", deferredTruco?: 2 | 3 | 4) {
    const yours = florPoints(playerCards);
    const theirs = florPoints(cpuCards);
    const side: Side = yours >= theirs ? "player" : "cpu";
    const points = mode === "flor" ? 4 : mode === "contraflor" ? 6 : acceptedEnvidoPoints(["falta-envido"], score.player, score.cpu);
    restoreDeferredTruco(deferredTruco);
    setEnvidoDone(true);
    addPoints(side, points);
    say(`${yours} de Flor contra ${theirs}. ${points} para ${side === "player" ? "vos" : "la CPU"}.`, side === "player" ? 61 : 121);
    void playMusic(side === "player" ? "florReply" : "lose", sound);
  }

  function raisePendingFlor(mode: "contraflor" | "resto") {
    if (!pendingCall || pendingCall.kind !== "flor") return;
    const cpuFlor = florPoints(cpuCards);
    const deferredTruco = pendingCall.deferredTruco;
    setPendingCall(null);
    void playMusic("florReply", sound);
    if (cpuFlor < 28 && Math.random() > 0.3) {
      addPoints("player", 4);
      restoreDeferredTruco(deferredTruco);
      say(`Con Flor me achico. Cuatro para vos.`, 73);
      return;
    }
    if (mode === "contraflor" && cpuFlor >= 32 && Math.random() < 0.55) {
      setPendingCall({ kind: "flor", mode: "resto", deferredTruco });
      say("¡Contraflor al resto! Te toca responder.", 121);
      return;
    }
    resolveFlor(mode, deferredTruco);
  }

  function callFlor() {
    if (!canFlor || phase !== "playing" || pendingCall) return;
    setEnvidoDone(true);
    void playMusic("flor", sound);
    if (!hasFlor(cpuCards)) {
      addPoints("player", 3);
      say("Flor. Tres puntos para vos.", 49);
      return;
    }
    const cpuFlor = florPoints(cpuCards);
    if (cpuFlor < 27 && Math.random() > 0.35) {
      addPoints("player", 3);
      say("Con Flor me achico. Tres para vos.", 73);
    } else if (cpuFlor >= 32 && Math.random() < 0.5) {
      setPendingCall({ kind: "flor", mode: "resto" });
      say("¡Contraflor al resto! Te toca responder.", 121);
    } else {
      resolveFlor("flor");
    }
  }

  function offerTrucoToCpu() {
    if (stake >= 4 || trucoCaller === "player") return;
    void playMusic(stake === 1 ? "truco" : stake === 2 ? "retruco" : "vale4", sound);
    const best = Math.max(...cpuCards.map(trucoStrength));
    if (best < 7 && Math.random() > 0.35) {
      finishHand("player", stake, "No quiero. Soldado que huye sirve pa' otra guerra.");
      return;
    }
    const next = stake + 1;
    setStake(next);
    setTrucoCaller("player");
    say(next === 2 ? "Quiero… pero no jorobes: jugá bien." : next === 3 ? "¡Quiero retruco!" : "¡Quiero vale cuatro!", next === 3 ? 98 : next === 4 ? 109 : 86);
  }

  function callTruco() {
    if (stake >= 4 || trucoCaller === "player" || phase !== "playing" || pendingCall) return;
    offerTrucoToCpu();
  }

  function fold() {
    if (phase !== "playing" || pendingCall) return;
    finishHand("cpu", stake, "Abandonaste, cobarde. ¡El cuello te arde!");
  }

  function acceptPendingCall() {
    if (!pendingCall) return;
    if (pendingCall.kind === "truco") {
      setStake(pendingCall.nextStake);
      setTrucoCaller("cpu");
      setPendingCall(null);
      say("Quiero. Seguimos jugando.");
      void playMusic("quiero", sound);
      return;
    }
    if (pendingCall.kind === "flor") {
      resolveFlor(pendingCall.mode, pendingCall.deferredTruco);
      return;
    }
    resolveAcceptedEnvido(pendingCall.sequence, pendingCall.deferredTruco);
  }

  function rejectPendingCall() {
    if (!pendingCall) return;
    const rejected = pendingCall;
    setPendingCall(null);
    if (rejected.kind === "envido") {
      setEnvidoDone(true);
      const points = rejectedEnvidoPoints(rejected.sequence, score.player, score.cpu);
      addPoints("cpu", points);
      restoreDeferredTruco(rejected.deferredTruco);
      say(`No quiero ${describeEnvido(rejected.sequence)}. ${points} para la CPU.`);
      void playMusic("noQuiero", sound);
    } else if (rejected.kind === "flor") {
      const points = rejected.mode === "flor" ? 3 : 4;
      addPoints("cpu", points);
      restoreDeferredTruco(rejected.deferredTruco);
      say(`Con Flor me achico. ${points} para la CPU.`, 73);
    } else {
      finishHand("cpu", stake, "No quiero. La apuesta anterior es para la CPU.");
    }
  }

  function answerEnvidoAndTruco(accept: boolean) {
    if (!pendingCall || pendingCall.kind !== "envido") return;
    const envido = pendingCall;
    if (accept) resolveAcceptedEnvido(envido.sequence);
    else {
      const points = rejectedEnvidoPoints(envido.sequence, score.player, score.cpu);
      setPendingCall(null);
      setEnvidoDone(true);
      addPoints("cpu", points);
    }
    offerTrucoToCpu();
  }

  function interruptTrucoWithEnvido(call: EnvidoCall) {
    if (!pendingCall || pendingCall.kind !== "truco" || envidoDone || tricks.length > 0) return;
    callEnvido(call, pendingCall.nextStake);
  }

  function raisePendingTruco() {
    if (!pendingCall || pendingCall.kind !== "truco" || pendingCall.nextStake >= 4) return;
    const raisedStake = (pendingCall.nextStake + 1) as 3 | 4;
    setPendingCall(null);
    const cpuBest = Math.max(...cpuCards.map(trucoStrength));
    void playMusic(raisedStake === 3 ? "retruco" : "vale4", sound);
    if (cpuBest < 8 && Math.random() > 0.35) {
      finishHand("player", pendingCall.nextStake, `No quiero tu ${raisedStake === 3 ? "retruco" : "vale cuatro"}.`);
      return;
    }
    setStake(raisedStake);
    setTrucoCaller("player");
    say(`Quiero tu ${raisedStake === 3 ? "retruco" : "vale cuatro"}.`, raisedStake === 3 ? 98 : 109);
  }

  function nextHand() {
    if (matchWinner) {
      const next = freshHand();
      setScore({ player: 0, cpu: 0 });
      setPlayerCards(next.player);
      setCpuCards(next.cpu);
      setTable([]);
      setTricks([]);
      setStake(1);
      setTrucoCaller(null);
      setEnvidoDone(false);
      setLastWinner(null);
      setPhase("playing");
      setHandNumber(1);
      setPendingCall(null);
      setOpeningChecked(false);
      say("Revancha. Ahora ya sé cómo jugás.");
      return;
    }
    const next = freshHand();
    setPlayerCards(next.player);
    setCpuCards(next.cpu);
    setTable([]);
    setTricks([]);
    setStake(1);
    setTrucoCaller(null);
    setEnvidoDone(false);
    setLastWinner(null);
    setPhase("playing");
    setPendingCall(null);
    setOpeningChecked(false);
    setHandNumber((value) => value + 1);
    say(CPU_TAUNTS[Math.floor(Math.random() * CPU_TAUNTS.length)]);
    void playMusic("deal", sound);
  }

  function handleGameCommand(text: string): boolean {
    if (phase !== "playing") return false;

    if (pendingCall?.kind === "envido") {
      const raises = allowedEnvidoRaises(pendingCall.sequence);
      if (text.includes("falta envido") && raises.includes("falta-envido")) { raisePendingEnvido("falta-envido"); return true; }
      if ((text.includes("real envido") || text.includes("dos reales")) && raises.includes("real-envido")) { raisePendingEnvido("real-envido"); return true; }
      if (text.includes("envido") && raises.includes("envido")) { raisePendingEnvido("envido"); return true; }
      if (text.includes("no quiero") && text.includes("truco")) { answerEnvidoAndTruco(false); return true; }
      if (text.includes("quiero") && text.includes("truco")) { answerEnvidoAndTruco(true); return true; }
      if (text === "quiero" || text === "de acuerdo" || text === "esta bien") { acceptPendingCall(); return true; }
      if (text === "no" || text.includes("no quiero")) { rejectPendingCall(); return true; }
      if (text.includes("truco")) { say("Primero contestá el Envido: quiero, no quiero o subí la apuesta."); return true; }
      return false;
    }

    if (pendingCall?.kind === "truco") {
      if (!envidoDone && tricks.length === 0 && text.includes("falta envido")) { interruptTrucoWithEnvido("falta-envido"); return true; }
      if (!envidoDone && tricks.length === 0 && text.includes("real envido")) { interruptTrucoWithEnvido("real-envido"); return true; }
      if (!envidoDone && tricks.length === 0 && text.includes("envido")) { interruptTrucoWithEnvido("envido"); return true; }
      if ((text.includes("retruco") || text.includes("vale 4") || text.includes("vale cuatro")) && pendingCall.nextStake < 4) { raisePendingTruco(); return true; }
      if (text === "quiero" || text === "de acuerdo" || text === "esta bien") { acceptPendingCall(); return true; }
      if (text === "no" || text.includes("no quiero")) { rejectPendingCall(); return true; }
      return false;
    }

    if (pendingCall?.kind === "flor") {
      if (text.includes("con flor me achico")) { rejectPendingCall(); return true; }
      if (text.includes("contraflor al resto")) { raisePendingFlor("resto"); return true; }
      if (text.includes("contraflor")) { raisePendingFlor("contraflor"); return true; }
      if (text.includes("con flor") || text === "quiero") { acceptPendingCall(); return true; }
      return false;
    }

    if (text.includes("falta envido")) { callEnvido("falta-envido"); return true; }
    if (text.includes("real envido") || text.includes("dos reales")) { callEnvido("real-envido"); return true; }
    if (text.includes("envido")) { callEnvido("envido"); return true; }
    if (text.includes("flor")) { callFlor(); return true; }
    if (text.includes("truco") || text.includes("retruco") || text.includes("vale 4") || text.includes("vale cuatro")) { callTruco(); return true; }
    if (["mazo", "baraja", "me voy", "huyo", "rajo", "abandono"].some((word) => text.includes(word))) { fold(); return true; }
    const cardMatch = text.match(/^carta\s*([123])$/);
    if (cardMatch) { const card = playerCards[Number(cardMatch[1]) - 1]; if (card) playCard(card); return true; }
    return false;
  }

  function submitCommand(event: FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (INSULT_STEMS.some((stem) => normalized.includes(stem))) {
      say(DIRTY_REPLIES[Math.floor(Math.random() * DIRTY_REPLIES.length)]);
      void playMusic("truco", sound);
    } else if (handleGameCommand(normalized)) {
      // The command already changed the current bid/card state.
    } else if (normalized.includes("envido")) say("¿Dijiste envido? Usá el botón, humanoide.", 1);
    else if (normalized.includes("truco")) say("Digue bien. ¡Joigue bien!", 86);
    else if (/^(si|s|no|n)$/.test(normalized)) say("¿Qué me querés decir con eso? Cerrá bien, por favor.");
    else say("¿Quién te entiende, mi duende?");
    setCommand("");
  }

  function startGame() {
    stopMusic();
    setStarted(true);
  }

  async function activateSplashAudio() {
    const played = await playMusic("intro", true);
    setIntroBlocked(!played);
  }

  // show landing, first splash
  if (!started) {
    return (
      <main className="intro-shell">
        <div className="intro-card glass">
          <p className="eyebrow">RECUPERACIÓN DIGITAL // 1986 → WEB</p>
          <img src="/original/pantalla-bsave.png" alt="Pantalla original de Truco Arbiser recuperada desde CGA" />
          <div className="intro-copy">
            <h1>El truco volvió a la mesa.</h1>
            <p>Cartas, versos, música y voces extraídos del programa original. Baraja española y una CPU que todavía tiene memoria.</p>
          </div>
          {introBlocked ? <button className="sound-unlock" onClick={() => void activateSplashAudio()}>▶ ACTIVAR SONIDO DEL SPLASH</button> : null}
          <button className="primary-button" onClick={startGame}>JUGAR PARTIDA <span>↗</span></button>
          <small>Por Ariel Arbiser y Enrique Arbiser · Port experimental</small>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar glass">
        <div className="brand"><span className="brand-mark">TA</span><div><strong>TRUCO ARBISER</strong><small>WEB PORT // BUILD 0.1</small></div></div>
        <nav aria-label="Vistas">
          <button className={view === "game" ? "selected" : ""} onClick={() => setView("game")}>Partida</button>
          <button className={view === "archive" ? "selected" : ""} onClick={() => setView("archive")}>Archivo recuperado</button>
        </nav>
        <div className="toggles">
          <button onClick={() => setSound((value) => !value)} aria-pressed={sound}>Música {sound ? "ON" : "OFF"}</button>
          <button onClick={() => setVoice((value) => !value)} aria-pressed={voice}>Voz {voice ? "ON" : "OFF"}</button>
        </div>
      </header>

      {view === "game" ? (
        <section className="game-layout">
          <div className="table glass">
            <div className="scanlines" />
            <section className="cpu-zone">
              <div className="player-label"><span className="status-dot" /> CPU_ARBITER <em>{3 - tricks.length} cartas</em></div>
              <div className="cpu-hand">{cpuCards.map((card) => <CardBack key={card.id} />)}</div>
            </section>

            <div className="speech glass" aria-live="polite"><span>CPU</span><p>{speech}</p></div>

            <section className="play-zone" aria-label="Cartas jugadas en la mesa">
              <div className="hand-stamp"><span>MANO {String(handNumber).padStart(2, "0")}</span><strong>×{stake}</strong></div>
              <div className="played-pairs">
                {[0, 1, 2].map((index) => {
                  const play = table[index];
                  return (
                    <div className={`trick-pair ${play ? "occupied" : ""}`} key={index}>
                      <div className="played-slot cpu-slot">{play ? <PlayingCard card={play.cpu} compact /> : <span>CPU</span>}</div>
                      <span className="trick-number">BAZA {index + 1}</span>
                      <div className="played-slot player-slot">{play ? <PlayingCard card={play.player} compact /> : <span>VOS</span>}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="player-zone">
              <div className="player-label"><span className="status-dot human" /> VOS <em>{envidoPoints(playerCards)} de envido</em></div>
              <div className="player-hand">
                {playerCards.map((card) => <PlayingCard key={card.id} card={card} onPlay={() => playCard(card)} disabled={phase !== "playing" || pendingCall !== null || !openingChecked} />)}
              </div>
            </section>
          </div>

          <aside className="side-panel">
            <section className="scoreboard glass">
              <div className="panel-heading"><span>TRUCÓMETRO</span><em>A 30</em></div>
              <Score label="CPU" value={score.cpu} active={lastWinner === "cpu"} />
              <Score label="VOS" value={score.player} active={lastWinner === "player"} />
              <div className="score-track"><i style={{ width: `${Math.min(100, (score.player / 30) * 100)}%` }} /></div>
            </section>

            <section className="actions glass">
              <div className={`panel-heading ${pendingCall ? "cpu-call-heading" : ""}`}><span>{pendingCall ? "LA CPU CANTÓ" : "TU JUGADA"}</span><em>ESTACA ×{stake}</em></div>
              {phase === "playing" && pendingCall ? <>
                <div className="call-notice">
                  <small>TE TOCA RESPONDER</small>
                  <strong>{pendingCallLabel(pendingCall)}</strong>
                </div>
                <button className="action-primary" onClick={acceptPendingCall}>{pendingCall.kind === "flor" ? "Con flor quiero" : "Quiero"}<small>Aceptar la propuesta</small></button>
                <div className="bid-options">
                  <button onClick={rejectPendingCall}>{pendingCall.kind === "flor" ? "Con flor me achico" : "No quiero"}<small>Rechazar</small></button>
                  {pendingCall.kind === "envido" ? <>
                    {allowedEnvidoRaises(pendingCall.sequence).map((call) => <button key={call} onClick={() => raisePendingEnvido(call)}>{call === "envido" && pendingCall.sequence.includes("envido") ? "Envido envido" : envidoLabel[call]}<small>Subir el tanto</small></button>)}
                    {stake < 4 && trucoCaller !== "player" ? <>
                      <button onClick={() => answerEnvidoAndTruco(true)}>Quiero y {trucoLabel}<small>Resolver y cantar</small></button>
                      <button onClick={() => answerEnvidoAndTruco(false)}>No quiero y {trucoLabel}<small>Ceder y cantar</small></button>
                    </> : null}
                  </> : null}
                  {pendingCall.kind === "truco" ? <>
                    {pendingCall.nextStake < 4 ? <button onClick={raisePendingTruco}>Quiero y {pendingCall.nextStake === 2 ? "retruco" : "vale 4"}<small>Aceptar y subir</small></button> : null}
                    {!envidoDone && tricks.length === 0 ? <>
                      <button onClick={() => interruptTrucoWithEnvido("envido")}>Envido<small>Se resuelve primero</small></button>
                      <button onClick={() => interruptTrucoWithEnvido("real-envido")}>Real Envido<small>Se resuelve primero</small></button>
                      <button onClick={() => interruptTrucoWithEnvido("falta-envido")}>Falta Envido<small>Se resuelve primero</small></button>
                    </> : null}
                  </> : null}
                  {pendingCall.kind === "flor" ? <>
                    {pendingCall.mode === "flor" ? <button onClick={() => raisePendingFlor("contraflor")}>Contraflor<small>Subir a seis</small></button> : null}
                    {pendingCall.mode !== "resto" ? <button onClick={() => raisePendingFlor("resto")}>Contraflor al resto<small>Jugar el partido</small></button> : null}
                  </> : null}
                </div>
              </> : phase === "playing" ? <>
                <button className="action-primary" onClick={callTruco} disabled={!openingChecked || stake >= 4 || trucoCaller === "player"}>{trucoLabel}<small>{!openingChecked ? "La CPU revisa sus cartas" : trucoCaller === "player" ? "Esperá que suba la CPU" : "Subir la apuesta"}</small></button>
                <div className="bid-options normal-bids">
                  <button onClick={() => callEnvido("envido")} disabled={!openingChecked || envidoDone || tricks.length > 0 || canFlor}>Envido<small>Dos puntos</small></button>
                  <button onClick={() => callEnvido("real-envido")} disabled={!openingChecked || envidoDone || tricks.length > 0 || canFlor}>Real Envido<small>Tres puntos</small></button>
                  <button onClick={() => callEnvido("falta-envido")} disabled={!openingChecked || envidoDone || tricks.length > 0 || canFlor}>Falta Envido<small>Hasta las buenas</small></button>
                  <button onClick={callFlor} disabled={!openingChecked || !canFlor}>Flor<small>{canFlor ? "La tenés" : "Sin flor"}</small></button>
                </div>
                <button className="fold-button" onClick={fold}>Irse al mazo</button>
              </> : <button className="action-primary next" onClick={nextHand}>{matchWinner ? "REVANCHA" : "SIGUIENTE MANO"}<small>{matchWinner ? `${matchWinner} ganó la partida` : "Volver a repartir"}</small></button>}
            </section>

            <section className="trick-log glass">
              <div className="panel-heading"><span>BAZAS</span><em>{tricks.length}/3</em></div>
              <div>{[0, 1, 2].map((index) => <i key={index} className={tricks[index] > 0 ? "won" : tricks[index] < 0 ? "lost" : tricks[index] === 0 ? "tied" : ""}>{tricks[index] > 0 ? "V" : tricks[index] < 0 ? "C" : tricks[index] === 0 ? "P" : "·"}</i>)}</div>
            </section>
          </aside>

          <form className="command-line glass" onSubmit={submitCommand}>
            <span>&gt;_</span>
            <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Decile algo a la CPU… pero cuidá el léxico" aria-label="Hablarle a la CPU" />
            <button type="submit">ENVIAR</button>
          </form>
        </section>
      ) : (
        <section className="archive-layout">
          <article className="archive-hero glass">
            <div><p className="eyebrow">ARQUEOLOGÍA DEL EJECUTABLE</p><h2>No fue una imitación.<br />Fue una excavación.</h2><p>Los recursos que ves acá salieron de los archivos originales: buffers gráficos CGA de QuickBasic, 156 registros de diálogo y sus 156 muestras de voz de un bit.</p></div>
            <img src="/original/pantalla-bsave.png" alt="Título CGA recuperado" />
          </article>
          <div className="recovery-grid">
            <article className="glass recovery-card"><span className="big-number">04</span><h3>Buffers de cartas</h3><p>46 × 60 píxeles, 2 bits por píxel. Oro, copa, espada y basto, ahora usados dentro de las cartas glass.</p><div className="sprite-row">{["oro", "copa", "espada", "basto"].map((suit) => <img key={suit} src={`/original/carta-${suit}.png`} alt={suit} />)}</div></article>
            <article className="glass recovery-card"><span className="big-number">156</span><h3>Voces originales</h3><p>Los `.VOZ` son un flujo de un bit. El navegador los desempaqueta y reproduce con WebAudio.</p><button onClick={() => void playVoice(86, voice)}>▶ Probar “Truco”</button></article>
            <article className="glass recovery-card code-card"><span className="big-number">10</span><h3>Raíces de insultos</h3><p>Recuperadas del ejecutable:</p><code>{INSULT_STEMS.join(" · ")}</code></article>
          </div>
          <section className="dialogue-browser glass">
            <div className="panel-heading"><span>DIÁLOGOS RECUPERADOS</span><em>{dialogues.length || 156} REGISTROS</em></div>
            <div className="dialogue-grid">
              {dialogues.slice(0, 18).map((dialogue) => <button key={dialogue.record} onClick={() => { say(dialogue.text, dialogue.record); setView("game"); }}><span>T{String(dialogue.record).padStart(3, "0")}</span><p>{dialogue.text.replaceAll("\n", " ")}</p><i>▶</i></button>)}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
