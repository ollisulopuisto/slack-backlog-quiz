import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { SavedGame } from "./decks";
import { RoomState } from "./types";

/**
 * Crash/restart survival for the live room.
 *
 * The room lives in a module global, which is fine for a single long-running
 * `next start` process but evaporates on any restart — mid-event that would
 * mean every player, answer and score gone. This module mirrors it to disk on
 * every mutation and restores it at boot.
 *
 * Deliberately file-based rather than a database: the app is designed to run
 * on one laptop in one room. It is NOT compatible with serverless hosting
 * (Vercel), where each invocation may get a different, read-only instance.
 */

/**
 * Where the live room is mirrored — `data/` next to the app, except under
 * test.
 *
 * store.test.ts exercises the real store: it joins players, replaces the deck,
 * awards points. Every one of those mutations persists, so with a single fixed
 * path a test run wrote itself into whatever game was on the projector — a
 * player named Tuomas holding 2 points, and the room left on the one-slide
 * deck the last assertion had built. A test run must never be able to reach
 * the evening's state, so it gets its own directory in the system temp.
 *
 * `BACKLOGVISA_STATE_DIR` overrides both, for running two rooms off one
 * checkout.
 */
export function stateDir(): string {
  const override = process.env.BACKLOGVISA_STATE_DIR;
  if (override) return path.resolve(override);
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return path.join(os.tmpdir(), "backlogvisa-test-state");
  }
  return path.join(process.cwd(), "data");
}

const DATA_DIR = stateDir();
const STATE_FILE = path.join(DATA_DIR, "room-state.json");

const STATE_VERSION = 2;

/**
 * `next build` evaluates this module in several prerender workers at once.
 * Writing from there is pointless (there is no live game) and races between
 * workers, so persistence is a no-op during a build.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export interface PersistedState {
  version: number;
  savedAt: string;
  hostKey: string;
  /** playerId -> secret, kept out of RoomState so GET /api/room can't leak it */
  playerTokens: Record<string, string>;
  room: RoomState;
  /** deckId -> the game parked on it, so switching decks loses nothing. */
  games?: Record<string, SavedGame>;
}

export function generateSecret(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function loadPersistedState(): PersistedState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));

    // A version 1 file predates multiple decks. It holds a real game, quite
    // possibly one in progress, so it is migrated rather than discarded: the
    // room it describes becomes the game parked on the seeded deck.
    if (parsed && parsed.version === 1 && parsed.room) {
      parsed.version = STATE_VERSION;
      parsed.games = {};
      parsed.room.activeDeckId = parsed.room.activeDeckId ?? "backlog-visa";
    }

    if (
      !parsed ||
      parsed.version !== STATE_VERSION ||
      !parsed.room ||
      !Array.isArray(parsed.room.slides) ||
      typeof parsed.room.players !== "object"
    ) {
      console.warn(
        "[backlogvisa] Tallennettu pelitila on vanhentunut tai vioittunut — aloitetaan puhtaalta pöydältä."
      );
      return null;
    }

    return parsed as PersistedState;
  } catch (e) {
    console.error("[backlogvisa] Pelitilan lataus epäonnistui:", e);
    return null;
  }
}

/**
 * Writes via a temp file + rename so a crash mid-write can't leave a truncated
 * state file behind.
 */
export function savePersistedState(state: PersistedState): void {
  if (isBuildPhase()) return;

  // Unique per write: a shared temp path lets one writer rename another's
  // half-written file out from under it.
  const tempFile = path.join(
    DATA_DIR,
    `room-state.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`
  );

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), "utf-8");
    fs.renameSync(tempFile, STATE_FILE);
  } catch (e) {
    // Never let a disk problem take down a live game
    console.error("[backlogvisa] Pelitilan tallennus epäonnistui:", e);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      /* best effort */
    }
  }
}

export function getStateFilePath(): string {
  return STATE_FILE;
}

export function isBuildTime(): boolean {
  return isBuildPhase();
}
