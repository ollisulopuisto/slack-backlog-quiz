import { Player, RoomState, SlideData } from "./types";

/**
 * Several decks off one room.
 *
 * A deck is a named list of questions on disk; the room plays one at a time.
 * Each deck keeps its own game — its own scoreboard, its own position, its own
 * phase — so a warm-up round can be parked, the main quiz played, and the
 * warm-up brought back with every point intact.
 *
 * The roster is deliberately NOT per deck. People join the evening once, from
 * a QR code, and asking ten of them to rejoin because the host changed deck
 * would be the worst moment of the night. A player who exists in the room but
 * has never played this deck arrives on it with a clean slate.
 */

export interface DeckMeta {
  id: string;
  name: string;
  questionCount: number;
  updatedAt: string;
}

export interface StoredDeck extends DeckMeta {
  slides: SlideData[];
}

/** Everything about a game except which questions it is being played on. */
export interface SavedGame {
  currentSlideIndex: number;
  gamePhase: "answering" | "review";
  isAnswerRevealed: boolean;
  isQuestionLocked: boolean;
  isOfflineMode?: boolean;
  areBetsClosed?: boolean;
  areBetsResolved?: boolean;
  players: Record<string, Player>;
}

const SLUG_MAX = 40;

/**
 * A readable, stable id for a deck name.
 *
 * Readable because it becomes a filename the host may well go looking for, and
 * ä/ö fold rather than vanish so "Lämmittelykierros" doesn't become
 * "lmmittelykierros".
 */
export function deckIdFor(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/å/g, "a")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, SLUG_MAX) || `pakka-${taken.length + 1}`;

  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** A deep copy, so a parked game can't be mutated by the room it came from. */
export function parkGame(room: RoomState): SavedGame {
  return JSON.parse(
    JSON.stringify({
      currentSlideIndex: room.currentSlideIndex,
      gamePhase: room.gamePhase,
      isAnswerRevealed: room.isAnswerRevealed,
      isQuestionLocked: room.isQuestionLocked,
      isOfflineMode: room.isOfflineMode,
      areBetsClosed: room.areBetsClosed,
      areBetsResolved: room.areBetsResolved,
      players: room.players,
    })
  );
}

function freshEntry(p: Player): Player {
  return {
    id: p.id,
    name: p.name,
    joinedAt: p.joinedAt,
    score: 0,
    answers: {},
    scoresPerSlide: {},
  };
}

/**
 * The game to put on the room when a deck becomes active.
 *
 * `roster` is everyone currently in the room. Anyone the parked game has never
 * seen joins this deck at zero; anyone it has seen keeps exactly what they had
 * on it.
 */
export function restoreGame(
  saved: SavedGame | undefined,
  roster: Record<string, Player>
): SavedGame {
  const copy: SavedGame = saved
    ? JSON.parse(JSON.stringify(saved))
    : {
        currentSlideIndex: 0,
        gamePhase: "answering",
        isAnswerRevealed: false,
        isQuestionLocked: false,
        isOfflineMode: false,
        areBetsClosed: false,
        areBetsResolved: false,
        players: {},
      };

  for (const [id, p] of Object.entries(roster)) {
    if (!copy.players[id]) copy.players[id] = freshEntry(p);
  }
  return copy;
}

export function deckMeta(deck: StoredDeck): DeckMeta {
  return {
    id: deck.id,
    name: deck.name,
    questionCount: deck.questionCount,
    updatedAt: deck.updatedAt,
  };
}
