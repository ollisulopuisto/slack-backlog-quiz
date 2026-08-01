import { describe, expect, it } from "vitest";

import { auditDeck } from "./deckAudit";
import { SlideData } from "./types";

const mc = (
  id: string | number,
  question: string,
  options: string[],
  correctAnswer: number,
  explanation = ""
): SlideData => ({
  id,
  type: "multiple_choice",
  question,
  options,
  correctAnswer,
  explanation,
});

describe("auditDeck", () => {
  it("passes a clean deck", () => {
    expect(
      auditDeck([
        mc(1, "Kuka?", ["a", "b"], 0),
        mc(2, "Mikä?", ["c", "d"], 1),
      ])
    ).toEqual([]);
  });

  it("flags the same question asked twice", () => {
    const findings = auditDeck([
      mc(1, "Kuka voittaa?", ["a", "b"], 0),
      mc(2, "  kuka VOITTAA? ", ["c", "d"], 1),
    ]);
    expect(findings.map((f) => f.kind)).toContain("duplicate-question");
    expect(findings[0].slideIds).toEqual([1, 2]);
  });

  it("flags two questions with the same right answer", () => {
    const findings = auditDeck([
      mc(1, "Missä tämä kuva on?", ["#random", "#general"], 0),
      mc(2, "Mikä on toiseksi aktiivisin?", ["#random", "#linkit"], 0),
    ]);
    expect(findings.map((f) => f.kind)).toContain("duplicate-answer");
  });

  it("flags an explanation that gives away a later slider", () => {
    const findings = auditDeck([
      mc(1, "Mikä emoji?", ["dart", "joy"], 0, "dart on annettu 77 034 kertaa"),
      {
        id: 2,
        type: "slider",
        question: "Montako kertaa dart on annettu?",
        min: 0,
        max: 200000,
        correctValue: 77034,
      },
    ]);
    const spoiler = findings.find((f) => f.kind === "spoiler");
    expect(spoiler).toBeDefined();
    expect(spoiler!.slideIds).toEqual([1, 2]);
  });

  it("does not flag a spoiler that comes after the question it would spoil", () => {
    const findings = auditDeck([
      {
        id: 1,
        type: "slider",
        question: "Montako?",
        min: 0,
        max: 200000,
        correctValue: 77034,
      },
      mc(2, "Mikä emoji?", ["dart", "joy"], 0, "dart: 77 034 kertaa"),
    ]);
    expect(findings.filter((f) => f.kind === "spoiler")).toEqual([]);
  });

  it("reads Finnish thousands spacing as one number", () => {
    const findings = auditDeck([
      mc(1, "Mikä?", ["a", "b"], 0, "yhteensä 1 104 756 viestiä"),
      {
        id: 2,
        type: "slider",
        question: "Montako viestiä?",
        min: 0,
        max: 2000000,
        correctValue: 1104756,
      },
    ]);
    expect(findings.some((f) => f.kind === "spoiler")).toBe(true);
  });

  it("ignores small numbers, which collide by coincidence", () => {
    const findings = auditDeck([
      mc(1, "Mikä?", ["a", "b"], 0, "vuonna 2021 tapahtui paljon"),
      {
        id: 2,
        type: "slider",
        question: "Montako?",
        min: 0,
        max: 5000,
        correctValue: 2021,
      },
    ]);
    expect(findings.filter((f) => f.kind === "spoiler")).toEqual([]);
  });

  it("flags the same picture used twice", () => {
    const findings = auditDeck([
      { ...mc(1, "Missä?", ["a", "b"], 0), imageUrl: "/quiz_images/q001.jpg" },
      { ...mc(2, "Kuka?", ["c", "d"], 0), imageUrl: "/quiz_images/q001.jpg" },
    ]);
    expect(findings.map((f) => f.kind)).toContain("duplicate-image");
  });

  it("ignores generated slides, which are not questions", () => {
    const findings = auditDeck([
      { id: "bet_1", type: "bet_market", title: "Ennustusmarkkina" },
      { id: "bet_2", type: "bet_market", title: "Ennustusmarkkina" },
      { id: "stat_1", type: "stat_chart", chartId: "chart_hours" },
      { id: "stat_2", type: "stat_chart", chartId: "chart_hours" },
    ]);
    expect(findings).toEqual([]);
  });
});
