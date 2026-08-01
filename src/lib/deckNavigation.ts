import { RoomState, SlideData } from "./types";

/**
 * Slide types that hold something the host reveals rather than just shows.
 * A lobby slide has no answer and no score, so pausing on it would cost the
 * presenter a keystroke for nothing.
 */
const REVEALABLE_TYPES: ReadonlySet<SlideData["type"]> = new Set([
  "multiple_choice",
  "connect_pairs",
  "open_ended",
  "prediction_market",
  "slider",
  "scoreboard",
]);

/**
 * What the "forward" control should do next.
 *
 * During review, going forward is two presses on the same key: the first
 * reveals the answer, the second moves on. That keeps the whole presentation
 * on the right arrow (or a clicker) instead of asking the host to find a
 * separate reveal button between every slide.
 */
export function advanceAction(
  room: Pick<RoomState, "gamePhase" | "isAnswerRevealed">,
  slide: SlideData | undefined
): "reveal" | "next" {
  if (room.gamePhase !== "review") return "next";
  if (room.isAnswerRevealed) return "next";
  if (!slide || !REVEALABLE_TYPES.has(slide.type)) return "next";
  return "reveal";
}
