import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { getStateFilePath } from "./persistence";

/**
 * The test suite must not play the live game.
 *
 * store.test.ts drives the real store — it joins players, replaces the deck and
 * awards points — and the store mirrors every mutation to disk. With one fixed
 * path that meant `npx vitest run` quietly signed a player called Tuomas into
 * whatever game was running, gave him 2 points on slides s0–s7, and left the
 * room holding the single-slide deck the last test had built.
 */

const LIVE_STATE = path.join(process.cwd(), "data", "room-state.json");

describe("state file location", () => {
  it("does not write to the live game's state file under test", () => {
    expect(getStateFilePath()).not.toBe(LIVE_STATE);
  });

  it("leaves the live state untouched while the suite runs", () => {
    if (!fs.existsSync(LIVE_STATE)) return;
    const before = fs.readFileSync(LIVE_STATE, "utf-8");
    const players = JSON.parse(before).room?.players ?? {};
    expect(
      Object.values(players).some((p) => (p as { name: string }).name === "Tuomas")
    ).toBe(false);
  });
});
