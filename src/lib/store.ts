import {
  generateSecret,
  getStateFilePath,
  isBuildTime,
  loadPersistedState,
  savePersistedState,
} from "./persistence";
import { getBetMarket, scoreBets } from "./betMarkets";
import { withInterstitials } from "./deckBuilder";
import { SavedGame, parkGame, restoreGame } from "./decks";
import { ensureSeeded, listDecks, loadDeck, saveDeckSlides } from "./deckStore";
import statCharts from "./stat_charts.json";
import quoteCards from "./quote_cards.json";
import { roundScore, roundToStep, slideMaxPoints } from "./scoring";
import quizData from "./quiz_data.json";
import { Player, RoomState, SlideData } from "./types";

const globalRoomStore = globalThis as unknown as {
  roomState: RoomState | undefined;
  playerTokens: Record<string, string> | undefined;
  hostKey: string | undefined;
  /** deckId -> the game parked on it. The live one is in roomState. */
  games: Record<string, SavedGame> | undefined;
};

/** Chart ids in the order the deck should show them. */
const CHART_IDS = (statCharts as { charts: { id: string }[] }).charts.map(
  (c) => c.id
);

/** Quote cards in the order the deck should show them (build_quote_cards.py). */
const QUOTE_IDS = (quoteCards as { cards: { id: string }[] }).cards.map(
  (c) => c.id
);

function buildDeck(slides: SlideData[]): SlideData[] {
  return withInterstitials(slides, CHART_IDS, QUOTE_IDS);
}

function createFreshRoom(): RoomState {
  ensureSeeded();
  const first = listDecks()[0];
  const deck = first ? loadDeck(first.id) : null;
  return {
    code: "MÖRTTINEN",
    activeDeckId: deck?.id,
    currentSlideIndex: 0,
    gamePhase: "answering",
    isAnswerRevealed: false,
    isQuestionLocked: false,
    players: {},
    slides: buildDeck((deck?.slides ?? (quizData as SlideData[])) as SlideData[]),
  };
}

if (!globalRoomStore.roomState) {
  const restored = loadPersistedState();

  if (restored) {
    globalRoomStore.roomState = restored.room;
    globalRoomStore.playerTokens = restored.playerTokens || {};
    globalRoomStore.hostKey = restored.hostKey;
    globalRoomStore.games = restored.games || {};
    ensureSeeded();
    console.log(
      `[backlogvisa] Palautettiin tallennettu pelitila (${
        Object.keys(restored.room.players).length
      } pelaajaa, dia ${restored.room.currentSlideIndex + 1}/${
        restored.room.slides.length
      }) tiedostosta ${getStateFilePath()}`
    );
  } else {
    globalRoomStore.roomState = createFreshRoom();
    globalRoomStore.playerTokens = {};
    globalRoomStore.hostKey = undefined;
    globalRoomStore.games = {};
  }

  // An explicit HOST_KEY always wins, so the host can pin a memorable one
  const envKey = process.env.HOST_KEY?.trim();
  if (envKey) {
    globalRoomStore.hostKey = envKey;
  } else if (!globalRoomStore.hostKey) {
    globalRoomStore.hostKey = generateSecret();
  }

  if (!isBuildTime()) {
    persist();
    console.log(
      `\n[backlogvisa] Juontajan hallintalinkki (avaa tämä valkokankaalle):\n` +
        `  http://localhost:${process.env.PORT || 3000}/deck?key=${
          globalRoomStore.hostKey
        }\n` +
        `  Pelaajat liittyvät osoitteessa /play ilman avainta.\n`
    );
  }
}

export function getRoomState(): RoomState {
  return globalRoomStore.roomState!;
}

export function getHostKey(): string {
  return globalRoomStore.hostKey!;
}

function getPlayerTokens(): Record<string, string> {
  if (!globalRoomStore.playerTokens) {
    globalRoomStore.playerTokens = {};
  }
  return globalRoomStore.playerTokens;
}

/**
 * Mirrors the room to disk. Called at the end of every mutation — the state is
 * small enough (tens of KB) that a synchronous atomic write is cheaper than
 * reasoning about a lost-write window during a live event.
 */
function persist() {
  savePersistedState({
    version: 2,
    games: globalRoomStore.games ?? {},
    savedAt: new Date().toISOString(),
    hostKey: globalRoomStore.hostKey!,
    playerTokens: getPlayerTokens(),
    room: globalRoomStore.roomState!,
  });
}

