import { beforeEach, describe, expect, it } from "vitest";

import { BET_POINTS } from "./scoring";
import {
  endReviewPhase,
  getRoomState,
  joinPlayer,
  nextSlide,
  placeBet,
  resetGame,
  resolveBets,
  revealAnswer,
  scoreOpenEndedPlayer,
  startReviewPhase,
} from "./store";
import { SlideData } from "./types";

describe("game phase toggle", () => {
  beforeEach(() => {
    resetGame();
  });

  it("starts in the answering phase", () => {
    expect(getRoomState().gamePhase).toBe("answering");
  });

  it("locks the question and jumps to the first question when review starts", () => {
    startReviewPhase();
    const room = getRoomState();
    expect(room.gamePhase).toBe("review");
    expect(room.isQuestionLocked).toBe(true);
    expect(room.slides[room.currentSlideIndex].type).not.toBe("lobby");
  });

  it("returns to the answering phase and reopens the question", () => {
    startReviewPhase();
    revealAnswer();
    endReviewPhase();

    const room = getRoomState();
    expect(room.gamePhase).toBe("answering");
    expect(room.isQuestionLocked).toBe(false);
    expect(room.isAnswerRevealed).toBe(false);
  });

  it("stays on the current slide when leaving review", () => {
    startReviewPhase();
    const indexDuringReview = getRoomState().currentSlideIndex;
    endReviewPhase();
    expect(getRoomState().currentSlideIndex).toBe(indexDuringReview);
  });

  it("keeps awarded points when the host toggles back and forth", () => {
    const join = joinPlayer("Testaaja");
    expect(join.playerId).toBeTruthy();

    startReviewPhase();
    const room = getRoomState();
    const slide = room.slides[room.currentSlideIndex];
    room.players[join.playerId!].answers[slide.id] = slide.correctAnswer ?? 0;

    revealAnswer();
    const scoreAfterReveal = getRoomState().players[join.playerId!].score;

    endReviewPhase();
    startReviewPhase();
    revealAnswer();

    expect(getRoomState().players[join.playerId!].score).toBe(scoreAfterReveal);
  });
});

describe("prediction market", () => {
  beforeEach(() => {
    resetGame();
  });

  function joinTwo() {
    const a = joinPlayer("Ada").playerId!;
    const b = joinPlayer("Bo").playerId!;
    return { a, b };
  }

  it("accepts a bet and lets the player change it", () => {
    const { a, b } = joinTwo();
    expect(placeBet(a, "best_player", a)).toBe(true);
    expect(getRoomState().players[a].bets?.best_player).toBe(a);

    expect(placeBet(a, "best_player", b)).toBe(true);
    expect(getRoomState().players[a].bets?.best_player).toBe(b);
  });

  it("rejects a bet on a player who isn't in the room", () => {
    const { a } = joinTwo();
    expect(placeBet(a, "best_player", "player_nope")).toBe(false);
  });

  it("rejects an unknown market", () => {
    const { a } = joinTwo();
    expect(placeBet(a, "kuka_maksaa_kaljat", a)).toBe(false);
  });

  it("keeps the market open for the whole answering phase", () => {
    const { a, b } = joinTwo();
    nextSlide();
    nextSlide();
    expect(getRoomState().areBetsClosed).toBeFalsy();
    expect(placeBet(a, "best_player", b)).toBe(true);
  });

  it("closes the market when review starts, and never reopens it", () => {
    const { a, b } = joinTwo();
    startReviewPhase();
    expect(getRoomState().areBetsClosed).toBe(true);
    expect(placeBet(a, "best_player", b)).toBe(false);

    endReviewPhase();
    expect(getRoomState().areBetsClosed).toBe(true);
    expect(placeBet(a, "best_player", b)).toBe(false);
  });

  it("pays out from the scores as they stood before the payout", () => {
    const { a, b } = joinTwo();
    const room = getRoomState();
    room.players[a].score = 1000;
    room.players[b].score = 100;
    // Bo backs the actual leader; Ada backs herself for last place and misses.
    placeBet(b, "best_player", a);
    placeBet(a, "worst_player", a);

    resolveBets();

    // Bo's winnings must not retroactively make Bo the winner of the market.
    expect(getRoomState().players[b].score).toBe(100 + BET_POINTS);
    expect(getRoomState().players[a].score).toBe(1000);
  });

  it("settles only once, however many times the scoreboard is revealed", () => {
    const { a, b } = joinTwo();
    getRoomState().players[a].score = 500;
    placeBet(b, "best_player", a);

    resolveBets();
    const afterFirst = getRoomState().players[b].score;
    resolveBets();
    expect(getRoomState().players[b].score).toBe(afterFirst);
  });

  it("reopens the market after a full reset", () => {
    joinTwo();
    startReviewPhase();
    resetGame();
    expect(getRoomState().areBetsClosed).toBe(false);
    expect(getRoomState().areBetsResolved).toBe(false);
  });
});

describe("scoring on the 1 point = 1 right answer scale", () => {
  beforeEach(() => {
    resetGame();
  });

  function scoreOne(slide: SlideData, answer: unknown): number {
    const room = getRoomState();
    const id = joinPlayer("Tuomas").playerId!;
    room.slides = [slide];
    room.currentSlideIndex = 0;
    room.gamePhase = "review";
    room.players[id].answers[slide.id] = answer;
    revealAnswer();
    return getRoomState().players[id].score;
  }

  it("gives 1 for a correct multiple choice and 0 for a wrong one", () => {
    const slide: SlideData = { id: 1, type: "multiple_choice", correctAnswer: 2 };
    expect(scoreOne(slide, 2)).toBe(1);
    resetGame();
    expect(scoreOne(slide, 0)).toBe(0);
  });

  it("gives 0,25 per correct pair in a four-way pairing", () => {
    const slide: SlideData = {
      id: 1,
      type: "connect_pairs",
      pairs: [
        { left: "a", right: "A" },
        { left: "b", right: "B" },
        { left: "c", right: "C" },
        { left: "d", right: "D" },
      ],
    };
    expect(scoreOne(slide, { a: "A", b: "B", c: "X", d: "Y" })).toBe(0.5);
    resetGame();
    expect(scoreOne(slide, { a: "A", b: "B", c: "C", d: "D" })).toBe(1);
    resetGame();
    expect(scoreOne(slide, { a: "A", b: "X", c: "X", d: "X" })).toBe(0.25);
  });

  it("leaves an open question at 0 for the host to judge", () => {
    const slide: SlideData = {
      id: 1,
      type: "open_ended",
      correctAnswerText: "nelpskakjss",
    };
    // Even a verbatim correct answer scores nothing automatically.
    expect(scoreOne(slide, "nelpskakjss")).toBe(0);
  });

  it("scores a slider in quarters by how close the guess landed", () => {
    const slide: SlideData = {
      id: 1,
      type: "slider",
      min: 0,
      max: 100,
      correctValue: 50,
    };
    expect(scoreOne(slide, 50)).toBe(1);
    resetGame();
    expect(scoreOne(slide, 100)).toBe(0);
    resetGame();
    // 10 off over a range of 100 keeps half a point.
    expect(scoreOne(slide, 60)).toBe(0.5);
  });

  it("adds fractions without floating-point drift", () => {
    const room = getRoomState();
    const id = joinPlayer("Tuomas").playerId!;
    for (let i = 0; i < 8; i++) {
      scoreOpenEndedPlayer(`s${i}`, id, 0.25);
    }
    expect(getRoomState().players[id].score).toBe(2);
  });
});
