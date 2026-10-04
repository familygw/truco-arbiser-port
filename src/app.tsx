import { OriginalRandom, clockSeededRandom } from "./original-random";
import { OriginalTruco } from "./original-truco";
import { originalCpuFlorOpening, originalCpuFlorResponse, originalFlorReply, originalFlorAudit, originalFlorDeclaration, type FlorResult } from "./original-flor";
import { originalCpuEnvidoOpening, originalCpuEnvidoCounterResponse, originalEnvidoDeclaration, originalEnvidoAudit, originalEnvidoCode, originalEnvidoForcedAcceptance, originalEnvidoRaisedWager, originalEnvidoClosure } from "./original-envido-lifecycle";
import { originalCpuEnvidoResponse } from "./original-envido";
import { FormEvent, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { playMusic, playVoice, stopMusic } from "./audio";
import { acceptedEnvidoPoints, allowedEnvidoRaises, describeEnvido, envidoLabel, rejectedEnvidoPoints, type EnvidoCall } from "./bids";
import { Card, envidoPoints, florPoints, hasFlor, dealHand, splitScore, suitLabel, trucoStrength } from "./game";
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
  | { kind: "envido"; sequence: EnvidoCall[]; deferredTruco?: 2 | 3 | 4; playerTrucoAfter?: boolean }
  | { kind: "truco"; nextStake: 2 | 3 | 4 }
  | { kind: "flor"; mode: "flor" | "resto"; opening?: 3 | 4 | 30; deferredTruco?: 2 | 3 | 4 };
type PendingEnvidoDeclaration = {
  flor?: { points: number; mode: 0 | 40 | 50 | 60 };
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
  finalPoints?: number;
  verdict: string;
  playerClaim?: number;
  cpuClaim?: number;
  florMode?: 0 | 40 | 50 | 60;
};

const DosReplayPanel=lazy(()=>import("./dos-replay-panel"));

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const CPU_TAUNTS = [
  "¿Sos humano o androide? ¿Cuántos Kbytes tiene tu marote?",
  "No te la vas a llevar de arriba.",
  "Yo juego mejor que cualquiera. ¿Entendiste?",
  "No se te está enfriando el mate?",
  "Te estoy calando y yo no pierdo mi memoria…",
];


function pendingCallLabel(call: PendingCall): string {
  if (call.kind === "envido") return describeEnvido(call.sequence);
  if (call.kind === "flor") return call.mode === "flor" ? "FLOR" : "CONTRAFLOR AL RESTO";
  return call.nextStake === 2 ? "TRUCO" : call.nextStake === 3 ? "RETRUCO" : "VALE 4";
}

function otherSide(side: Side): Side {
  return side === "player" ? "cpu" : "player";
}

function PlayingCard({ card, onPlay, disabled = false, compact = false }: { card: Card; onPlay?: () => void; disabled?: boolean; compact?: boolean }) {
  const content = (
    <>
      <span className="card-rank">{card.rank}</span>
      <img src={assetUrl(`restored/carta-${card.suit}-fullcolor.png`)} alt={`${card.rank} de ${suitLabel[card.suit]}`} />
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
  const [{ random, initial }] = useState(() => {
    const random = clockSeededRandom();
    return { random, initial: dealHand(new OriginalRandom(random.state).next) };
  });
  const [showDosReplay,setShowDosReplay]=useState(false);
  const [started, setStarted] = useState(false);
  const [view, setView] = useState<"game" | "archive">("game");
  const [playerCards, setPlayerCards] = useState(initial.player);
  const [playerCardOrder, setPlayerCardOrder] = useState(initial.player.map((card) => card.id));
  const [cpuCards, setCpuCards] = useState(initial.cpu);
  const [table, setTable] = useState<TablePlay[]>([]);
  const [tricks, setTricks] = useState<number[]>([]);
  const [score, setScore] = useState({ player: 0, cpu: 0 });
  const [handPoints, setHandPoints] = useState({ player: 0, cpu: 0 });
  const faltaCountRef = useRef(0);
  const envidoOpeningSeenRef = useRef(false);
  const envidoOpeningActionRef = useRef(false);
  const envidoOriginRef = useRef<Side>("player");
  const envidoStrategyRef = useRef<number | null>(null);
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
    fetch(assetUrl("original/dialogos.json")).then((response) => response.json()).then(setDialogues).catch(() => setDialogues([]));
  }, []);

  useEffect(() => {
    if (started || showDosReplay) {
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
  }, [started, showDosReplay]);

  const matchWinner = score.player >= 30 ? "Vos" : score.cpu >= 30 ? "La CPU" : null;
  const deferredPlayerTrucoCodeRef = useRef<number | null>(null);
  const originalTrucoRef = useRef<{ key: string; engine: OriginalTruco; cpu: Card[]; player: Card[]; base: { player: number; cpu: number }; tantoKey: string } | null>(null);
  const fullPlayerHand = useMemo(() => [...playerCards, ...table.flatMap((play) => play.player ? [play.player] : [])], [playerCards, table]);
  const fullCpuHand = useMemo(() => [...cpuCards, ...table.flatMap((play) => play.cpu ? [play.cpu] : [])], [cpuCards, table]);
  const canFlor = florEnabled && hasFlor(fullPlayerHand) && !envidoDone && tricks.length === 0;
  const canCallFlor = florEnabled && !envidoDone && tricks.length === 0;
  const trucoLabel = stake === 1 ? "Truco" : stake === 2 ? "Retruco" : stake === 3 ? "Vale 4" : "Cantado";

  useEffect(() => {
    if (!started || showDosReplay || phase !== "playing" || openingChecked) return;
    const timer = window.setTimeout(() => setOpeningChecked(true), 500);
    return () => window.clearTimeout(timer);
  }, [started, showDosReplay, phase, openingChecked]);

  useEffect(() => {
    if (!started || showDosReplay || !openingChecked || phase !== "playing" || turn !== "cpu" || pendingCall || pendingEnvidoDeclaration || cpuCards.length === 0) return;
    const timer = window.setTimeout(() => cpuTakeTurn(), 620);
    return () => window.clearTimeout(timer);
  }, [started, showDosReplay, openingChecked, phase, turn, pendingCall, pendingEnvidoDeclaration, cpuDecisionMade, cpuCards, playerCards, table, tricks, envidoDone, stake, trucoCaller, sound]);

  useEffect(() => {
    if (!started || showDosReplay || !openingChecked || phase !== "playing" || turn !== "player" || pendingCall || pendingEnvidoDeclaration || tricks.length !== 2 || playerCards.length !== 1) return;
    const timer = window.setTimeout(() => playCard(playerCards[0]), 360);
    return () => window.clearTimeout(timer);
  }, [started, showDosReplay, openingChecked, phase, turn, pendingCall, pendingEnvidoDeclaration, tricks.length, playerCards]);

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
    if (audit) settledHandPoints[audit.finalWinner] += audit.finalPoints ?? audit.points;
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
    const nextLeader: Side = result > 0 ? "player" : result < 0 ? "cpu" : leader;
    giveTurn(nextLeader);
    if (result > 0) say("Esta baza es tuya. Todavía no terminó.");
    else if (result < 0) say(CPU_TAUNTS[Math.floor(Math.random() * CPU_TAUNTS.length)]);
    else say("Parda. La ventaja sigue con quien salió.");
  }

  function originalTrucoState() {
    const key = `${handNumber}:${mano}:${playerCardOrder.join(",")}`;
    const audit = tantoAuditRef.current;
    const base = { ...handPointsRef.current };
    if (audit) base[audit.declaredWinner] += audit.points;
    const tantoKey = JSON.stringify([base, audit?.playerClaim, audit?.cpuClaim, audit?.florMode]);
    if (originalTrucoRef.current?.key === key) {
      const state = originalTrucoRef.current;
      if (state.tantoKey !== tantoKey) {
        const m = state.engine.machine;
        m.write(0x1d9c, m.read(0x1d9c) + base.player - state.base.player);
        m.write(0x1d86, m.read(0x1d86) + base.cpu - state.base.cpu);
        m.florEnabled = florEnabled; m.write(0x1de0, audit?.florMode ?? 0);
        m.write(0x1d94, audit?.cpuClaim ?? 0); m.write(0x1d96, audit?.playerClaim ?? 39);
        m.write(0x1da2, audit ? 1 : 0); m.write(0x1dde, audit?.kind === "flor" && hasFlor(state.cpu) ? 1 : 0);
        state.base = base; state.tantoKey = tantoKey;
      }
      return state;
    }
    const player = playerCardOrder.map(id => fullPlayerHand.find(card => card.id === id)!);
    const cpu = [...fullCpuHand];
    const engine = new OriginalTruco(player, cpu, mano === "cpu", score.player, score.cpu, random.next, m => {
      m.write(0x1d74, florEnabled && hasFlor(cpu) ? 0 : envidoPoints(cpu)); m.write(0x1d76, florEnabled ? florPoints(cpu) : 0);
      m.write(0x1d9c, base.player); m.write(0x1d86, base.cpu);
      m.florEnabled = florEnabled; m.write(0x1de0, audit?.florMode ?? 0);
      m.write(0x1d94, audit?.cpuClaim ?? 0); m.write(0x1d96, audit?.playerClaim ?? 39);
      m.write(0x1da2, audit ? 1 : 0);
      m.write(0x1dde, audit?.kind === "flor" && hasFlor(cpu) ? 1 : 0);
    });
    return originalTrucoRef.current = { key, engine, player, cpu, base, tantoKey };
  }

  function applyTrucoEvent(endMessage?: string) {
    const state = originalTrucoState();
    const event = state.engine.event;
    if (event.kind === "call") { setTrucoCaller("cpu"); cpuCallsTruco(event.value as 2 | 3 | 4); return; }
    if (event.kind === "end") {
      const { winner, points } = state.engine.award(state.base);
      finishHand(winner, points, endMessage ?? (winner === "player" ? "Ganaste la mano." : "Te gané la mano."));
      return;
    }
    if (event.kind === "invalid") {
      state.engine.next(); say("Ese canto no corresponde ahora. Contestá la apuesta."); return;
    }
    if (event.kind === "tanto") throw Error("Tanto inesperado dentro de la decisión de Truco");
    giveTurn(event.kind === "card" ? "cpu" : "player");
  }

  function cpuTakeTurn() {
    if (phase !== "playing" || turn !== "cpu" || pendingCall || pendingEnvidoDeclaration || cpuCards.length === 0) return;
    if (!cpuDecisionMade) {
      setCpuDecisionMade(true);
      const cpuEnvido = envidoPoints(fullCpuHand);
      const cpuHasFlor = hasFlor(fullCpuHand);
      if (florEnabled && !envidoDone && tricks.length === 0 && cpuHasFlor) {
        openCpuFlor();
        return;
      }
      if (!envidoDone && tricks.length === 0 && !envidoOpeningSeenRef.current) {
        envidoOpeningSeenRef.current = true;
        if (mano === "player") envidoOpeningActionRef.current = true;
        const opening = originalCpuEnvidoOpening({
          points: cpuEnvido, playerScore: score.player, cpuScore: score.cpu,
          cpuIsMano: mano === "cpu", handNumber,
          playerAheadWithPending: score.player + handPointsRef.current.player > score.cpu + handPointsRef.current.cpu,
        }, random.next);
        if (opening.action) {
          const openingCall = opening.action;
          envidoOriginRef.current = "cpu";
          envidoStrategyRef.current = mano === "cpu" ? null : opening.strategyRoll;
          setPendingCall({ kind: "envido", sequence: [openingCall] });
          const [from, to] = openingCall === "falta-envido" ? [37, 48] : openingCall === "dos-reales" ? [25, 36] : openingCall === "real-envido" ? [13, 24] : [1, 12];
          sayOriginalRange(from, to, `¡${envidoLabel[openingCall]}!`);
          void playMusic(openingCall === "real-envido" || openingCall === "dos-reales" ? "real" : "envido", sound);
          return;
        }
      }

    }

    const state = originalTrucoState();
    const event = state.engine.event;
    if (event.kind !== "card") { applyTrucoEvent(); return; }
    const index = tricks.length;
    const current = table[index];
    const cpuCard = state.cpu[event.value! - 1];
    if (!cpuCards.some(card => card.id === cpuCard.id)) throw Error("La CPU eligió una carta ya jugada");
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
    state.engine.next();
    applyTrucoEvent();
  }

  function playCard(card: Card, effectiveStake = stake, resolvedPendingCall = false, nativeAlreadyPlayed = false) {
    if (phase !== "playing" || (!nativeAlreadyPlayed && turn !== "player") || pendingEnvidoDeclaration || (pendingCall && !resolvedPendingCall)) return;
    if (mano === "player" && tricks.length === 0) envidoOpeningActionRef.current = true;
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
    if (nativeAlreadyPlayed) return;
    const state = originalTrucoState();
    state.engine.answer(9 + state.player.findIndex(item => item.id === card.id));
    applyTrucoEvent();
  }

  function restoreDeferredTruco(deferredTruco?: 2 | 3 | 4) {
    setPendingCall(deferredTruco ? { kind: "truco", nextStake: deferredTruco } : null);
    if (deferredTruco) say("El tanto terminó. Todavía tenés que contestar el Truco.");
  }

  function resolveAcceptedEnvido(sequence: EnvidoCall[], deferredTruco?: 2 | 3 | 4, playerTrucoAfter = false) {
    const theirs = envidoPoints(fullCpuHand);
    const claim = theirs;
    setPendingCall(null);
    setEnvidoDone(true);
    setPlayerClaimDraft("");
    setPendingEnvidoDeclaration({ sequence, cpuClaim: claim, cpuActual: theirs, deferredTruco, playerTrucoAfter });
    say(mano === "cpu" ? `${describeEnvido(sequence)} querido. Yo canto ${claim}. ¿Y vos?` : `${describeEnvido(sequence)} querido. Sos mano: vos cantás primero.`, 13);
  }

  function declarePlayerEnvido(rawClaim: number) {
    const declaration = pendingEnvidoDeclaration;
    if (!declaration) return;
    const maxClaim = declaration.flor ? 38 : 33;
    const minClaim = declaration.flor && mano === "player" ? 20 : 0;
    if (!Number.isInteger(rawClaim) || rawClaim < minClaim || rawClaim > maxClaim) {
      say(`Cantá un número entero entre ${minClaim} y ${maxClaim}, aparcero.`);
      return;
    }
    if (declaration.flor) {
      const result = originalFlorDeclaration(declaration.cpuActual, rawClaim, mano === "cpu");
      if (result.winner === "invalid") return;
      const winner = result.winner;
      const effectiveClaim = result.auditClaim;
      deferFlor(winner, declaration.flor.points, declaration.flor.mode !== 0, declaration.flor.mode, effectiveClaim);
      setPendingEnvidoDeclaration(null); setPlayerClaimDraft("");
      restoreDeferredTruco(declaration.deferredTruco);
      say(`${rawClaim || "Son buenas"}. ${declaration.flor.points} de Flor quedan en revisión hasta mostrar las cartas.`);
      return;
    }
    const playerActual = envidoPoints(fullPlayerHand);
    const declared = originalEnvidoDeclaration(declaration.cpuActual, rawClaim, mano === "cpu");
    const points = acceptedEnvidoPoints(declaration.sequence, score.player, score.cpu);
    const result = originalEnvidoAudit(fullPlayerHand, rawClaim, declaration.cpuActual, mano === "cpu", florEnabled, points);
    const finalWinner: Side = result.playerPoints > 0 ? "player" : "cpu";
    const finalPoints = result.playerPoints + result.cpuPoints;
    const hiddenFlor = florEnabled && hasFlor(fullPlayerHand);
    const verdict = result.penalized
      ? hiddenFlor
        ? `Negaste tu Flor: la CPU recibe el Envido y cuatro puntos de penalización (${finalPoints}).`
        : `Se mostraron las cartas: cantaste ${rawClaim} y tenías ${playerActual}. La CPU se queda con los ${points} del Envido.`
      : `Se mostraron las cartas. ${points} de Envido para ${finalWinner === "player" ? "vos" : "la CPU"}.`;
    const audit: TantoAudit = { kind: "envido", points, declaredWinner: declared.winner, finalWinner, finalPoints, verdict, playerClaim: declared.auditClaim, cpuClaim: declaration.cpuActual };
    // 1B06 / 1C0A checks a provisional winning score before returning to the cards.
    const closure = originalEnvidoClosure(fullPlayerHand, rawClaim, declaration.cpuActual, mano === "cpu", florEnabled, points, score.player + handPointsRef.current.player, score.cpu + handPointsRef.current.cpu);
    const closesProvisionally = closure.immediate;
    if (closesProvisionally) {
      bankPoints(finalWinner, finalPoints);
      if (closure.matchWinner !== null) {
        setScore({ player: score.player + handPointsRef.current.player, cpu: score.cpu + handPointsRef.current.cpu });
        setPhase("match-over");
        setLastWinner(finalWinner);
      }
    } else deferTanto(audit);
    setPendingEnvidoDeclaration(null);
    setPlayerClaimDraft("");
    const resumePlayerTruco = declaration.playerTrucoAfter && closure.matchWinner === null;
    if (!resumePlayerTruco && closure.matchWinner === null) restoreDeferredTruco(declaration.deferredTruco);
    say(closesProvisionally ? verdict : mano === "player" ? `${rawClaim}: ${declared.winner === "player" ? "son buenas" : `${declaration.cpuActual} son mejores`}. El tanto queda en revisión hasta el final de la mano.` : rawClaim === 0 ? "Son buenas. El tanto queda en revisión hasta el final de la mano." : `${rawClaim} contra ${declaration.cpuClaim}. El tanto queda en revisión hasta el final de la mano.`);
    void playMusic(declared.winner === "player" ? "win" : "lose", sound);
    if (resumePlayerTruco) offerTrucoToCpu(true);

  }

  function cpuRespondsToEnvido(sequence: EnvidoCall[], deferredTruco?: 2 | 3 | 4, playerTrucoAfter = false) {
    const incomingCall = sequence.at(-1)!;
    if (incomingCall === "falta-envido" && (sequence.length === 1 || envidoOriginRef.current === "cpu")) faltaCountRef.current++;
    const cpuHasFlor = florEnabled && hasFlor(fullCpuHand);
    if (cpuHasFlor) {
      setEnvidoDone(true);
      void playMusic("flor", sound);
      openCpuFlor(deferredTruco);
      return;
    }

    const previous = sequence.slice(0, -1);
    // Keep the uncapped wager: the DOS strategy inspects it before awarding points.
    const previousWager = Math.max(1, previous.reduce(originalEnvidoRaisedWager, 0));
    const context = {
      points: envidoPoints(fullCpuHand),
      incoming: originalEnvidoCode[incomingCall],
      playerScore: score.player,
      cpuScore: score.cpu,
      cpuIsMano: mano === "cpu",
      openingStarted: envidoOpeningActionRef.current,
      playerAheadWithPending: score.player + handPointsRef.current.player > score.cpu + handPointsRef.current.cpu,
      previousWager,
      faltaCount: faltaCountRef.current,
    };
    const currentWager = sequence.reduce(originalEnvidoRaisedWager, 0);
    const counter = envidoOriginRef.current === "cpu"
      ? originalCpuEnvidoCounterResponse(context, envidoStrategyRef.current, currentWager, random.next)
      : null;
    if (counter) envidoStrategyRef.current = counter.strategyRoll;
    let action = counter?.action ?? originalCpuEnvidoResponse(context, random.next);
    if (action === "reject" && originalEnvidoForcedAcceptance(previousWager, currentWager, score.player, score.cpu)) action = "accept";
    if (action === "reject") {
      const points = rejectedEnvidoPoints(sequence, score.player, score.cpu);
      setEnvidoDone(true);
      bankPoints("player", points);
      restoreDeferredTruco(deferredTruco);
      say(`No quiero ${describeEnvido(sequence)}. ${points} para vos.`);
      void playMusic("noQuiero", sound);
      if (playerTrucoAfter) offerTrucoToCpu(true);
      return;
    }
    if (action !== "accept") {
      const raisedSequence = [...sequence, action];
      setPendingCall({ kind: "envido", sequence: raisedSequence, deferredTruco, playerTrucoAfter });
      const [from, to] = action === "falta-envido" ? [37, 48] : action === "dos-reales" ? [25, 36] : action === "envido" ? [1, 12] : [13, 24];
      sayOriginalRange(from, to, `La CPU responde ${describeEnvido(raisedSequence)}. Ahora decidís vos.`);
      void playMusic(action === "real-envido" || action === "dos-reales" ? "real" : "envidoReply", sound);
      return;
    }
    resolveAcceptedEnvido(sequence, deferredTruco, playerTrucoAfter);
  }

  function callEnvido(call: EnvidoCall = "envido", deferredTruco?: 2 | 3 | 4) {
    if ((turn !== "player" && deferredTruco === undefined) || envidoDone || tricks.length > 0 || phase !== "playing") return;
    if (pendingCall && pendingCall.kind !== "truco") return;
    const sequence = [call];
    envidoOriginRef.current = "player";
    envidoStrategyRef.current = null;
    deferredPlayerTrucoCodeRef.current = null;
    setPendingCall(null);
    void playMusic(call === "real-envido" ? "real" : "envido", sound);
    say(`Cantaste ${envidoLabel[call]}. La CPU decide…`);
    cpuRespondsToEnvido(sequence, deferredTruco);
  }

  function raisePendingEnvido(call: EnvidoCall) {
    if (!pendingCall || pendingCall.kind !== "envido") return;
    if (!allowedEnvidoRaises(pendingCall.sequence, envidoOriginRef.current).includes(call)) return;
    const sequence = [...pendingCall.sequence, call];
    const deferredTruco = pendingCall.deferredTruco;
    const playerTrucoAfter = pendingCall.playerTrucoAfter;
    setPendingCall(null);
    say(`Subís a ${describeEnvido(sequence)}. La CPU decide…`);
    void playMusic(call === "real-envido" ? "real" : call === "falta-envido" ? "envidoReply" : "envido", sound);
    cpuRespondsToEnvido(sequence, deferredTruco, playerTrucoAfter);
  }

  function deferFlor(declaredWinner: Side, points: number, playerClaimed: boolean, mode: 0 | 40 | 50 | 60 = playerClaimed ? 50 : 0, claim = 50) {
    const result = originalFlorAudit(florPoints(fullPlayerHand), claim, declaredWinner, points, mode, hasFlor(fullCpuHand), envidoPoints(fullPlayerHand));
    const verdict = result.penalized
      ? `Se mostraron las cartas: el canto de Flor no era válido. ${result.points} para la CPU.`
      : `Se mostraron las cartas: ${points} de Flor para ${result.winner === "player" ? "vos" : "la CPU"}.`;
    const audit: TantoAudit = { kind: "flor", points, declaredWinner, finalWinner: result.winner, finalPoints: result.points, verdict, playerClaim: claim, cpuClaim: florPoints(fullCpuHand), florMode: mode };
    if (score[declaredWinner] + handPointsRef.current[declaredWinner] + points >= 30) {
      bankPoints(result.winner, result.points);
      if (score[result.winner] + handPointsRef.current[result.winner] >= 30) {
        setScore({ player: score.player + handPointsRef.current.player, cpu: score.cpu + handPointsRef.current.cpu });
        setPhase("match-over"); setLastWinner(result.winner);
      }
    } else deferTanto(audit);
  }

  function openCpuFlor(deferredTruco?: 2 | 3 | 4) {
    const opening = originalCpuFlorOpening(florPoints(fullCpuHand), random.next);
    setEnvidoDone(true);
    void playMusic("flor", sound);
    setPendingCall({ kind: "flor", mode: opening === 30 ? "resto" : "flor", opening, deferredTruco });
    say(opening === 4 ? "Si hay Flor, me achico." : opening === 30 ? "¡Flor al resto!" : "¡Flor!", 49);
  }

  function applyFlorResult(result: FlorResult, deferredTruco?: 2 | 3 | 4) {
    if (result.action === "invalid") { say("Ese canto no corresponde a esta Flor. Contestá la propuesta."); return; }
    setEnvidoDone(true);
    setPendingCall(null);
    if (result.action === "accept") {
      const actual = florPoints(fullCpuHand);
      setPlayerClaimDraft("");
      setPendingEnvidoDeclaration({ sequence: [], cpuClaim: actual, cpuActual: actual, deferredTruco, flor: { points: result.points, mode: result.mode } });
      say(mano === "cpu" ? `Flor querida. Yo canto ${actual}. ¿Y vos?` : "Flor querida. Sos mano: cantá tus tantos.", 61);
    } else {
      deferFlor(result.action, result.points, result.mode !== 0, result.mode);
      restoreDeferredTruco(deferredTruco);
      say(`${result.action === "player" ? "Con Flor me achico" : "La Flor queda para mí"}. ${result.points} puntos quedan en revisión.`, result.action === "player" ? 73 : 49);
    }
  }

  function replyFlor(incoming: number) {
    if (pendingCall?.kind !== "flor") return;
    const opening = pendingCall.opening ?? (pendingCall.mode === "resto" ? 30 : 3);
    applyFlorResult(originalFlorReply(opening, incoming, florPoints(fullCpuHand), score.player, score.cpu), pendingCall.deferredTruco);
  }

  function raisePendingFlor() { replyFlor(7); }

  function callFlor(deferredTruco?: 2 | 3 | 4, fromPendingCall = false, incoming: 5 | 6 | 7 | 8 = 5) {
    if (turn !== "player" || !canCallFlor || phase !== "playing" || (!fromPendingCall && pendingCall) || pendingEnvidoDeclaration) return;
    void playMusic("flor", sound);
    applyFlorResult(originalCpuFlorResponse(florPoints(fullCpuHand), incoming, score.player, score.cpu, random.next), deferredTruco);
  }

  function interruptPendingWithFlor() {
    if (!pendingCall || pendingCall.kind === "flor" || envidoDone || tricks.length > 0) return;
    const deferredTruco = pendingCall.kind === "truco" ? pendingCall.nextStake : pendingCall.deferredTruco;
    callFlor(deferredTruco, true);
  }

  function offerTrucoToCpu(skipEnvido = false, originalCode?: number): number | null {
    if (stake >= 4 || trucoCaller === "player") return null;
    void playMusic(stake === 1 ? "truco" : stake === 2 ? "retruco" : "vale4", sound);
    const code = originalCode ?? deferredPlayerTrucoCodeRef.current ?? (stake === 1 ? 15 : stake === 2 ? 19 : 23);
    if (skipEnvido) deferredPlayerTrucoCodeRef.current = null;
    if (!skipEnvido && mano === "player" && !envidoDone && tricks.length === 0 && !envidoOpeningSeenRef.current && !(florEnabled && hasFlor(fullCpuHand))) {
      envidoOpeningSeenRef.current = true;
      envidoOpeningActionRef.current = true;
      const opening = originalCpuEnvidoOpening({ points: envidoPoints(fullCpuHand), playerScore: score.player, cpuScore: score.cpu, cpuIsMano: false, playerAheadWithPending: score.player + handPointsRef.current.player > score.cpu + handPointsRef.current.cpu, handNumber }, random.next);
      if (opening.action) {
        envidoOriginRef.current = "cpu";
        envidoStrategyRef.current = opening.strategyRoll;
        deferredPlayerTrucoCodeRef.current = code;
        setPendingCall({ kind: "envido", sequence: [opening.action], playerTrucoAfter: true });
        say(`Antes está el ${envidoLabel[opening.action]}, mi amigo.`);
        void playMusic("envido", sound);
        return null;
      }
    }
    const state = originalTrucoState();
    const next = stake + 1 as 2 | 3 | 4;
    const before = state.engine.machine.read(0x18bc);
    state.engine.answer(code);
    if (state.engine.event.kind === "invalid") { applyTrucoEvent(); return null; }
    const accepted = state.engine.event.kind !== "end";
    if (accepted) { setStake(next); setTrucoCaller("player"); }
    if (state.engine.machine.read(0x18bc) > before) playCommandCard((code - (next === 2 ? 12 : next === 3 ? 16 : 20)) as 0 | 1 | 2, next, true, true);
    applyTrucoEvent();
    if (!accepted || state.engine.event.kind === "call") return null;
    say("Quiero, che. Seguimos jugando.");
    return next;
  }

  function callTruco(originalCode?: number): number | null {
    if (turn !== "player" || stake >= 4 || trucoCaller === "player" || phase !== "playing" || pendingCall) return null;
    return offerTrucoToCpu(false, originalCode);
  }

  function fold() {
    if (turn !== "player" || phase !== "playing" || pendingCall) return;
    originalTrucoState().engine.answer(26);
    applyTrucoEvent("Abandonaste, cobarde. ¡El cuello te arde!");
  }

  function acceptPendingCall() {
    if (!pendingCall) return;
    if (pendingCall.kind === "truco") {
      setStake(pendingCall.nextStake);
      setTrucoCaller("cpu");
      setPendingCall(null);
      say("Quiero. Seguimos jugando.");
      void playMusic("quiero", sound);
      originalTrucoState().engine.answer(24);
      applyTrucoEvent();
      return;
    }
    if (pendingCall.kind === "flor") {
      replyFlor((pendingCall.opening ?? 3) === 3 ? 6 : 24);
      return;
    }
    resolveAcceptedEnvido(pendingCall.sequence, pendingCall.deferredTruco, pendingCall.playerTrucoAfter);
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
      if (rejected.playerTrucoAfter) offerTrucoToCpu(true);
    } else if (rejected.kind === "flor") {
      applyFlorResult(originalFlorReply(rejected.opening ?? (rejected.mode === "resto" ? 30 : 3), 8, florPoints(fullCpuHand), score.player, score.cpu), rejected.deferredTruco);
    } else {
      originalTrucoState().engine.answer(25);
      applyTrucoEvent("No quiero. La apuesta anterior es para la CPU.");
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
    offerTrucoToCpu(true);
  }

  function interruptTrucoWithEnvido(call: EnvidoCall) {
    if (!pendingCall || pendingCall.kind !== "truco" || envidoDone || tricks.length > 0) return;
    callEnvido(call, pendingCall.nextStake);
  }

  function raisePendingTruco(originalCode?: number): number | null {
    if (!pendingCall || pendingCall.kind !== "truco" || pendingCall.nextStake >= 4) return null;
    const raisedStake = (pendingCall.nextStake + 1) as 3 | 4;
    setPendingCall(null);
    const state = originalTrucoState();
    const before = state.engine.machine.read(0x18bc);
    const code = originalCode ?? (raisedStake === 3 ? 19 : 23);
    state.engine.answer(code);
    if (state.engine.event.kind === "invalid") {
      state.engine.next();
      setPendingCall(pendingCall);
      say("Ahora sólo podés querer o rechazar ese Truco.");
      return null;
    }
    const accepted = state.engine.event.kind !== "end";
    if (accepted) { setStake(raisedStake); setTrucoCaller("player"); }
    if (state.engine.machine.read(0x18bc) > before) playCommandCard((code - (raisedStake === 3 ? 16 : 20)) as 0 | 1 | 2, raisedStake, true, true);
    void playMusic(raisedStake === 3 ? "retruco" : "vale4", sound);
    applyTrucoEvent();
    if (!accepted || state.engine.event.kind === "call") return null;
    say(`Quiero tu ${raisedStake === 3 ? "retruco" : "vale cuatro"}.`);
    return raisedStake;
  }

  function nextHand() {
    if (matchWinner) {
      const next = dealHand(random.next);
      const firstMano: Side = startAsMano ? "player" : "cpu";
      setScore({ player: 0, cpu: 0 });
      faltaCountRef.current = 0;
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
      envidoOpeningSeenRef.current = false;
      envidoOpeningActionRef.current = false;
      envidoOriginRef.current = "player";
      envidoStrategyRef.current = null;
      deferredPlayerTrucoCodeRef.current = null;
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
    const next = dealHand(random.next);
    const nextMano: Side = mano === "player" ? "cpu" : "player";
    setPlayerCards(next.player);
    setPlayerCardOrder(next.player.map((card) => card.id));
    setCpuCards(next.cpu);
    setTable([]);
    setTricks([]);
    setStake(1);
    setTrucoCaller(null);
    setEnvidoDone(false);
    envidoOpeningSeenRef.current = false;
    envidoOpeningActionRef.current = false;
    envidoOriginRef.current = "player";
    envidoStrategyRef.current = null;
    deferredPlayerTrucoCodeRef.current = null;
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

  function playCommandCard(index: 0 | 1 | 2, effectiveStake = stake, resolvedPendingCall = false, nativeAlreadyPlayed = false): boolean {
    const card = playerCards.find((item) => item.id === playerCardOrder[index]);
    if (!card) {
      say(`La carta ${index + 1} ya no está en tu mano.`);
      return true;
    }
    playCard(card, effectiveStake, resolvedPendingCall, nativeAlreadyPlayed);
    return true;
  }

  function handleGameCommand(command: OriginalCommand): boolean {
    if (phase !== "playing") return false;
    const { code, cardIndex, normalized: text } = command;

    if (pendingCall?.kind === "envido") {
      const raises = allowedEnvidoRaises(pendingCall.sequence, envidoOriginRef.current);
      if (florEnabled && code === 5) { interruptPendingWithFlor(); return true; }
      if (code === 4 && raises.includes("falta-envido")) { raisePendingEnvido("falta-envido"); return true; }
      if (code === 2 && raises.includes("real-envido")) { raisePendingEnvido("real-envido"); return true; }
      if (code === 3 && raises.includes("dos-reales")) { raisePendingEnvido("dos-reales"); return true; }
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
      if (!envidoDone && tricks.length === 0 && code === 2) { interruptTrucoWithEnvido("real-envido"); return true; }
      if (!envidoDone && tricks.length === 0 && code === 3) { interruptTrucoWithEnvido("dos-reales"); return true; }
      if (!envidoDone && tricks.length === 0 && code === 1) { interruptTrucoWithEnvido("envido"); return true; }

      const retrucoCodes = [16, 17, 18, 19];
      const valeFourCodes = [20, 21, 22, 23];
      const requestsCorrectRaise = pendingCall.nextStake === 2
        ? retrucoCodes.includes(code)
        : pendingCall.nextStake === 3 && valeFourCodes.includes(code);
      if (requestsCorrectRaise) {
        raisePendingTruco(code);
        return true;
      }
      if (code === 24 || code === 0) { acceptPendingCall(); return true; }
      if (code === 25 || code === 26) { rejectPendingCall(); return true; }
      if (code > 0) { say(`Tenés que contestar ${pendingCallLabel(pendingCall)}: quiero, no quiero o una subida válida.`); return true; }
      return false;
    }

    if (pendingCall?.kind === "flor") {
      if ([0, 5, 6, 7, 8, 24, 25, 26].includes(code)) { replyFlor(code); return true; }
      if (code > 0) { say("Con Flor: quiero, Flor, con Flor quiero, contraflor o me achico."); return true; }
      return false;
    }

    if (code === 4) { callEnvido("falta-envido"); return true; }
    if (code === 2) { callEnvido("real-envido"); return true; }
    if (code === 3) { callEnvido("dos-reales"); return true; }
    if (code === 1) { callEnvido("envido"); return true; }
    if (code >= 5 && code <= 8) {
      if (!florEnabled) say("Esta partida se juega sin Flor, che.");
      else callFlor(undefined, false, code as 5 | 6 | 7 | 8);
      return true;
    }
    if (code >= 9 && code <= 11 && cardIndex !== undefined) return playCommandCard(cardIndex);
    if (code >= 12 && code <= 14 && cardIndex !== undefined) {
      callTruco(code);
      return true;
    }
    if (code === 15 || stake === 2 && code >= 16 && code <= 19 || stake === 3 && code >= 20 && code <= 23) { callTruco(code); return true; }
    if (code === 26) { fold(); return true; }
    if (code > 0) { say("Ese canto no corresponde en este momento de la mano."); return true; }
    return false;
  }

  function submitCommand(event: FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    if (pendingEnvidoDeclaration) {
      if (mano === "cpu" && /^(son buenas|buenas)$/i.test(value)) { declarePlayerEnvido(0); setCommand(""); return; }
      if (/^\d{1,2}$/.test(value)) declarePlayerEnvido(Number(value));
      else say(pendingEnvidoDeclaration.flor ? "La CPU espera tu Flor: escribí tus tantos hasta 38." : "La CPU espera tus tantos: escribí un número entre 0 y 33.");
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
    const next = dealHand(random.next);
    const firstMano: Side = startAsMano ? "player" : "cpu";
    setPlayerCards(next.player);
    setPlayerCardOrder(next.player.map((card) => card.id));
    setCpuCards(next.cpu);
    setTable([]);
    setTricks([]);
    setScore({ player: 0, cpu: 0 });
    faltaCountRef.current = 0;
    handPointsRef.current = { player: 0, cpu: 0 };
    setHandPoints({ player: 0, cpu: 0 });
    setStake(1);
    setTrucoCaller(null);
    setEnvidoDone(false);
    envidoOpeningSeenRef.current = false;
    envidoOpeningActionRef.current = false;
    envidoOriginRef.current = "player";
    envidoStrategyRef.current = null;
    deferredPlayerTrucoCodeRef.current = null;
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

  if(showDosReplay)return <Suspense fallback={<main className="intro-shell">Cargando reproducción DOS…</main>}><DosReplayPanel onClose={()=>setShowDosReplay(false)} /></Suspense>;

  // show landing, first splash
  if (!started) {
    return (
      <main className="intro-shell">
        <div className="intro-card glass">
          <p className="eyebrow">RECUPERACIÓN DIGITAL // 1986 → WEB</p>
          <img src={assetUrl("restored/pantalla-fullcolor.png")} alt="Restauración a todo color de la pantalla de Truco Arbiser" />
          <div className="intro-copy">
            <h1>El truco volvió a la mesa.</h1>
            <p>Cartas, versos, música y voces extraídos del programa original. Baraja española y una CPU que todavía tiene memoria.</p>
          </div>
          <div className="intro-options" aria-label="Opciones de la partida">
            <button className="intro-option" type="button" aria-pressed={florEnabled} onClick={() => setFlorEnabled((value) => !value)}>
              <span><strong>Jugar con Flor</strong><em>{florEnabled ? "Flor, con Flor quiero y al resto" : "Sólo envido"}</em></span>
              <i aria-hidden="true"><b /></i>
            </button>
            <button className="intro-option" type="button" aria-pressed={startAsMano} onClick={() => setStartAsMano((value) => !value)}>
              <span><strong>Quiero ser mano</strong><em>{startAsMano ? "Vos tirás primero" : "La CPU tira primero"}</em></span>
              <i aria-hidden="true"><b /></i>
            </button>
          </div>
          {introBlocked ? <button className="sound-unlock" onClick={() => void activateSplashAudio()}>▶ ACTIVAR SONIDO DEL SPLASH</button> : null}
          <button className="primary-button" onClick={startGame}>JUGAR PARTIDA <span>↗</span></button>
          <button type="button" className="dos-entry" onClick={()=>{stopMusic();setShowDosReplay(true);}}>REPRODUCIR DOS POR SEMILLA</button>
          <small className="intro-credit">Juego original por Ariel y Enrique Arbiser · Port web por Carlos A. Leguizamón</small>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar glass">
        <div className="brand"><span className="brand-mark">TA</span><div><strong>TRUCO ARBISER</strong><small>WEB PORT // v{__APP_VERSION__} · BUILD {import.meta.env.VITE_BUILD_ID || __BUILD_ID__}</small></div></div>
        <nav aria-label="Vistas">
          <button className={view === "game" ? "selected" : ""} onClick={() => setView("game")}>Partida</button>
          <button onClick={()=>{stopMusic();setShowDosReplay(true);}}>DOS por semilla</button>
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
              <div className="player-label"><span className="status-dot" /> CPU_ARBITER <em>{cpuCards.length} cartas · {phase !== "playing" ? tantoAudit ? "MOSTRÓ" : "MANO CERRADA" : mano === "cpu" ? "MANO" : turn === "cpu" ? "TURNO" : "ESPERA"}</em></div>
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
                  <small>{mano === "cpu" ? "LA CPU DECLARÓ" : "SOS MANO"}</small>
                  <strong>{mano === "cpu" ? `${pendingEnvidoDeclaration.cpuClaim} DE ${pendingEnvidoDeclaration.flor ? "FLOR" : "ENVIDO"}` : "VOS CANTÁS PRIMERO"}</strong>
                </div>
                <button className="action-primary" onClick={() => declarePlayerEnvido(pendingEnvidoDeclaration.flor ? florPoints(fullPlayerHand) : envidoPoints(fullPlayerHand))}>Cantar {pendingEnvidoDeclaration.flor ? florPoints(fullPlayerHand) : envidoPoints(fullPlayerHand)}<small>Decir la verdad</small></button>
                <div className="claim-entry">
                  <input type="number" min="0" max={pendingEnvidoDeclaration.flor ? 38 : 33} inputMode="numeric" value={playerClaimDraft} onChange={(event) => setPlayerClaimDraft(event.target.value)} placeholder={pendingEnvidoDeclaration.flor ? "20–38" : "0–33"} aria-label="Tantos que querés declarar" />
                  <button onClick={() => declarePlayerEnvido(Number(playerClaimDraft))} disabled={playerClaimDraft === ""}>Declarar<small>Jugar con picardía</small></button>
                </div>
                {mano === "cpu" ? <button onClick={() => declarePlayerEnvido(0)}>Son buenas<small>Ceder el tanto</small></button> : null}
                <p className="bluff-hint">Podés cantar otros tantos. Las cartas se muestran al cerrar la mano.</p>
              </> : phase === "playing" && pendingCall ? <>
                <div className="call-notice">
                  <small>TE TOCA RESPONDER</small>
                  <strong>{pendingCallLabel(pendingCall)}</strong>
                </div>
                <button className="action-primary" onClick={acceptPendingCall}>{pendingCall.kind === "flor" && pendingCall.opening === 3 ? "Con Flor quiero" : "Quiero"}<small>Aceptar la propuesta</small></button>
                <div className="bid-options">
                  <button onClick={rejectPendingCall}>{pendingCall.kind === "flor" ? "Con flor me achico" : "No quiero"}<small>Rechazar</small></button>
                  {pendingCall.kind === "envido" ? <>
                    {allowedEnvidoRaises(pendingCall.sequence, envidoOriginRef.current).map((call) => <button key={call} onClick={() => raisePendingEnvido(call)}>{call === "envido" && pendingCall.sequence.includes("envido") ? "Envido envido" : envidoLabel[call]}<small>Subir el tanto</small></button>)}
                    {florEnabled ? <button onClick={interruptPendingWithFlor}>Flor<small>Anula el Envido</small></button> : null}
                    {stake < 4 && trucoCaller !== "player" ? <>
                      <button onClick={() => answerEnvidoAndTruco(true)}>Quiero y {trucoLabel}<small>Resolver y cantar</small></button>
                      <button onClick={() => answerEnvidoAndTruco(false)}>No quiero y {trucoLabel}<small>Ceder y cantar</small></button>
                    </> : null}
                  </> : null}
                  {pendingCall.kind === "truco" ? <>
                    {pendingCall.nextStake < 4 ? <button onClick={() => raisePendingTruco()}>Quiero y {pendingCall.nextStake === 2 ? "retruco" : "vale 4"}<small>Aceptar y subir</small></button> : null}
                    {!envidoDone && tricks.length === 0 ? <>
                      <button onClick={() => interruptTrucoWithEnvido("envido")}>Envido<small>Se resuelve primero</small></button>
                      <button onClick={() => interruptTrucoWithEnvido("real-envido")}>Real Envido<small>Se resuelve primero</small></button>
                      <button onClick={() => interruptTrucoWithEnvido("falta-envido")}>Falta Envido<small>Se resuelve primero</small></button>
                      {florEnabled ? <button onClick={interruptPendingWithFlor}>Flor<small>Se resuelve primero</small></button> : null}
                    </> : null}
                  </> : null}
                  {pendingCall.kind === "flor" ? <>
                    {pendingCall.mode !== "resto" ? <button onClick={() => replyFlor(5)}>Flor<small>Responder con Flor</small></button> : null}
                    {pendingCall.mode !== "resto" ? <button onClick={() => raisePendingFlor()}>Contraflor al resto<small>Jugar el partido</small></button> : null}
                  </> : null}
                </div>
              </> : phase === "playing" ? <>
                <button className="action-primary" onClick={() => callTruco()} disabled={!openingChecked || turn !== "player" || stake >= 4 || trucoCaller === "player"}>{trucoLabel}<small>{!openingChecked ? "La CPU revisa sus cartas" : turn !== "player" ? "Está jugando la CPU" : trucoCaller === "player" ? "Esperá que suba la CPU" : "Subir la apuesta"}</small></button>
                <div className="bid-options normal-bids">
                  <button onClick={() => callEnvido("envido")} disabled={!openingChecked || turn !== "player" || envidoDone || tricks.length > 0 || canFlor}>Envido<small>Dos puntos</small></button>
                  <button onClick={() => callEnvido("real-envido")} disabled={!openingChecked || turn !== "player" || envidoDone || tricks.length > 0 || canFlor}>Real Envido<small>Tres puntos</small></button>
                  <button onClick={() => callEnvido("falta-envido")} disabled={!openingChecked || turn !== "player" || envidoDone || tricks.length > 0 || canFlor}>Falta Envido<small>Hasta 30 puntos</small></button>
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
            <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={pendingEnvidoDeclaration ? pendingEnvidoDeclaration.flor ? "Cantá tu Flor (20–38)…" : "Cantá tus tantos (0–33)…" : "Decile algo a la CPU… pero cuidá el léxico"} aria-label="Hablarle a la CPU" />
            <button type="submit">ENVIAR</button>
          </form>
        </section>
      ) : (
        <section className="archive-layout">
          <article className="archive-hero glass">
            <div><p className="eyebrow">ARQUEOLOGÍA DEL EJECUTABLE</p><h2>No fue una imitación.<br />Fue una excavación.</h2><p>Los recursos que ves acá salieron de los archivos originales: buffers gráficos CGA de QuickBasic, 156 registros de diálogo y sus 156 muestras de voz de un bit.</p></div>
            <img src={assetUrl("original/pantalla-bsave.png")} alt="Título CGA recuperado" />
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
