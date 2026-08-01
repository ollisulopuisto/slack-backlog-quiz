import { describe, expect, it } from "vitest";

import { withBetMarketSlides } from "./deckBuilder";
import { SlideData } from "./types";

function deck(questionCount: number): SlideData[] {
  const slides: SlideData[] = [{ id: "lobby", type: "lobby" }];
  for (let i = 1; i <= questionCount; i++) {
    slides.push({ id: i, type: "multiple_choice" });
  }
  slides.push({ id: "board", type: "scoreboard" });
  return slides;
}

/** Market screens as question boundaries: 0 = before Q1, k = after Qk. */
function boundaries(built: SlideData[]): number[] {
  const out: number[] = [];
  let seen = 0;
  for (const s of built) {
    if (s.type === "bet_market") out.push(seen);
    else if (
      s.type !== "lobby" &&
      s.type !== "scoreboard" &&
      s.type !== "intro"
    ) {
      seen++;
    }
  }
  return out;
}

describe("withBetMarketSlides", () => {
  it("opens the market before the first question and closes it after the last", () => {
    const b = boundaries(withBetMarketSlides(deck(15)));
    expect(b[0]).toBe(0);
    expect(b[b.length - 1]).toBe(15);
  });

  it("shows the market four times over a full deck", () => {
    expect(boundaries(withBetMarketSlides(deck(15)))).toHaveLength(4);
    expect(boundaries(withBetMarketSlides(deck(21)))).toHaveLength(4);
    expect(boundaries(withBetMarketSlides(deck(7)))).toHaveLength(4);
  });

  it("spaces the two middle screens evenly through the questions", () => {
    expect(boundaries(withBetMarketSlides(deck(15)))).toEqual([0, 5, 10, 15]);
    expect(boundaries(withBetMarketSlides(deck(12)))).toEqual([0, 4, 8, 12]);
    expect(boundaries(withBetMarketSlides(deck(21)))).toEqual([0, 7, 14, 21]);
  });

  it("keeps the gaps even when the count doesn't divide by three", () => {
    expect(boundaries(withBetMarketSlides(deck(10)))).toEqual([0, 3, 7, 10]);
  });

  it("drops duplicate slots rather than stacking two market screens", () => {
    // Two questions cannot support four distinct boundaries.
    const b = boundaries(withBetMarketSlides(deck(2)));
    expect(new Set(b).size).toBe(b.length);
    expect(b[0]).toBe(0);
    expect(b[b.length - 1]).toBe(2);
  });

  it("leaves a deck with no questions alone", () => {
    const bare: SlideData[] = [{ id: 1, type: "lobby" }];
    expect(withBetMarketSlides(bare)).toEqual(bare);
  });

  it("never puts a market screen after the scoreboard", () => {
    const built = withBetMarketSlides(deck(15));
    expect(built[built.length - 1].type).toBe("scoreboard");
  });

  it("gives every market screen a unique id", () => {
    const ids = withBetMarketSlides(deck(15)).map((s) => String(s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is idempotent, so rebuilding a built deck doesn't double up", () => {
    const once = withBetMarketSlides(deck(15));
    expect(withBetMarketSlides(once)).toEqual(once);
  });

  it("leaves the wifi screen first and counts it as no question", () => {
    const opening: SlideData[] = [
      { id: "wifi", type: "wifi" },
      ...deck(15),
    ];
    const built = withBetMarketSlides(opening);

    expect(built[0].type).toBe("wifi");
    // Second is the lobby, third the opening market: nothing may push in
    // front of the screen people scan before they can join at all.
    expect(built[1].type).toBe("lobby");
    expect(built[2].type).toBe("bet_market");
    expect(boundaries(built.filter((s) => s.type !== "wifi"))).toEqual([
      0, 5, 10, 15,
    ]);
  });
});