/**
 * Single write path for every point award, manual or automatic.
 * Records the award in scoresPerSlide so a later correction replaces it
 * instead of stacking on top of it.
 */
function applySlideScore(
  player: Player,
  slideId: number | string,
  points: number
) {
  if (!player.scoresPerSlide) {
    player.scoresPerSlide = {};
  }
  const previousPoints = player.scoresPerSlide[slideId] ?? 0;
  player.score = roundScore(
    Math.max(0, player.score - previousPoints + points)
  );
  player.scoresPerSlide[slideId] = points;
}

function clampSlideIndex() {
  const room = getRoomState();
  const maxIndex = Math.max(0, room.slides.length - 1);
  if (room.currentSlideIndex > maxIndex) {
    room.currentSlideIndex = maxIndex;
  }
  if (room.currentSlideIndex < 0) {
    room.currentSlideIndex = 0;
  }
}

export const MAX_PLAYER_NAME_LENGTH = 40;

export type JoinResult =
  | { status: "joined"; playerId: string; token: string }
  | { status: "reconnected"; playerId: string; token: string }
  | { status: "name_taken"; playerId: null; token: null };

/**
 * Registers or reconnects a player.
 *
 * Reconnecting by name alone is what let a guest type an existing nickname into
 * the free-text field and silently inherit that player's score. A join now has
 * to prove ownership with the token issued at first join; without it the caller
 * gets `name_taken` and must confirm the takeover explicitly (`force`).
 */
