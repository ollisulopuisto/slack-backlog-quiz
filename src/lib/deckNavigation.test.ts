import { describe, expect, it } from "vitest";

import { advanceAction } from "./deckNavigation";
import { RoomState, SlideData } from "./types";

function slide(type: SlideData["type"]): SlideData {
  return { id: 1, type };
}

function room(overrides: Partial<RoomState>): RoomState {
  return {
    code: "TEST",
    currentSlideIndex: 0,
    gamePhase: "answering",
    isAnswerRevealed: false,
    isQuestionLocked: false,
    players: {},
    slides: [],
    ...overrides,
  };
}

describe("advanceAction", () => {
  it("always advances during the answering phase", () => {
    expect(
      advanceAction(
        room({ gamePhase: "answering" }),
        slide("multiple_choice")
      )
    ).toBe("next");
  });

  it("reveals the answer on the first press in the review phase", () => {
    expect(
      advanceAction(
        room({ gamePhase: "review", isAnswerRevealed: false }),
        slide("multiple_choice")
      )
    ).toBe("reveal");
  });

  it("advances on the second press, once the answer is out", () => {
    expect(
      advanceAction(
        room({ gamePhase: "review", isAnswerRevealed: true }),
        slide("multiple_choice")
      )
    ).toBe("next");
  });

  it("reveals every scorable slide type", () => {
    const scorable: SlideData["type"][] = [
      "multiple_choice",
      "connect_pairs",
      "open_ended",
      "prediction_market",
      "slider",
      "scoreboard",
    ];
    for (const type of scorable) {
      expect(advanceAction(room({ gamePhase: "review" }), slide(type))).toBe(
        "reveal"
      );
    }
  });

  it("skips the reveal step on a lobby slide, which has nothing to show", () => {
    expect(
      advanceAction(room({ gamePhase: "review" }), slide("lobby"))
    ).toBe("next");
  });

  it("advances when the deck has outrun its slide", () => {
    expect(advanceAction(room({ gamePhase: "review" }), undefined)).toBe(
      "next"
    );
  });
});
