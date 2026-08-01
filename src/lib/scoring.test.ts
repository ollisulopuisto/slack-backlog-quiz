import { describe, expect, it } from "vitest";

import {
  DEFAULT_POINTS,
  formatScore,
  roundScore,
  roundToStep,
  slideMaxPoints,
} from "./scoring";
import { SlideData } from "./types";

describe("the 1 point = 1 right answer scale", () => {
  it("is worth 1 for a pick-one question and 3 for an open one", () => {
    expect(DEFAULT_POINTS.multiple_choice).toBe(1);
    expect(DEFAULT_POINTS.connect_pairs).toBe(1);
    expect(DEFAULT_POINTS.slider).toBe(1);
    expect(DEFAULT_POINTS.open_ended).toBe(3);
  });

  it("lets a slide override the default", () => {
    const slide: SlideData = { id: 1, type: "multiple_choice", points: 2 };
    expect(slideMaxPoints(slide)).toBe(2);
  });

  it("falls back to the type default", () => {
    expect(slideMaxPoints({ id: 1, type: "open_ended" })).toBe(3);
  });

  it("scores a lobby slide at zero", () => {
    expect(slideMaxPoints({ id: 1, type: "lobby" })).toBe(0);
  });
});

describe("roundScore", () => {
  it("keeps quarters exact", () => {
    expect(roundScore(0.25 * 3)).toBe(0.75);
  });

  it("cleans up a thirds-based pairing", () => {
    expect(roundScore(1 / 3)).toBe(0.33);
    expect(roundScore((1 / 3) * 3)).toBe(1);
  });
});

describe("roundToStep", () => {
  it("snaps to the nearest quarter", () => {
    expect(roundToStep(0.6)).toBe(0.5);
    expect(roundToStep(0.9)).toBe(1);
    expect(roundToStep(0.13)).toBe(0.25);
    expect(roundToStep(0.1)).toBe(0);
  });
});

describe("formatScore", () => {
  it("writes a whole number without decimals", () => {
    expect(formatScore(7)).toBe("7");
    expect(formatScore(0)).toBe("0");
  });

  it("uses the Finnish decimal comma", () => {
    expect(formatScore(4.25)).toBe("4,25");
    expect(formatScore(0.5)).toBe("0,5");
  });

  it("doesn't leave a trailing zero", () => {
    expect(formatScore(2.5)).toBe("2,5");
    expect(formatScore(6.75)).toBe("6,75");
  });
});