export function joinPlayer(
  name: string,
  token?: string,
  force?: boolean
): JoinResult {
  const room = getRoomState();
  const cleanName = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  const tokens = getPlayerTokens();

  const existingPlayer = Object.values(room.players).find(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (existingPlayer) {
    const ownsName = Boolean(token) && tokens[existingPlayer.id] === token;
    if (!ownsName && !force) {
      return { status: "name_taken", playerId: null, token: null };
    }

    // Taking over reissues the token so the previous device stops being able to
    // answer as this player.
    const reissued = generateSecret();
    tokens[existingPlayer.id] = reissued;
    persist();
    return {
      status: "reconnected",
      playerId: existingPlayer.id,
      token: reissued,
    };
  }

  const id = "player_" + Math.random().toString(36).substring(2, 9);
  room.players[id] = {
    id,
    name: cleanName,
    score: 0,
    answers: {},
    scoresPerSlide: {},
    joinedAt: Date.now(),
  };
  const newToken = generateSecret();
  tokens[id] = newToken;
  persist();
  return { status: "joined", playerId: id, token: newToken };
}

export function submitAnswer(playerId: string, slideId: number | string, answer: any) {
  const room = getRoomState();
  const player = room.players[playerId];
  if (!player) return;

  // Block submissions if question is locked or in review phase
  if (room.isQuestionLocked || room.gamePhase === "review") {
    return;
  }

  // Save answer
  player.answers[slideId] = answer;
  persist();
}

export function nextSlide() {
  const room = getRoomState();
  if (room.currentSlideIndex < room.slides.length - 1) {
    room.currentSlideIndex++;
    room.isAnswerRevealed = false;
    if (room.gamePhase === "answering") {
      room.isQuestionLocked = false;
    }
    persist();
  }
}

export function prevSlide() {
  const room = getRoomState();
  if (room.currentSlideIndex > 0) {
    room.currentSlideIndex--;
    room.isAnswerRevealed = false;
    // Mirror nextSlide: stepping back to re-read a question must not leave
    // players locked out of answering it.
    if (room.gamePhase === "answering") {
      room.isQuestionLocked = false;
    }
    persist();
  }
}

export function lockQuestion() {
  const room = getRoomState();
  room.isQuestionLocked = true;
  persist();
}

export function unlockQuestion() {
  const room = getRoomState();
  room.isQuestionLocked = false;
  persist();
}

export function toggleQuestionLock() {
  const room = getRoomState();
  room.isQuestionLocked = !room.isQuestionLocked;
  persist();
}

/**
 * Records or changes a player's bet.
 *
 * Changing your mind is the point: the market stays open through every
 * between-questions screen so players can talk each other off a pick, right
 * up until review starts. A bet must name a player who is actually in the
 * room, so a stale pick can't win once someone leaves.
 */
export function placeBet(
  playerId: string,
  marketId: string,
  pick: string
): boolean {
  const room = getRoomState();
  if (room.areBetsClosed) return false;

  const player = room.players[playerId];
  if (!player) return false;
  if (!getBetMarket(marketId)) return false;
  if (!room.players[pick]) return false;

  player.bets = { ...(player.bets ?? {}), [marketId]: pick };
  persist();
  return true;
}

/**
 * Settles the market and pays out.
 *
 * Winnings are computed from the scores as they stand *before* any payout,
 * otherwise a big bet win could hand someone the "who wins" market they just
 * bet on. Runs once — `areBetsResolved` stops a second scoreboard reveal from
 * re-resolving against scores that already include the winnings.
 */
export function resolveBets() {
  const room = getRoomState();
  if (room.areBetsResolved) return;

  const awards = scoreBets(room);
  for (const [playerId, perMarket] of Object.entries(awards)) {
    const player = room.players[playerId];
    if (!player) continue;
    for (const [marketId, points] of Object.entries(perMarket)) {
      applySlideScore(player, `bet:${marketId}`, points);
    }
  }

  room.areBetsResolved = true;
  persist();
}

export function startReviewPhase() {
  const room = getRoomState();
  room.gamePhase = "review";
  // Answering is over, so the market closes for good. It must not reopen if
  // the host toggles back — by then the first answers may already be scored.
  room.areBetsClosed = true;
  // Jump to the first actual question rather than assuming it sits at index 1.
  const firstQuestionIndex = room.slides.findIndex(
    (s) => s.type !== "lobby" && s.type !== "scoreboard"
  );
  room.currentSlideIndex = firstQuestionIndex >= 0 ? firstQuestionIndex : 0;
  clampSlideIndex();
  room.isAnswerRevealed = false;
  room.isQuestionLocked = true;
  persist();
}

/**
 * Returns to the answering phase — the way back out of a mis-clicked review.
 *
 * Deliberately stays on the current slide (unlike `startReviewPhase`, which
 * jumps to the first question): a host who toggles back mid-deck means "let
 * them answer *this* one again". Scores already on record survive, because
 * `revealAnswer` refuses to re-grade a slide a player already has points for.
 */
export function endReviewPhase() {
  const room = getRoomState();
  room.gamePhase = "answering";
  room.isAnswerRevealed = false;
  room.isQuestionLocked = false;
  persist();
}

/**
 * Points a player earned on a slide, on the "1 point = 1 right answer" scale.
 *
 * Open questions deliberately return 0: they are judged by the host from the
 * answer list, never by string matching. The old matcher handed out full marks
 * for a substring hit and a consolation prize for anything else, which is
 * exactly the kind of call a human should be making.
 */
function calculateAutoScore(slide: SlideData, answer: any): number {
  const max = slideMaxPoints(slide);

  if (slide.type === "multiple_choice") {
    return answer === slide.correctAnswer ? max : 0;
  }

  if (slide.type === "open_ended") {
    return 0;
  }

  if (slide.type === "prediction_market") {
    // An unresolved market pays nobody, rather than silently resolving to YES.
    if (slide.resolvedOutcome === undefined) return 0;
    const outcome = typeof answer === "object" ? answer.outcome : answer;
    return outcome === slide.resolvedOutcome ? max : 0;
  }

  if (slide.type === "connect_pairs") {
    const pairs = slide.pairs || [];
    if (pairs.length === 0 || typeof answer !== "object" || answer === null) {
      return 0;
    }
    // A four-way pairing is one right answer split four ways: 0,25 each.
    const correctMatches = pairs.filter((p) => answer[p.left] === p.right).length;
    return roundScore((max * correctMatches) / pairs.length);
  }

  if (slide.type === "slider") {
    const numAns = Number(answer);
    if (isNaN(numAns)) return 0;

    const target = slide.correctValue ?? 0;
    const minVal = slide.min ?? 0;
    const maxVal = slide.max ?? 100;
    const range = Math.max(1, maxVal - minVal);

    const errorRatio = Math.abs(numAns - target) / range;
    const scorePct = Math.max(0, 1 - errorRatio * 5);
    // Quarters, so a guess reads as "about three quarters of a right answer".
    return roundToStep(max * scorePct);
  }

  return 0;
}

export function revealAnswer() {
  const room = getRoomState();
  if (room.gamePhase !== "review") {
    room.gamePhase = "review";
  }

  room.isAnswerRevealed = true;
  room.isQuestionLocked = true;

  const currentSlide = room.slides[room.currentSlideIndex];
  if (!currentSlide) return;

  if (currentSlide.type === "scoreboard") {
    resolveBets();
    return;
  }

  Object.values(room.players).forEach((player) => {
    const answer = player.answers[currentSlide.id];
    if (answer === undefined || answer === null) return;

    // A score already on record means this slide was graded — either by an
    // earlier reveal or by the host correcting it. Never overwrite that.
    if (player.scoresPerSlide?.[currentSlide.id] !== undefined) return;

    applySlideScore(
      player,
      currentSlide.id,
      calculateAutoScore(currentSlide, answer)
    );
  });
  persist();
}

export function scoreOpenEndedPlayer(
  slideId: number | string,
  playerId: string,
  points: number
) {
  const room = getRoomState();
  const player = room.players[playerId];
  if (!player) return;

  applySlideScore(player, slideId, points);
  persist();
}

/**
 * Replaces the live deck. Slide ids key both player answers and per-slide
 * scores, so the index is clamped to keep /deck and /play from rendering an
 * undefined slide when the deck shrinks.
 */
export function replaceSlides(newSlides: SlideData[]) {
  const room = getRoomState();
  if (room.activeDeckId) saveDeckSlides(room.activeDeckId, newSlides);
  room.slides = buildDeck(newSlides);
  clampSlideIndex();
  persist();
}

/**
 * Reloads the deck from quiz_data.json, keeping players and scores.
 *
 * The room is restored from disk at boot, so a deck edited on the filesystem
 * (a question pulled, a market beat added) would otherwise stay invisible
 * behind the persisted copy until the whole game was reset.
 */
function games(): Record<string, SavedGame> {
  if (!globalRoomStore.games) globalRoomStore.games = {};
  return globalRoomStore.games;
}

export function listAvailableDecks() {
  ensureSeeded();
  return listDecks();
}

/**
 * Puts a different deck on the projector.
 *
 * The current game is parked under its own deck id and the target's is brought
 * back, so switching is never destructive: a warm-up round can be left
 * half-played, the main quiz run, and the warm-up resumed on the same slide
 * with the same scores. The roster carries across — nobody rejoins because the
 * host changed deck — and anyone who has not played the target deck starts it
 * at zero.
 */
export function switchDeck(deckId: string): boolean {
  const room = getRoomState();
  const target = loadDeck(deckId);
  if (!target) return false;
  if (room.activeDeckId === deckId) return true;

  if (room.activeDeckId) {
    games()[room.activeDeckId] = parkGame(room);
  }

  const next = restoreGame(games()[deckId], room.players);
  room.activeDeckId = deckId;
  room.slides = buildDeck(target.slides);
  room.currentSlideIndex = next.currentSlideIndex;
  room.gamePhase = next.gamePhase;
  room.isAnswerRevealed = next.isAnswerRevealed;
  room.isQuestionLocked = next.isQuestionLocked;
  room.isOfflineMode = next.isOfflineMode;
  room.areBetsClosed = next.areBetsClosed;
  room.areBetsResolved = next.areBetsResolved;
  room.players = next.players;
  clampSlideIndex();
  persist();
  return true;
}

export function reloadDeck() {
  const room = getRoomState();
  const active = room.activeDeckId ? loadDeck(room.activeDeckId) : null;
  room.slides = buildDeck((active?.slides ?? (quizData as SlideData[])) as SlideData[]);
  clampSlideIndex();
  room.isAnswerRevealed = false;
  persist();
}

export function toggleOfflineMode(enabled?: boolean) {
  const room = getRoomState();
  if (enabled !== undefined) {
    room.isOfflineMode = enabled;
  } else {
    room.isOfflineMode = !room.isOfflineMode;
  }
  persist();
}

export function resetGame() {
  const room = getRoomState();
  room.currentSlideIndex = 0;
  room.gamePhase = "answering";
  room.isAnswerRevealed = false;
  room.isQuestionLocked = false;
  room.isOfflineMode = false;
  room.areBetsClosed = false;
  room.areBetsResolved = false;
  room.players = {};
  // Player tokens are meaningless once the roster is cleared
  globalRoomStore.playerTokens = {};
  persist();
}
