import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { playMusic, playVoice, stopMusic } from "./audio";
import { acceptedEnvidoPoints, allowedEnvidoRaises, describeEnvido, envidoLabel, rejectedEnvidoPoints, type EnvidoCall } from "./bids";
import { Card, envidoPoints, florPoints, hasFlor, pickCpuCard, shuffledDeck, splitScore, suitLabel, trucoStrength } from "./game";
import {
  classifyOriginalLanguage,
  expandOriginalPhrase,
  ORIGINAL_ABANDON_REPLY,
  ORIGINAL_CREDITS_REPLY,
  ORIGINAL_DIMINUTIVE_REPLY,
  ORIGINAL_DIRTY_REPLIES,
  ORIGINAL_EXIT_TOKENS,
  ORIGINAL_INSULT_STEMS,
  ORIGINAL_SEXUAL_REPLY,
  ORIGINAL_TRUQUE_REPLIES,
  parseOriginalCommand,
  randomOriginalReply,
  type OriginalCommand,
} from "./original-parser";

type Side = "player" | "cpu";
type Phase = "playing" | "hand-over" | "match-over";
type Dialogue = { record: number; voice: string; text: string };
type TablePlay = { leader: Side; player?: Card; cpu?: Card };
type PendingCall =
  | { kind: "envido"; sequence: EnvidoCall[]; deferredTruco?: 2 | 3 | 4 }
  | { kind: "truco"; nextStake: 2 | 3 | 4 }
  | { kind: "flor"; mode: "flor" | "contraflor" | "resto"; deferredTruco?: 2 | 3 | 4 };
type PendingEnvidoDeclaration = {
  sequence: EnvidoCall[];
  cpuClaim: number;
  cpuActual: number;
  deferredTruco?: 2 | 3 | 4;
  playerTrucoAfter?: boolean;
};
type TantoAudit = {
  kind: "envido" | "flor";
  points: number;
  declaredWinner: Side;
  finalWinner: Side;
  verdict: string;
};

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

function decideHand(results: number[], mano: Side): number | null {
  const [a, b, c] = results;
  if (results.length >= 2) {
    if (a === b && a !== 0) return a;
    if (a === 0 && b !== 0) return b;
    if (a !== 0 && b === 0) return a;
  }
  if (results.length === 3) return c || a || (mano === "player" ? 1 : -1);
  return null;
}

function cpuBluffChance(points: number): number {
  if (points >= 30) return 0.78;
  if (points >= 26) return 0.58;
  if (points >= 22) return 0.38;
  return 0.16;
}

function otherSide(side: Side): Side {
  return side === "player" ? "cpu" : "player";
}

function winnerByPoints(playerPoints: number, cpuPoints: number, mano: Side): Side {
  if (playerPoints === cpuPoints) return mano;
  return playerPoints > cpuPoints ? "player" : "cpu";
}

function cpuEnvidoClaim(actual: number): number {
  if (actual >= 33) return actual;
  // Los versos 46, 102, 105 y 117 del original hablan explícitamente de
  // tirarse el lance y mentir. La frecuencia exacta todavía no está aislada.
  const lieChance = actual >= 30 ? 0.07 : actual >= 27 ? 0.13 : actual >= 20 ? 0.21 : 0.3;
  if (Math.random() >= lieChance) return actual;
  const believableFloor = actual < 20 ? 24 : actual + 1;
  return Math.min(33, believableFloor + Math.floor(Math.random() * (34 - believableFloor)));
}

function cpuTrucoChance(cards: Card[], tricks: number[]): number {
  const strength = cards.reduce((total, card) => total + trucoStrength(card), 0) / Math.max(1, cards.length);
  const behind = tricks.filter((result) => result > 0).length > tricks.filter((result) => result < 0).length;
  return Math.min(0.82, 0.12 + strength / 24 + (behind ? 0.1 : 0));
}

