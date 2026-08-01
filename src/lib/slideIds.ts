import { SlideData } from "./types";

/**
 * Adds questions to a deck without disturbing the ones already in it.
 *
 * Every stored answer and every per-slide score is keyed by the slide's id
 * (`player.answers[slideId]`, `player.scoresPerSlide[slideId]`), so an id is a
 * permanent handle rather than a position. Renumbering by index — which is
 * what the bank's "add to deck" used to do — silently re-points a running
 * game's answers at whatever question now occupies that number, and the
 * scoreboard is quietly wrong from then on.
 *
 * So: existing ids are never touched, a new question keeps its own id when it
 * doesn't clash, and a clash gets a fresh one.
 */

function freshId(taken: Set<string>): number {
  // Timestamp-based, like the editor's "new slide" button, so two ids minted
  // in the same session cannot collide with each other or with 1, 2, 3…
  let candidate = Date.now();
  while (taken.has(String(candidate))) candidate++;
  return candidate;
}

export function mergeIntoDeck(
  existing: SlideData[],
  additions: SlideData[]
): SlideData[] {
  const taken = new Set(existing.map((s) => String(s.id)));
  const out = [...existing];

  for (const slide of additions) {
    // Already in the deck: adding it twice is never what the host meant.
    if (slide.id !== undefined && taken.has(String(slide.id))) {
      const same = existing.find(
        (s) =>
          String(s.id) === String(slide.id) && s.question === slide.question
      );
      if (same) continue;

      const id = freshId(taken);
      taken.add(String(id));
      out.push({ ...slide, id });
      continue;
    }

    const id = slide.id ?? freshId(taken);
    taken.add(String(id));
    out.push({ ...slide, id });
  }

  return out;
}
