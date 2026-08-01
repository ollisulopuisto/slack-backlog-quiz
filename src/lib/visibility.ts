import { RoomState, SlideData } from "./types";

/**
 * Strips answer-revealing fields before the room state goes out to a player's
 * phone.
 *
 * `GET /api/room` returns the whole deck, and `/play` polls it every second —
 * which means every correct answer, market resolution and explanation was
 * sitting in a JSON response any player could open in their phone's browser.
 * That defeats the entire point of the two-phase "answers stay hidden during
 * the answering phase" design.
 *
 * The host (`/deck`, `/summary`, `/editor`) authenticates and gets the full
 * state; everyone else sees answers only for the slide that has actually been
 * revealed.
 */

const ANSWER_FIELDS = [
  "correctAnswer",
  "resolvedOutcome",
  "correctAnswerText",
  "correctValue",
  "explanation",
  "sampleAnswers",
  // The surrounding conversation contains the answer in plain sight.
  "source",
  "sourceChannel",
  "sourceTs",
  // The emoji names ARE the answer; the pictures go up on the projector.
  "emojiQuiz",
] as const;

/**
 * Stable pseudo-random ordering seeded by the slide id, so the option list
 * doesn't reshuffle under the player's finger on every 1s poll.
 */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hideSlideAnswers(slide: SlideData): SlideData {
  const safe: SlideData = { ...slide };
  for (const field of ANSWER_FIELDS) {
    delete safe[field];
  }

  if (slide.type === "connect_pairs" && slide.pairs) {
    // The pairing IS the answer, and it's implicit in the array order. Send the
    // prompts with their matches blanked, plus a shuffled option list for the
    // player to choose from.
    safe.pairs = slide.pairs.map((p) => ({ left: p.left, right: "" }));
    safe.pairOptions = seededShuffle(
      slide.pairs.map((p) => p.right),
      String(slide.id)
    );
  }

  return safe;
}

export function sanitizeRoomForPlayer(room: RoomState): RoomState {
  return {
    ...room,
    slides: room.slides.map((slide, index) => {
      const isRevealedCurrentSlide =
        index === room.currentSlideIndex && room.isAnswerRevealed;
      return isRevealedCurrentSlide ? slide : hideSlideAnswers(slide);
    }),
  };
}

export function sanitizeSlidesForPlayer(room: RoomState): SlideData[] {
  return sanitizeRoomForPlayer(room).slides;
}