function PlayingCard({ card, onPlay, disabled = false, compact = false }: { card: Card; onPlay?: () => void; disabled?: boolean; compact?: boolean }) {
  const content = (
    <>
      <span className="card-rank">{card.rank}</span>
      <img src={`/restored/carta-${card.suit}-fullcolor.png`} alt={`${card.rank} de ${suitLabel[card.suit]}`} />
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
  const [playerCardOrder, setPlayerCardOrder] = useState(initial.player.map((card) => card.id));
  const [cpuCards, setCpuCards] = useState(initial.cpu);
  const [table, setTable] = useState<TablePlay[]>([]);
  const [tricks, setTricks] = useState<number[]>([]);
  const [score, setScore] = useState({ player: 0, cpu: 0 });
  const [handPoints, setHandPoints] = useState({ player: 0, cpu: 0 });
  const handPointsRef = useRef({ player: 0, cpu: 0 });
  const [stake, setStake] = useState(1);
  const [trucoCaller, setTrucoCaller] = useState<Side | null>(null);
  const [envidoDone, setEnvidoDone] = useState(false);
  const [phase, setPhase] = useState<Phase>("playing");
  const [speech, setSpeech] = useState("Barajando electrones… elegí una carta.");
  const [lastWinner, setLastWinner] = useState<Side | null>(null);
  const [command, setCommand] = useState("");
  const [sound, setSound] = useState(true);
  const [voice, setVoice] = useState(false);
  const [florEnabled, setFlorEnabled] = useState(true);
  const [startAsMano, setStartAsMano] = useState(true);
  const [handNumber, setHandNumber] = useState(1);
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [pendingCall, setPendingCall] = useState<PendingCall | null>(null);
  const [pendingEnvidoDeclaration, setPendingEnvidoDeclaration] = useState<PendingEnvidoDeclaration | null>(null);
  const [playerClaimDraft, setPlayerClaimDraft] = useState("");
  const [tantoAudit, setTantoAudit] = useState<TantoAudit | null>(null);
  const tantoAuditRef = useRef<TantoAudit | null>(null);
  const [openingChecked, setOpeningChecked] = useState(false);
  const [mano, setMano] = useState<Side>("player");
  const [turn, setTurn] = useState<Side>("player");
  const [cpuDecisionMade, setCpuDecisionMade] = useState(false);
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
  const fullPlayerHand = useMemo(() => [...playerCards, ...table.flatMap((play) => play.player ? [play.player] : [])], [playerCards, table]);
  const fullCpuHand = useMemo(() => [...cpuCards, ...table.flatMap((play) => play.cpu ? [play.cpu] : [])], [cpuCards, table]);
  const canFlor = florEnabled && hasFlor(fullPlayerHand) && !envidoDone && tricks.length === 0;
  const canCallFlor = florEnabled && !envidoDone && tricks.length === 0;
  const trucoLabel = stake === 1 ? "Truco" : stake === 2 ? "Retruco" : stake === 3 ? "Vale 4" : "Cantado";

  useEffect(() => {
    if (!started || phase !== "playing" || openingChecked) return;
    const timer = window.setTimeout(() => setOpeningChecked(true), 500);
    return () => window.clearTimeout(timer);
  }, [started, phase, openingChecked]);

  useEffect(() => {
    if (!started || !openingChecked || phase !== "playing" || turn !== "cpu" || pendingCall || pendingEnvidoDeclaration || cpuCards.length === 0) return;
    const timer = window.setTimeout(() => cpuTakeTurn(), 620);
    return () => window.clearTimeout(timer);
  }, [started, openingChecked, phase, turn, pendingCall, pendingEnvidoDeclaration, cpuDecisionMade, cpuCards, playerCards, table, tricks, envidoDone, stake, trucoCaller, sound]);

  useEffect(() => {
    if (!started || !openingChecked || phase !== "playing" || turn !== "player" || pendingCall || pendingEnvidoDeclaration || tricks.length !== 2 || playerCards.length !== 1) return;
    const timer = window.setTimeout(() => playCard(playerCards[0]), 360);
    return () => window.clearTimeout(timer);
  }, [started, openingChecked, phase, turn, pendingCall, pendingEnvidoDeclaration, tricks.length, playerCards]);

  function say(text: string, voiceIndex?: number) {
    setSpeech(text);
    if (voiceIndex) void playVoice(voiceIndex, voice);
  }

  function sayOriginalRange(from: number, to: number, fallback: string) {
    const options = dialogues.filter((dialogue) => dialogue.record >= from && dialogue.record <= to);
    const chosen = options[Math.floor(Math.random() * options.length)];
    say(chosen?.text ?? fallback, chosen?.record ?? from);
  }

  function bankPoints(side: Side, points: number) {
    const next = { ...handPointsRef.current, [side]: handPointsRef.current[side] + points };
    handPointsRef.current = next;
    setHandPoints(next);
  }

  function deferTanto(audit: TantoAudit) {
    tantoAuditRef.current = audit;
    setTantoAudit(audit);
  }

  function finishHand(side: Side, points: number, message: string) {
    const audit = tantoAuditRef.current;
    const settledHandPoints = { ...handPointsRef.current };
    if (audit) settledHandPoints[audit.finalWinner] += audit.points;
    handPointsRef.current = settledHandPoints;
    setHandPoints(settledHandPoints);
    const gainedPlayer = settledHandPoints.player + (side === "player" ? points : 0);
    const gainedCpu = settledHandPoints.cpu + (side === "cpu" ? points : 0);
    setScore((current) => {
      const next = {
        player: current.player + gainedPlayer,
        cpu: current.cpu + gainedCpu,
      };
      return next;
    });
    setLastWinner(side);
    setPhase(score.player + gainedPlayer >= 30 || score.cpu + gainedCpu >= 30 ? "match-over" : "hand-over");
    say(audit ? `${message} ${audit.verdict}` : message, side === "cpu" ? 145 : undefined);
    void playMusic(side === "player" ? "handWin" : "handLose", sound);
  }

  function cpuCallsTruco(nextStake: 2 | 3 | 4) {
    setPendingCall({ kind: "truco", nextStake });
    const label = nextStake === 2 ? "¡Truco!" : nextStake === 3 ? "¡Retruco!" : "¡Vale cuatro!";
    const [from, to] = nextStake === 2 ? [85, 96] : nextStake === 3 ? [97, 108] : [109, 120];
    sayOriginalRange(from, to, `${label} La CPU cantó; ahora contestás vos.`);
    void playMusic(nextStake === 2 ? "truco" : nextStake === 3 ? "retruco" : "vale4", sound);
  }

  function giveTurn(side: Side) {
    setTurn(side);
    if (side === "cpu") setCpuDecisionMade(false);
  }

  function resolveCompletedTrick(playerCard: Card, cpuCard: Card, leader: Side, effectiveStake = stake) {
    const result = Math.sign(trucoStrength(playerCard) - trucoStrength(cpuCard));
    const nextTricks = [...tricks, result];
    setTricks(nextTricks);
    const handResult = decideHand(nextTricks, mano);
    if (handResult) {
      finishHand(handResult > 0 ? "player" : "cpu", effectiveStake, handResult > 0 ? "Ganaste la mano. No te engrupas…" : "¡Dormiste afuera! ¿Querés una frazada?");
      return;
    }
    const nextLeader: Side = result > 0 ? "player" : result < 0 ? "cpu" : leader;
    giveTurn(nextLeader);
    if (result > 0) say("Esta baza es tuya. Todavía no terminó.");
    else if (result < 0) say(CPU_TAUNTS[Math.floor(Math.random() * CPU_TAUNTS.length)]);
    else say("Parda. La ventaja sigue con quien salió.");
  }

  function cpuTakeTurn() {
    if (phase !== "playing" || turn !== "cpu" || pendingCall || pendingEnvidoDeclaration || cpuCards.length === 0) return;
    if (!cpuDecisionMade) {
      setCpuDecisionMade(true);
      const cpuEnvido = envidoPoints(fullCpuHand);
      const cpuHasFlor = hasFlor(fullCpuHand);
      const florLieChance = score.cpu < score.player ? 0.17 : 0.1;
      const cpuLiesAboutFlor = florEnabled && !cpuHasFlor && Math.random() < florLieChance;
      if (florEnabled && !envidoDone && tricks.length === 0 && (cpuHasFlor || cpuLiesAboutFlor)) {
        setEnvidoDone(true);
        void playMusic("flor", sound);
        if (hasFlor(fullPlayerHand)) {
          setPendingCall({ kind: "flor", mode: "flor" });
          say("¡Flor! Vos también tenés: con flor quiero, contraflor o te achicás.", 49);
        } else {
          deferFlor("cpu", 3, false);
          say("¡Flor! Los tres puntos quedan en suspenso hasta mostrar las cartas.", 49);
        }
        return;
      }
      if (!envidoDone && tricks.length === 0 && Math.random() < cpuBluffChance(cpuEnvido)) {
        const risk = Math.random();
        const openingCall: EnvidoCall = risk < 0.08 ? "falta-envido" : risk < 0.31 ? "real-envido" : "envido";
        setPendingCall({ kind: "envido", sequence: [openingCall] });
        const [from, to] = openingCall === "falta-envido" ? [37, 48] : openingCall === "real-envido" ? [13, 24] : [1, 12];
        sayOriginalRange(from, to, `¡${envidoLabel[openingCall]}! Puede ser carta… o puede ser picardía.`);
        void playMusic(openingCall === "real-envido" ? "real" : "envido", sound);
        return;
      }
      if (stake < 4 && trucoCaller !== "cpu" && Math.random() < cpuTrucoChance(cpuCards, tricks)) {
        cpuCallsTruco((stake + 1) as 2 | 3 | 4);
        return;
      }
    }

    const index = tricks.length;
    const current = table[index];
    const cpuCard = current?.player
      ? pickCpuCard(cpuCards, current.player, tricks)
      : [...cpuCards].sort((a, b) => trucoStrength(a) - trucoStrength(b))[Math.random() < 0.24 ? cpuCards.length - 1 : 0];
    setCpuCards((cards) => cards.filter((item) => item.id !== cpuCard.id));
    const play: TablePlay = current
      ? { ...current, cpu: cpuCard }
      : { leader: "cpu", cpu: cpuCard };
    setTable((plays) => {
      const next = [...plays];
      next[index] = play;
      return next;
    });
    if (play.player) resolveCompletedTrick(play.player, cpuCard, play.leader);
    else giveTurn("player");
  }

  function playCard(card: Card, effectiveStake = stake, resolvedPendingCall = false) {
    if (phase !== "playing" || turn !== "player" || pendingEnvidoDeclaration || (pendingCall && !resolvedPendingCall)) return;
    const index = tricks.length;
    const current = table[index];
    setPlayerCards((cards) => cards.filter((item) => item.id !== card.id));
    const play: TablePlay = current
      ? { ...current, player: card }
      : { leader: "player", player: card };
    setTable((plays) => {
      const next = [...plays];
      next[index] = play;
      return next;
    });
    if (play.cpu) resolveCompletedTrick(card, play.cpu, play.leader, effectiveStake);
    else giveTurn("cpu");
  }

  function restoreDeferredTruco(deferredTruco?: 2 | 3 | 4) {
    setPendingCall(deferredTruco ? { kind: "truco", nextStake: deferredTruco } : null);
    if (deferredTruco) say("El tanto terminó. Todavía tenés que contestar el Truco.");
  }

  function resolveAcceptedEnvido(sequence: EnvidoCall[], deferredTruco?: 2 | 3 | 4, playerTrucoAfter = false) {
    const yours = envidoPoints(fullPlayerHand);
    const theirs = envidoPoints(fullCpuHand);
    const claim = cpuEnvidoClaim(theirs);
    setPendingCall(null);
    setEnvidoDone(true);
    setPlayerClaimDraft("");
    setPendingEnvidoDeclaration({ sequence, cpuClaim: claim, cpuActual: theirs, deferredTruco, playerTrucoAfter });
    say(`${describeEnvido(sequence)} querido. La CPU canta ${claim}. Ahora vos cantás tus tantos.`, 13);
  }

  function declarePlayerEnvido(rawClaim: number) {
    const declaration = pendingEnvidoDeclaration;
    if (!declaration) return;
    if (!Number.isInteger(rawClaim) || rawClaim < 0 || rawClaim > 33) {
      say("Cantá un número entero entre 0 y 33, aparcero.");
      return;
    }
    const playerActual = envidoPoints(fullPlayerHand);
    const playerTruthful = rawClaim === playerActual;
    const cpuTruthful = declaration.cpuClaim === declaration.cpuActual;
    const declaredWinner = winnerByPoints(rawClaim, declaration.cpuClaim, mano);
    const actualWinner = winnerByPoints(playerActual, declaration.cpuActual, mano);
    const finalWinner = playerTruthful && !cpuTruthful
      ? "player"
      : cpuTruthful && !playerTruthful
        ? "cpu"
        : actualWinner;
    const points = acceptedEnvidoPoints(declaration.sequence, score.player, score.cpu);
    const lies = [
      !playerTruthful ? `vos cantaste ${rawClaim} y tenías ${playerActual}` : "",
      !cpuTruthful ? `la CPU cantó ${declaration.cpuClaim} y tenía ${declaration.cpuActual}` : "",
    ].filter(Boolean);
    const verdict = lies.length
      ? `Se mostraron las cartas: ${lies.join("; ")}. ¡Mentira descubierta! ${points} para ${finalWinner === "player" ? "vos" : "la CPU"}.`
      : `Se mostraron las cartas: ${playerActual} contra ${declaration.cpuActual}. El Envido estaba bien cantado: ${points} para ${finalWinner === "player" ? "vos" : "la CPU"}.`;
    deferTanto({ kind: "envido", points, declaredWinner, finalWinner, verdict });
    setPendingEnvidoDeclaration(null);
    setPlayerClaimDraft("");
    if (declaration.playerTrucoAfter) offerTrucoToCpu();
    else restoreDeferredTruco(declaration.deferredTruco);
    say(`${rawClaim} contra ${declaration.cpuClaim}. El tanto queda en revisión hasta el final de la mano.`);
    void playMusic(declaredWinner === "player" ? "win" : "lose", sound);
  }

  function cpuRespondsToEnvido(sequence: EnvidoCall[], deferredTruco?: 2 | 3 | 4) {
    const cpuHasFlor = florEnabled && hasFlor(fullCpuHand);
    if (cpuHasFlor) {
      setEnvidoDone(true);
      void playMusic("flor", sound);
      if (hasFlor(fullPlayerHand)) {
        setPendingCall({ kind: "flor", mode: "flor", deferredTruco });
        say("El Envido no corre: tengo Flor. ¿Con flor querés o te achicás?", 49);
      } else {
        deferFlor("cpu", 3, false);
        restoreDeferredTruco(deferredTruco);
        say("El Envido no corre porque tengo Flor. Tres quedan en revisión hasta mostrar.", 49);
      }
      return;
    }

    const cpuPoints = envidoPoints(fullCpuHand);
    const raises = allowedEnvidoRaises(sequence);
    const courage = cpuBluffChance(cpuPoints);
    if (Math.random() > courage) {
      const points = rejectedEnvidoPoints(sequence, score.player, score.cpu);
      setEnvidoDone(true);
      bankPoints("player", points);
      restoreDeferredTruco(deferredTruco);
      say(`No quiero ${describeEnvido(sequence)}. ${points} para vos.`);
      void playMusic("noQuiero", sound);
      return;
    }
    if (raises.length && Math.random() < Math.min(0.66, 0.12 + courage * 0.58)) {
      const raise = raises.includes("falta-envido") && Math.random() < (cpuPoints >= 29 ? 0.34 : 0.1)
        ? "falta-envido"
        : raises.includes("real-envido")
          ? "real-envido"
          : raises[0];
      const raisedSequence = [...sequence, raise];
      setPendingCall({ kind: "envido", sequence: raisedSequence, deferredTruco });
      const isSecondReal = raisedSequence.filter((call) => call === "real-envido").length === 2;
      const [from, to] = raise === "falta-envido" ? [37, 48] : isSecondReal ? [25, 36] : [13, 24];
      sayOriginalRange(from, to, `La CPU responde ${describeEnvido(raisedSequence)}. Ahora decidís vos.`);
      void playMusic(raise === "real-envido" ? "real" : "envidoReply", sound);
      return;
    }
    resolveAcceptedEnvido(sequence, deferredTruco);
  }

  function callEnvido(call: EnvidoCall = "envido", deferredTruco?: 2 | 3 | 4) {
    if ((turn !== "player" && deferredTruco === undefined) || envidoDone || tricks.length > 0 || phase !== "playing") return;
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

  function deferFlor(declaredWinner: Side, points: number, bothClaimed: boolean) {
    const playerActual = florPoints(fullPlayerHand);
    const cpuActual = florPoints(fullCpuHand);
    const playerHasIt = playerActual > 0;
    const cpuHasIt = cpuActual > 0;
    const finalWinner = bothClaimed
      ? playerHasIt || cpuHasIt
        ? winnerByPoints(playerActual, cpuActual, mano)
        : mano
      : declaredWinner === "player"
        ? playerHasIt ? "player" : "cpu"
        : cpuHasIt ? "cpu" : "player";
    const liar = bothClaimed
      ? [!playerHasIt ? "vos cantaste Flor sin tenerla" : "", !cpuHasIt ? "la CPU cantó Flor sin tenerla" : ""].filter(Boolean).join("; ")
      : declaredWinner === "player" && !playerHasIt
        ? "cantaste Flor sin tenerla"
        : declaredWinner === "cpu" && !cpuHasIt
          ? "la CPU cantó Flor sin tenerla"
          : "";
    const verdict = liar
      ? `Se mostraron las cartas: ${liar}. ¡Flor de plástico! ${points} para ${finalWinner === "player" ? "vos" : "la CPU"}.`
      : `Se mostraron las cartas: la Flor era buena. ${points} para ${finalWinner === "player" ? "vos" : "la CPU"}.`;
    deferTanto({ kind: "flor", points, declaredWinner, finalWinner, verdict });
  }

  function resolveFlor(mode: "flor" | "contraflor" | "resto", deferredTruco?: 2 | 3 | 4) {
    const yours = florPoints(fullPlayerHand);
    const theirs = florPoints(fullCpuHand);
    const declaredWinner = winnerByPoints(yours, theirs, mano);
    const points = mode === "flor" ? 4 : mode === "contraflor" ? 6 : acceptedEnvidoPoints(["falta-envido"], score.player, score.cpu);
    restoreDeferredTruco(deferredTruco);
    setEnvidoDone(true);
    deferFlor(declaredWinner, points, true);
    say("Se cruzaron las flores. Los puntos quedan en revisión hasta mostrar.", declaredWinner === "player" ? 61 : 121);
    void playMusic(declaredWinner === "player" ? "florReply" : "lose", sound);
  }

  function raisePendingFlor(mode: "contraflor" | "resto") {
    if (!pendingCall || pendingCall.kind !== "flor") return;
    const cpuFlor = florPoints(fullCpuHand);
    const deferredTruco = pendingCall.deferredTruco;
    setPendingCall(null);
    void playMusic("florReply", sound);
    if (Math.random() > Math.min(0.82, 0.18 + cpuFlor / 48)) {
      deferFlor("player", 4, false);
      restoreDeferredTruco(deferredTruco);
      say("Con Flor me achico. Cuatro quedan en revisión hasta mostrar.", 73);
      return;
    }
    if (mode === "contraflor" && Math.random() < Math.min(0.62, 0.08 + cpuFlor / 70)) {
      setPendingCall({ kind: "flor", mode: "resto", deferredTruco });
      say("¡Contraflor al resto! Te toca responder.", 121);
      return;
    }
    resolveFlor(mode, deferredTruco);
  }

  function callFlor(deferredTruco?: 2 | 3 | 4, fromPendingCall = false) {
    if (turn !== "player" || !canCallFlor || phase !== "playing" || (!fromPendingCall && pendingCall) || pendingEnvidoDeclaration) return;
    setPendingCall(null);
    setEnvidoDone(true);
    void playMusic("flor", sound);
    if (!hasFlor(fullCpuHand)) {
      deferFlor("player", 3, false);
      restoreDeferredTruco(deferredTruco);
      say("Flor. Tres puntos quedan en suspenso hasta mostrar.", 49);
      return;
    }
    const cpuFlor = florPoints(fullCpuHand);
    if (cpuFlor < 27 && Math.random() > 0.35) {
      deferFlor("player", 3, false);
      restoreDeferredTruco(deferredTruco);
      say("Con Flor me achico. Tres quedan en revisión hasta mostrar.", 73);
    } else if (cpuFlor >= 32 && Math.random() < 0.5) {
      setPendingCall({ kind: "flor", mode: "resto", deferredTruco });
      say("¡Contraflor al resto! Te toca responder.", 121);
    } else {
      resolveFlor("flor", deferredTruco);
    }
  }

  function interruptPendingWithFlor() {
    if (!pendingCall || pendingCall.kind === "flor" || envidoDone || tricks.length > 0) return;
    const deferredTruco = pendingCall.kind === "truco" ? pendingCall.nextStake : pendingCall.deferredTruco;
    callFlor(deferredTruco, true);
  }

  function offerTrucoToCpu(): number | null {
    if (stake >= 4 || trucoCaller === "player") return null;
    void playMusic(stake === 1 ? "truco" : stake === 2 ? "retruco" : "vale4", sound);
    const courage = cpuTrucoChance(cpuCards, tricks);
    if (Math.random() > courage) {
      finishHand("player", stake, "No quiero. Soldado que huye sirve pa' otra guerra.");
      return null;
    }
    const next = stake + 1 as 2 | 3 | 4;
    setStake(next);
    setTrucoCaller("player");
    if (next < 4 && Math.random() < Math.min(0.38, 0.08 + courage * 0.34)) {
      const counter = (next + 1) as 3 | 4;
      setTrucoCaller("cpu");
      cpuCallsTruco(counter);
      return null;
    }
    say("Quiero, che. Seguimos jugando.", 86);
    return next;
  }

  function callTruco(): number | null {
    if (turn !== "player" || stake >= 4 || trucoCaller === "player" || phase !== "playing" || pendingCall) return null;
    return offerTrucoToCpu();
  }

  function fold() {
    if (turn !== "player" || phase !== "playing" || pendingCall) return;
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
      bankPoints("cpu", points);
      restoreDeferredTruco(rejected.deferredTruco);
      say(`No quiero ${describeEnvido(rejected.sequence)}. ${points} para la CPU.`);
      void playMusic("noQuiero", sound);
    } else if (rejected.kind === "flor") {
      const points = rejected.mode === "flor" ? 3 : 4;
      deferFlor("cpu", points, false);
      restoreDeferredTruco(rejected.deferredTruco);
      say(`Con Flor me achico. ${points} quedan en revisión hasta mostrar.`, 73);
    } else {
      finishHand("cpu", stake, "No quiero. La apuesta anterior es para la CPU.");
    }
  }

  function answerEnvidoAndTruco(accept: boolean) {
    if (!pendingCall || pendingCall.kind !== "envido") return;
    const envido = pendingCall;
    if (accept) {
      resolveAcceptedEnvido(envido.sequence, undefined, true);
      return;
    }
    else {
      const points = rejectedEnvidoPoints(envido.sequence, score.player, score.cpu);
      setPendingCall(null);
      setEnvidoDone(true);
      bankPoints("cpu", points);
    }
    offerTrucoToCpu();
  }

  function interruptTrucoWithEnvido(call: EnvidoCall) {
    if (!pendingCall || pendingCall.kind !== "truco" || envidoDone || tricks.length > 0) return;
    callEnvido(call, pendingCall.nextStake);
  }

  function raisePendingTruco(): number | null {
    if (!pendingCall || pendingCall.kind !== "truco" || pendingCall.nextStake >= 4) return null;
    const raisedStake = (pendingCall.nextStake + 1) as 3 | 4;
    setPendingCall(null);
    const courage = cpuTrucoChance(cpuCards, tricks);
    void playMusic(raisedStake === 3 ? "retruco" : "vale4", sound);
    if (Math.random() > courage) {
      finishHand("player", pendingCall.nextStake, `No quiero tu ${raisedStake === 3 ? "retruco" : "vale cuatro"}.`);
      return null;
    }
    setStake(raisedStake);
    setTrucoCaller("player");
    say(`Quiero tu ${raisedStake === 3 ? "retruco" : "vale cuatro"}.`, raisedStake === 3 ? 98 : 109);
    return raisedStake;
  }

  function nextHand() {
    if (matchWinner) {
      const next = freshHand();
      const firstMano: Side = startAsMano ? "player" : "cpu";
      setScore({ player: 0, cpu: 0 });
      handPointsRef.current = { player: 0, cpu: 0 };
      setHandPoints({ player: 0, cpu: 0 });
      setPlayerCards(next.player);
      setPlayerCardOrder(next.player.map((card) => card.id));
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
      setPendingEnvidoDeclaration(null);
      setPlayerClaimDraft("");
      tantoAuditRef.current = null;
      setTantoAudit(null);
      setOpeningChecked(false);
      setMano(firstMano);
      setTurn(firstMano);
      setCpuDecisionMade(false);
      say("Revancha. Ahora ya sé cómo jugás.");
      return;
    }
    const next = freshHand();
    const nextMano: Side = mano === "player" ? "cpu" : "player";
    setPlayerCards(next.player);
    setPlayerCardOrder(next.player.map((card) => card.id));
    setCpuCards(next.cpu);
    setTable([]);
    setTricks([]);
    setStake(1);
    setTrucoCaller(null);
    setEnvidoDone(false);
    setLastWinner(null);
    setPhase("playing");
    setPendingCall(null);
    setPendingEnvidoDeclaration(null);
    setPlayerClaimDraft("");
    tantoAuditRef.current = null;
    setTantoAudit(null);
    setOpeningChecked(false);
    handPointsRef.current = { player: 0, cpu: 0 };
    setHandPoints({ player: 0, cpu: 0 });
    setMano(nextMano);
    setTurn(nextMano);
    setCpuDecisionMade(false);
    setHandNumber((value) => value + 1);
    say(CPU_TAUNTS[Math.floor(Math.random() * CPU_TAUNTS.length)]);
    void playMusic("deal", sound);
  }

  function playCommandCard(index: 0 | 1 | 2, effectiveStake = stake, resolvedPendingCall = false): boolean {
    const card = playerCards.find((item) => item.id === playerCardOrder[index]);
    if (!card) {
      say(`La carta ${index + 1} ya no está en tu mano.`);
      return true;
    }
    playCard(card, effectiveStake, resolvedPendingCall);
    return true;
  }

  function handleGameCommand(command: OriginalCommand): boolean {
    if (phase !== "playing") return false;
    const { code, cardIndex, normalized: text } = command;

    if (pendingCall?.kind === "envido") {
      const raises = allowedEnvidoRaises(pendingCall.sequence);
      if (florEnabled && code === 5) { interruptPendingWithFlor(); return true; }
      if (code === 4 && raises.includes("falta-envido")) { raisePendingEnvido("falta-envido"); return true; }
      if ((code === 2 || code === 3) && raises.includes("real-envido")) { raisePendingEnvido("real-envido"); return true; }
      if (code === 1 && raises.includes("envido")) { raisePendingEnvido("envido"); return true; }
      if (text.includes("no quiero") && text.includes("truco")) { answerEnvidoAndTruco(false); return true; }
      if (text.includes("quiero") && text.includes("truco")) { answerEnvidoAndTruco(true); return true; }
      if (code === 24 || code === 0) { acceptPendingCall(); return true; }
      if (code === 25) { rejectPendingCall(); return true; }
      if (code >= 1 && code <= 4) { say("Mal cantado, che. Podés querer, no querer o subir sin bajar la apuesta."); return true; }
      if (code > 0) { say("Primero contestá el Envido: quiero, no quiero o subí la apuesta."); return true; }
      return false;
    }

    if (pendingCall?.kind === "truco") {
      if (florEnabled && !envidoDone && tricks.length === 0 && code === 5) { interruptPendingWithFlor(); return true; }
      if (!envidoDone && tricks.length === 0 && code === 4) { interruptTrucoWithEnvido("falta-envido"); return true; }
      if (!envidoDone && tricks.length === 0 && (code === 2 || code === 3)) { interruptTrucoWithEnvido("real-envido"); return true; }
      if (!envidoDone && tricks.length === 0 && code === 1) { interruptTrucoWithEnvido("envido"); return true; }

      const retrucoCodes = [16, 17, 18, 19];
      const valeFourCodes = [20, 21, 22, 23];
      const requestsCorrectRaise = pendingCall.nextStake === 2
        ? retrucoCodes.includes(code)
        : pendingCall.nextStake === 3 && valeFourCodes.includes(code);
      if (requestsCorrectRaise) {
        const acceptedStake = raisePendingTruco();
        if (acceptedStake && cardIndex !== undefined) playCommandCard(cardIndex, acceptedStake, true);
        return true;
      }
      if (code === 24 || code === 0) { acceptPendingCall(); return true; }
      if (code === 25 || code === 26) { rejectPendingCall(); return true; }
      if (code > 0) { say(`Tenés que contestar ${pendingCallLabel(pendingCall)}: quiero, no quiero o una subida válida.`); return true; }
      return false;
    }

    if (pendingCall?.kind === "flor") {
      if (code === 8 || code === 25) { rejectPendingCall(); return true; }
      if (text.includes("contraflor al resto")) { raisePendingFlor("resto"); return true; }
      if (code === 7) { raisePendingFlor("contraflor"); return true; }
      if (code === 6 || code === 24 || code === 0) { acceptPendingCall(); return true; }
      if (code > 0) { say("Con Flor: quiero, me achico, contraflor o contraflor al resto."); return true; }
      return false;
    }

    if (code === 4) { callEnvido("falta-envido"); return true; }
    if (code === 2) { callEnvido("real-envido"); return true; }
    if (code === 3) { say("Dos Reales Envido necesita un Real Envido anterior."); return true; }
    if (code === 1) { callEnvido("envido"); return true; }
    if (code === 5) {
      if (!florEnabled) say("Esta partida se juega sin Flor, che.");
      else callFlor();
      return true;
    }
    if (code >= 9 && code <= 11 && cardIndex !== undefined) return playCommandCard(cardIndex);
    if (code >= 12 && code <= 14 && cardIndex !== undefined) {
      const acceptedStake = callTruco();
      if (acceptedStake) playCommandCard(cardIndex, acceptedStake);
      return true;
    }
    if (code === 15) { callTruco(); return true; }
    if (code === 26) { fold(); return true; }
    if (code > 0) { say("Ese canto no corresponde en este momento de la mano."); return true; }
    return false;
  }

  function submitCommand(event: FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    if (pendingEnvidoDeclaration) {
      if (/^\d{1,2}$/.test(value)) declarePlayerEnvido(Number(value));
      else say("La CPU espera tus tantos: escribí un número entre 0 y 33.");
      setCommand("");
      return;
    }
    const parsed = parseOriginalCommand(value);
    const language = classifyOriginalLanguage(parsed.normalized);

    // Positive command codes return from the original parser before its
    // language jokes. Code 0 (generic acceptance) continues through fallback.
    if (parsed.code > 0 && handleGameCommand(parsed)) {
      // The recovered command changed the bid/card state.
    } else if (parsed.code <= 0 && ORIGINAL_EXIT_TOKENS.some((token) => parsed.normalized.includes(token))) {
      stopMusic();
      setStarted(false);
    } else if (language === "short-yes") say("¿Qué me querés decir con 'S', salame?");
    else if (language === "yes") say("¿Qué significa 'si'? Cerrá bien, por favor.");
    else if (language === "short-no") say("¿Qué quiere decir 'n'? Cerrá bien, por favor.");
    else if (language === "no") say("¿No qué? Cerrá bien, por favor.");
    else if (language === "abandon") say(expandOriginalPhrase(ORIGINAL_ABANDON_REPLY));
    else if (language === "insult") say(randomOriginalReply(ORIGINAL_DIRTY_REPLIES));
    else if (language === "truque") say(randomOriginalReply(ORIGINAL_TRUQUE_REPLIES));
    else if (language === "diminutive") say(expandOriginalPhrase(ORIGINAL_DIMINUTIVE_REPLY));
    else if (language === "sexual") say(expandOriginalPhrase(ORIGINAL_SEXUAL_REPLY));
    else if (language === "credits") say(expandOriginalPhrase(ORIGINAL_CREDITS_REPLY));
    else if (handleGameCommand(parsed)) {
      // Code 0 is context-sensitive and is consumed here when appropriate.
    } else say("¿Quién te entiende, mi duende?");
    setCommand("");
  }

  function startGame() {
    stopMusic();
    const next = freshHand();
    const firstMano: Side = startAsMano ? "player" : "cpu";
    setPlayerCards(next.player);
    setPlayerCardOrder(next.player.map((card) => card.id));
    setCpuCards(next.cpu);
    setTable([]);
    setTricks([]);
    setScore({ player: 0, cpu: 0 });
    handPointsRef.current = { player: 0, cpu: 0 };
    setHandPoints({ player: 0, cpu: 0 });
    setStake(1);
    setTrucoCaller(null);
    setEnvidoDone(false);
    setPhase("playing");
    setSpeech(firstMano === "player" ? "Sos mano. Elegí una carta o cantá." : "La CPU es mano. Mirá bien cómo arranca.");
    setLastWinner(null);
    setHandNumber(1);
    setPendingCall(null);
    setPendingEnvidoDeclaration(null);
    setPlayerClaimDraft("");
    tantoAuditRef.current = null;
    setTantoAudit(null);
    setOpeningChecked(false);
    setMano(firstMano);
    setTurn(firstMano);
    setCpuDecisionMade(false);
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
          <img src="/restored/pantalla-fullcolor.png" alt="Restauración a todo color de la pantalla de Truco Arbiser" />
          <div className="intro-copy">
            <h1>El truco volvió a la mesa.</h1>
            <p>Cartas, versos, música y voces extraídos del programa original. Baraja española y una CPU que todavía tiene memoria.</p>
          </div>
          <div className="intro-options" aria-label="Opciones de la partida">
            <button className="intro-option" type="button" aria-pressed={florEnabled} onClick={() => setFlorEnabled((value) => !value)}>
              <span><strong>Jugar con Flor</strong><em>{florEnabled ? "Flor, contraflor y al resto" : "Sólo envido"}</em></span>
              <i aria-hidden="true"><b /></i>
            </button>
            <button className="intro-option" type="button" aria-pressed={startAsMano} onClick={() => setStartAsMano((value) => !value)}>
              <span><strong>Quiero ser mano</strong><em>{startAsMano ? "Vos tirás primero" : "La CPU tira primero"}</em></span>
              <i aria-hidden="true"><b /></i>
            </button>
          </div>
          {introBlocked ? <button className="sound-unlock" onClick={() => void activateSplashAudio()}>▶ ACTIVAR SONIDO DEL SPLASH</button> : null}
          <button className="primary-button" onClick={startGame}>JUGAR PARTIDA <span>↗</span></button>
          <small className="intro-credit">Juego original por Ariel y Enrique Arbiser · Port web por Carlos A. Leguizamón</small>
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
              <div className="player-label"><span className="status-dot" /> CPU_ARBITER <em>{cpuCards.length} cartas · {phase !== "playing" && tantoAudit ? "MOSTRÓ" : mano === "cpu" ? "MANO" : turn === "cpu" ? "TURNO" : "ESPERA"}</em></div>
              <div className="cpu-hand">{cpuCards.map((card) => phase !== "playing" && tantoAudit ? <PlayingCard key={card.id} card={card} compact /> : <CardBack key={card.id} />)}</div>
            </section>

            <div className="speech glass" aria-live="polite"><span>CPU</span><p>{speech}</p></div>

            <section className="play-zone" aria-label="Cartas jugadas en la mesa">
              <div className="hand-stamp"><span>MANO {String(handNumber).padStart(2, "0")}</span><strong>×{stake}</strong></div>
              <div className="played-pairs">
                {[0, 1, 2].map((index) => {
                  const play = table[index];
                  return (
                    <div className={`trick-pair ${play?.player || play?.cpu ? "occupied" : ""}`} key={index}>
                      <div className="played-slot cpu-slot">{play?.cpu ? <PlayingCard card={play.cpu} compact /> : <span>CPU</span>}</div>
                      <span className="trick-number">BAZA {index + 1}</span>
                      <div className="played-slot player-slot">{play?.player ? <PlayingCard card={play.player} compact /> : <span>VOS</span>}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="player-zone">
              <div className="player-label"><span className="status-dot human" /> VOS <em>{envidoPoints(fullPlayerHand)} de envido · {mano === "player" ? "MANO" : turn === "player" ? "TURNO" : "ESPERÁ"}</em></div>
              <div className="player-hand">
                {playerCards.map((card) => <PlayingCard key={card.id} card={card} onPlay={() => playCard(card)} disabled={phase !== "playing" || turn !== "player" || pendingCall !== null || pendingEnvidoDeclaration !== null || !openingChecked} />)}
              </div>
            </section>
          </div>

          <aside className="side-panel">
            <section className="scoreboard glass">
              <div className="panel-heading"><span>TRUCÓMETRO</span><em>A 30</em></div>
              <Score label="CPU" value={score.cpu} active={lastWinner === "cpu"} />
              <Score label="VOS" value={score.player} active={lastWinner === "player"} />
              {phase === "playing" && (handPoints.player || handPoints.cpu) ? <small className="pending-points">AL CIERRE · CPU +{handPoints.cpu} / VOS +{handPoints.player}</small> : null}
              {phase === "playing" && tantoAudit ? <small className="pending-points audit-pending">EN REVISIÓN · {tantoAudit.points} DE {tantoAudit.kind.toUpperCase()}</small> : null}
              <div className="score-track"><i style={{ width: `${Math.min(100, (score.player / 30) * 100)}%` }} /></div>
            </section>

            <section className="actions glass">
              <div className={`panel-heading ${pendingCall || pendingEnvidoDeclaration ? "cpu-call-heading" : ""}`}><span>{pendingEnvidoDeclaration ? "VOS CANTÁS" : pendingCall ? "LA CPU CANTÓ" : "TU JUGADA"}</span><em>ESTACA ×{stake}</em></div>
              {phase === "playing" && pendingEnvidoDeclaration ? <>
                <div className="call-notice">
                  <small>LA CPU DECLARÓ</small>
                  <strong>{pendingEnvidoDeclaration.cpuClaim} DE ENVIDO</strong>
                </div>
                <button className="action-primary" onClick={() => declarePlayerEnvido(envidoPoints(fullPlayerHand))}>Cantar {envidoPoints(fullPlayerHand)}<small>Decir la verdad</small></button>
                <div className="claim-entry">
                  <input type="number" min="0" max="33" inputMode="numeric" value={playerClaimDraft} onChange={(event) => setPlayerClaimDraft(event.target.value)} placeholder="0–33" aria-label="Tantos que querés declarar" />
                  <button onClick={() => declarePlayerEnvido(Number(playerClaimDraft))} disabled={playerClaimDraft === ""}>Declarar<small>Jugar con picardía</small></button>
                </div>
                <p className="bluff-hint">Podés cantar otros tantos. Las cartas se muestran al cerrar la mano.</p>
              </> : phase === "playing" && pendingCall ? <>
                <div className="call-notice">
                  <small>TE TOCA RESPONDER</small>
                  <strong>{pendingCallLabel(pendingCall)}</strong>
                </div>
                <button className="action-primary" onClick={acceptPendingCall}>{pendingCall.kind === "flor" ? "Con flor quiero" : "Quiero"}<small>Aceptar la propuesta</small></button>
                <div className="bid-options">
                  <button onClick={rejectPendingCall}>{pendingCall.kind === "flor" ? "Con flor me achico" : "No quiero"}<small>Rechazar</small></button>
                  {pendingCall.kind === "envido" ? <>
                    {allowedEnvidoRaises(pendingCall.sequence).map((call) => <button key={call} onClick={() => raisePendingEnvido(call)}>{call === "envido" && pendingCall.sequence.includes("envido") ? "Envido envido" : call === "real-envido" && pendingCall.sequence.includes("real-envido") ? "Dos Reales Envido" : envidoLabel[call]}<small>Subir el tanto</small></button>)}
                    {florEnabled ? <button onClick={interruptPendingWithFlor}>Flor<small>Anula el Envido</small></button> : null}
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
                      {florEnabled ? <button onClick={interruptPendingWithFlor}>Flor<small>Se resuelve primero</small></button> : null}
                    </> : null}
                  </> : null}
                  {pendingCall.kind === "flor" ? <>
                    {pendingCall.mode === "flor" ? <button onClick={() => raisePendingFlor("contraflor")}>Contraflor<small>Subir a seis</small></button> : null}
                    {pendingCall.mode !== "resto" ? <button onClick={() => raisePendingFlor("resto")}>Contraflor al resto<small>Jugar el partido</small></button> : null}
                  </> : null}
                </div>
              </> : phase === "playing" ? <>
                <button className="action-primary" onClick={callTruco} disabled={!openingChecked || turn !== "player" || stake >= 4 || trucoCaller === "player"}>{trucoLabel}<small>{!openingChecked ? "La CPU revisa sus cartas" : turn !== "player" ? "Está jugando la CPU" : trucoCaller === "player" ? "Esperá que suba la CPU" : "Subir la apuesta"}</small></button>
                <div className="bid-options normal-bids">
                  <button onClick={() => callEnvido("envido")} disabled={!openingChecked || turn !== "player" || envidoDone || tricks.length > 0 || canFlor}>Envido<small>Dos puntos</small></button>
                  <button onClick={() => callEnvido("real-envido")} disabled={!openingChecked || turn !== "player" || envidoDone || tricks.length > 0 || canFlor}>Real Envido<small>Tres puntos</small></button>
                  <button onClick={() => callEnvido("falta-envido")} disabled={!openingChecked || turn !== "player" || envidoDone || tricks.length > 0 || canFlor}>Falta Envido<small>Hasta las buenas</small></button>
                  <button onClick={() => callFlor()} disabled={!openingChecked || turn !== "player" || !canCallFlor}>Flor<small>{!florEnabled ? "Desactivada" : canFlor ? "La tenés" : "Podés mentir"}</small></button>
                </div>
                <button className="fold-button" onClick={fold} disabled={turn !== "player"}>Irse al mazo</button>
              </> : <button className="action-primary next" onClick={nextHand}>{matchWinner ? "REVANCHA" : "SIGUIENTE MANO"}<small>{matchWinner ? `${matchWinner} ganó la partida` : "Volver a repartir"}</small></button>}
            </section>

            <section className="trick-log glass">
              <div className="panel-heading"><span>BAZAS</span><em>{tricks.length}/3</em></div>
              <div>{[0, 1, 2].map((index) => <i key={index} className={tricks[index] > 0 ? "won" : tricks[index] < 0 ? "lost" : tricks[index] === 0 ? "tied" : ""}>{tricks[index] > 0 ? "V" : tricks[index] < 0 ? "C" : tricks[index] === 0 ? "P" : "·"}</i>)}</div>
            </section>
          </aside>

          <form className="command-line glass" onSubmit={submitCommand}>
            <span>&gt;_</span>
            <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={pendingEnvidoDeclaration ? "Cantá tus tantos (0–33)…" : "Decile algo a la CPU… pero cuidá el léxico"} aria-label="Hablarle a la CPU" />
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
            <article className="glass recovery-card"><span className="big-number">04</span><h3>Buffers de cartas</h3><p>Los originales de 46 × 60 píxeles y 2 bits por píxel guiaron estas restauraciones VGA a todo color. Los buffers CGA permanecen intactos en el archivo.</p><div className="sprite-row">{["oro", "copa", "espada", "basto"].map((suit) => <img key={suit} src={`/restored/carta-${suit}-fullcolor.png`} alt={`${suit} restaurado a todo color`} />)}</div></article>
            <article className="glass recovery-card"><span className="big-number">156</span><h3>Voces originales</h3><p>Los `.VOZ` son un flujo de un bit. El navegador los desempaqueta y reproduce con WebAudio.</p><button onClick={() => void playVoice(86, voice)}>▶ Probar “Truco”</button></article>
            <article className="glass recovery-card code-card"><span className="big-number">10</span><h3>Raíces de insultos</h3><p>Recuperadas del ejecutable:</p><code>{ORIGINAL_INSULT_STEMS.join(" · ")}</code></article>
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
