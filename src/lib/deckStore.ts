import fs from "fs";
import path from "path";

import { DeckMeta, StoredDeck, deckIdFor, deckMeta } from "./decks";
import { stateDir } from "./persistence";
import { SlideData } from "./types";
import seedSlides from "./quiz_data.json";

/**
 * Decks on disk, one JSON file each under `data/decks/`.
 *
 * Same reasoning as the room state: this app runs on one laptop in one room,
 * so a directory of files is the right amount of database. Files are named by
 * a readable slug because the host may well go looking for one.
 */

const DEFAULT_DECK_NAME = "Slack Backlog Quiz";

function decksDir(): string {
  return path.join(stateDir(), "decks");
}

function deckPath(id: string): string {
  return path.join(decksDir(), `${id}.json`);
}

/** Rejects anything that could climb out of the decks directory. */
function safeId(id: string): string | null {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? id : null;
}

function readDeck(id: string): StoredDeck | null {
  try {
    const raw = fs.readFileSync(deckPath(id), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.slides)) return null;
    return parsed as StoredDeck;
  } catch {
    return null;
  }
}

function writeDeck(deck: StoredDeck): void {
  fs.mkdirSync(decksDir(), { recursive: true });
  // Temp + rename, so a crash mid-write cannot leave a half-written deck.
  const temp = deckPath(`.${deck.id}.${process.pid}.tmp`);
  fs.writeFileSync(temp, JSON.stringify(deck, null, 2), "utf-8");
  fs.renameSync(temp, deckPath(deck.id));
}

/**
 * The first run has no decks directory, only the quiz_data.json the app has
 * always shipped. Seed one deck from it rather than starting empty, so
 * upgrading never looks like the questions have been lost.
 */
export function ensureSeeded(): void {
  if (listDecks().length > 0) return;
  const slides = seedSlides as SlideData[];
  saveDeck({
    id: "backlog-visa",
    name: DEFAULT_DECK_NAME,
    questionCount: countQuestions(slides),
    updatedAt: new Date().toISOString(),
    slides,
  });
}

const GENERATED = new Set([
  "wifi",
  "lobby",
  "intro",
  "scoreboard",
  "bet_market",
  "stat_chart",
  "quote_card",
]);

export function countQuestions(slides: SlideData[]): number {
  return slides.filter((s) => !GENERATED.has(s.type)).length;
}

export function listDecks(): DeckMeta[] {
  let names: string[];
  try {
    names = fs.readdirSync(decksDir());
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".json") && !n.startsWith("."))
    .map((n) => readDeck(n.replace(/\.json$/, "")))
    .filter((d): d is StoredDeck => d !== null)
    .map(deckMeta)
    .sort((a, b) => a.name.localeCompare(b.name, "fi"));
}

export function loadDeck(id: string): StoredDeck | null {
  const clean = safeId(id);
  return clean ? readDeck(clean) : null;
}

export function saveDeck(deck: StoredDeck): StoredDeck {
  const stored: StoredDeck = {
    ...deck,
    questionCount: countQuestions(deck.slides),
    updatedAt: new Date().toISOString(),
  };
  writeDeck(stored);
  return stored;
}

/** Replaces a deck's questions, keeping its id and name. */
export function saveDeckSlides(id: string, slides: SlideData[]): StoredDeck | null {
  const existing = loadDeck(id);
  if (!existing) return null;
  return saveDeck({ ...existing, slides });
}

export function createDeck(name: string, slides: SlideData[] = []): StoredDeck {
  const id = deckIdFor(name, listDecks().map((d) => d.id));
  return saveDeck({
    id,
    name: name.trim() || "Nimetön pakka",
    questionCount: countQuestions(slides),
    updatedAt: new Date().toISOString(),
    slides,
  });
}

export function duplicateDeck(id: string, name?: string): StoredDeck | null {
  const source = loadDeck(id);
  if (!source) return null;
  return createDeck(name?.trim() || `${source.name} (kopio)`, source.slides);
}

export function renameDeck(id: string, name: string): StoredDeck | null {
  const existing = loadDeck(id);
  if (!existing) return null;
  // The id stays put: it keys the parked game and every saved score.
  return saveDeck({ ...existing, name: name.trim() || existing.name });
}

export function deleteDeck(id: string): boolean {
  const clean = safeId(id);
  if (!clean) return false;
  // Never leave the room with nothing to play.
  if (listDecks().length <= 1) return false;
  try {
    fs.unlinkSync(deckPath(clean));
    return true;
  } catch {
    return false;
  }
}
