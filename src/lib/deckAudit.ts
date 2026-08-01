import { SlideData } from "./types";

/**
 * Finds questions that repeat each other, or give each other away.
 *
 * The repeats are the obvious half: the same question twice, the same picture
 * twice, two questions whose right answer is the same channel.
 *
 * The half that actually bites is the spoiler. A question's explanation is on
 * the projector for as long as the host talks over it, so a number quoted
 * there is simply the answer to any later question that asks for it. That
 * happened twice in this deck: the reaction leaderboard explains that 3kk
 * lämmitetty luumu has given 70 684 reactions, and a slider later asks exactly
 * that.
 *
 * Order matters — a spoiler only spoils forwards, so the same pair in the
 * other order is fine and isn't reported.
 */

export type FindingKind =
  | "duplicate-question"
  | "duplicate-answer"
  | "duplicate-image"
  | "duplicate-source"
  | "spoiler";

export interface DeckFinding {
  kind: FindingKind;
  slideIds: (string | number)[];
  detail: string;
}

/** Below this a match is a coincidence: years, counts, points. */
const MIN_SPOILER_VALUE = 5000;

const GENERATED = new Set([
  "wifi",
  "bet_market",
  "stat_chart",
  "quote_card",
  "intro",
  "lobby",
  "scoreboard",
]);

function normalise(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Every number in a string, reading Finnish thousands spacing as one value. */
function numbersIn(text: string | undefined): Set<number> {
  const out = new Set<number>();
  for (const m of (text ?? "").matchAll(/\d+(?:[  ]\d{3})*/g)) {
    const value = Number(m[0].replace(/[  ]/g, ""));
    if (Number.isFinite(value)) out.add(value);
  }
  return out;
}

function correctAnswerOf(slide: SlideData): string | null {
  if (slide.type === "multiple_choice" && slide.options && slide.correctAnswer !== undefined) {
    return slide.options[slide.correctAnswer] ?? null;
  }
  if (slide.type === "open_ended") return slide.correctAnswerText ?? null;
  return null;
}

function groupDuplicates(
  questions: SlideData[],
  keyOf: (s: SlideData) => string | null | undefined,
  kind: FindingKind,
  describe: (key: string, count: number) => string
): DeckFinding[] {
  const groups = new Map<string, SlideData[]>();
  for (const q of questions) {
    const key = keyOf(q);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      kind,
      slideIds: group.map((q) => q.id),
      detail: describe(key, group.length),
    }));
}

export function auditDeck(slides: SlideData[]): DeckFinding[] {
  const questions = slides.filter((s) => !GENERATED.has(s.type));
  const findings: DeckFinding[] = [];

  findings.push(
    ...groupDuplicates(
      questions,
      (q) => normalise(q.question) || null,
      "duplicate-question",
      (_key, n) => `Sama kysymys ${n} kertaa.`
    )
  );

  findings.push(
    ...groupDuplicates(
      questions,
      (q) => {
        const answer = correctAnswerOf(q);
        return answer ? normalise(answer) : null;
      },
      "duplicate-answer",
      (key, n) => `${n} kysymyksellä sama oikea vastaus (”${key}”).`
    )
  );

  findings.push(
    ...groupDuplicates(
      questions,
      (q) => q.imageUrl ?? null,
      "duplicate-image",
      (key, n) => `Sama kuva ${n} kysymyksessä (${key}).`
    )
  );

  findings.push(
    ...groupDuplicates(
      questions,
      (q) => q.source?.ts ?? null,
      "duplicate-source",
      (_key, n) => `${n} kysymystä nojaa samaan viestiin.`
    )
  );

  // A number stated earlier is the answer to a question asked later.
  questions.forEach((later, laterIndex) => {
    const wanted =
      later.type === "slider" && later.correctValue !== undefined
        ? later.correctValue
        : null;
    if (wanted === null || wanted < MIN_SPOILER_VALUE) return;

    for (let i = 0; i < laterIndex; i++) {
      const earlier = questions[i];
      const shown = new Set([
        ...numbersIn(earlier.explanation),
        ...numbersIn(earlier.question),
        ...(earlier.options ?? []).flatMap((o) => [...numbersIn(o)]),
      ]);
      if (shown.has(wanted)) {
        findings.push({
          kind: "spoiler",
          slideIds: [earlier.id, later.id],
          detail: `Luku ${wanted.toLocaleString("fi-FI")} näytetään aiemmin ja kysytään myöhemmin.`,
        });
        break;
      }
    }
  });

  return findings;
}

export const FINDING_LABELS: Record<FindingKind, string> = {
  "duplicate-question": "Sama kysymys",
  "duplicate-answer": "Sama vastaus",
  "duplicate-image": "Sama kuva",
  "duplicate-source": "Sama lähdeviesti",
  spoiler: "Paljastaa vastauksen",
};
