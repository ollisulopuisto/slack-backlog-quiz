import { describe, expect, it } from "vitest";

import { mergeIntoDeck } from "./slideIds";
import { SlideData } from "./types";

const q = (id: number | string, question: string): SlideData => ({
  id,
  type: "multiple_choice",
  question,
});

describe("mergeIntoDeck", () => {
  it("never changes the id of a slide already in the deck", () => {
    const deck = [q(1, "eka"), q(4, "toka"), q(6, "kolmas")];
    const merged = mergeIntoDeck(deck, [q("bank_9", "uusi")]);
    expect(merged.slice(0, 3).map((s) => s.id)).toEqual([1, 4, 6]);
  });

  it("appends the new questions after the existing ones", () => {
    const merged = mergeIntoDeck([q(1, "eka")], [q("bank_9", "uusi")]);
    expect(merged.map((s) => s.question)).toEqual(["eka", "uusi"]);
  });

  it("keeps a bank question's own id when it doesn't clash", () => {
    const merged = mergeIntoDeck([q(1, "eka")], [q("bank_9", "uusi")]);
    expect(merged[1].id).toBe("bank_9");
  });

  it("gives a clashing id a fresh one rather than overwriting", () => {
    const merged = mergeIntoDeck([q(1, "eka")], [q(1, "toinen ykkönen")]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe(1);
    expect(merged[1].id).not.toBe(1);
    expect(new Set(merged.map((s) => s.id)).size).toBe(2);
  });

  it("does not add the same question twice", () => {
    const deck = [q(1, "eka"), q("bank_9", "uusi")];
    const merged = mergeIntoDeck(deck, [q("bank_9", "uusi")]);
    expect(merged).toHaveLength(2);
  });

  it("leaves every id unique", () => {
    const merged = mergeIntoDeck(
      [q(1, "a"), q(2, "b")],
      [q(2, "c"), q(2, "d"), q("x", "e")]
    );
    expect(new Set(merged.map((s) => s.id)).size).toBe(merged.length);
  });
});
