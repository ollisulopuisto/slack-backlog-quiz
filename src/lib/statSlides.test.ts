import { describe, expect, it } from "vitest";

import { withInterstitials } from "./deckBuilder";
import { SlideData } from "./types";

const CHARTS = ["chart_hours", "chart_years", "chart_weekdays"];

function deck(questionCount: number): SlideData[] {
  const slides: SlideData[] = [{ id: "lobby", type: "lobby" }];
  for (let i = 1; i <= questionCount; i++) {
    slides.push({ id: i, type: "multiple_choice" });
  }
  slides.push({ id: "board", type: "scoreboard" });
  return slides;
}

/** Interstitials as question boundaries: 0 = before Q1, k = after Qk. */
function stops(built: SlideData[], type: string): number[] {
  const out: number[] = [];
  let seen = 0;
  for (const s of built) {
    if (s.type === type) out.push(seen);
    else if (
      s.type !== "lobby" &&
      s.type !== "scoreboard" &&
      s.type !== "intro" &&
      s.type !== "bet_market" &&
      s.type !== "stat_chart"
    ) {
      seen++;
    }
  }
  return out;
}

describe("withInterstitials", () => {
  it("keeps the four market screens where they were", () => {
    expect(stops(withInterstitials(deck(15), CHARTS), "bet_market")).toEqual([
      0, 5, 10, 15,
    ]);
  });

  it("puts the stat screens between the market ones, never on top", () => {
    const built = withInterstitials(deck(15), CHARTS);
    const markets = stops(built, "bet_market");
    const charts = stops(built, "stat_chart");
    expect(charts.length).toBeGreaterThan(0);
    for (const c of charts) expect(markets).not.toContain(c);
  });

  it("never places two interstitials back to back", () => {
    const built = withInterstitials(deck(15), CHARTS);
    for (let i = 1; i < built.length; i++) {
      const a = built[i - 1].type;
      const b = built[i].type;
      const interstitial = (t: string) =>
        t === "bet_market" || t === "stat_chart";
      expect(interstitial(a) && interstitial(b)).toBe(false);
    }
  });

  it("gives every generated slide a unique id", () => {
    const ids = withInterstitials(deck(15), CHARTS).map((s) => String(s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is idempotent", () => {
    const once = withInterstitials(deck(15), CHARTS);
    expect(withInterstitials(once, CHARTS)).toEqual(once);
  });

  it("leaves a deck with no questions alone", () => {
    const bare: SlideData[] = [{ id: 1, type: "lobby" }];
    expect(withInterstitials(bare, CHARTS)).toEqual(bare);
  });

  it("skips stat screens on a deck too short to space them out", () => {
    const built = withInterstitials(deck(2), CHARTS);
    expect(stops(built, "stat_chart")).toEqual([]);
  });

  it("ends on the scoreboard", () => {
    const built = withInterstitials(deck(15), CHARTS);
    expect(built[built.length - 1].type).toBe("scoreboard");
  });
});
