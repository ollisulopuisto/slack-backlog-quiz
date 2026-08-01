import { SlideData } from "./types";

/**
 * One point means one right answer.
 *
 * The whole scale is built so a final score reads as "how many did I get
 * right": a multiple choice is worth 1, a four-way pairing is worth 1 split
 * four ways (0,25 per correct pair), and a slider is 1 scaled by how close the
 * guess landed. Open questions are the deliberate exception at up to 3, since
 * they ask for real recall rather than a pick from four.
 */
export const DEFAULT_POINTS: Record<string, number> = {
  multiple_choice: 1,
  connect_pairs: 1,
  slider: 1,
  open_ended: 3,
  prediction_market: 1,
};

/** A correct market call is worth two right answers — see CHANGELOG. */
export const BET_POINTS = 2;

/** Slider credit lands on quarters so a tally stays readable. */
export const SCORE_STEP = 0.25;

export function slideMaxPoints(slide: SlideData): number {
  return slide.points ?? DEFAULT_POINTS[slide.type] ?? 0;
}

/**
 * Kills binary-fraction noise. Quarters are exact in floating point but a
 * three-way pairing (1/3 each) is not, and those errors would accumulate
 * across a whole deck into a score like 6,999999999999999.
 */
export function roundScore(points: number): number {
  return Math.round(points * 100) / 100;
}

export function roundToStep(points: number, step = SCORE_STEP): number {
  return roundScore(Math.round(points / step) * step);
}

/**
 * Finnish decimal comma, and no trailing ",00" on a whole number — a
 * scoreboard full of "7,00" is harder to scan than one full of "7".
 */
export function formatScore(points: number): string {
  const rounded = roundScore(points);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, "").replace(".", ",");
}
