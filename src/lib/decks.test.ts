import { describe, expect, it } from "vitest";

import { deckIdFor, parkGame, restoreGame } from "./decks";
import { Player, RoomState, SlideData } from "./types";

function player(id: string, name: string, score: number): Player {
  return {
    id,
    name,
    score,
    answers: { 1: 2 },
    scoresPerSlide: { 1: score },
    joinedAt: 0,
  };
}

function room(players: Player[], extra: Partial<RoomState> = {}): RoomState {
  return {
    code: "TEST",
    activeDeckId: "a",
    currentSlideIndex: 7,
    gamePhase: "review",
    isAnswerRevealed: true,
    isQuestionLocked: true,
    areBetsClosed: true,
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    slides: [{ id: 1, type: "multiple_choice" } as SlideData],
    ...extra,
  };
}

describe("deckIdFor", () => {
  it("slugifies a Finnish name", () => {
    expect(deckIdFor("Lämmittelykierros", [])).toBe("lammittelykierros");
  });

  it("keeps ids unique without overwriting an existing deck", () => {
    expect(deckIdFor("Testi", ["testi"])).toBe("testi-2");
    expect(deckIdFor("Testi", ["testi", "testi-2"])).toBe("testi-3");
  });

  it("falls back when a name has nothing to slugify", () => {
    expect(deckIdFor("!!!", [])).toMatch(/^pakka/);
  });
});

describe("parkGame / restoreGame", () => {
  it("brings a parked game back exactly as it was", () => {
    const before = room([player("p1", "Niko", 24.5)]);
    const parked = parkGame(before);
    const after = restoreGame(parked, {});

    expect(after.players.p1.score).toBe(24.5);
    expect(after.currentSlideIndex).toBe(7);
    expect(after.gamePhase).toBe("review");
    expect(after.isAnswerRevealed).toBe(true);
    expect(after.areBetsClosed).toBe(true);
  });

  it("starts a deck nobody has played from the beginning", () => {
    const fresh = restoreGame(undefined, {
      p1: player("p1", "Niko", 24.5),
    });
    expect(fresh.currentSlideIndex).toBe(0);
    expect(fresh.gamePhase).toBe("answering");
    expect(fresh.areBetsClosed).toBe(false);
  });

  it("carries the roster across so nobody has to rejoin", () => {
    const fresh = restoreGame(undefined, {
      p1: player("p1", "Niko", 24.5),
      p2: player("p2", "Vili", 10),
    });
    expect(Object.keys(fresh.players).sort()).toEqual(["p1", "p2"]);
  });

  it("gives a carried-over player a clean slate on the new deck", () => {
    const fresh = restoreGame(undefined, { p1: player("p1", "Niko", 24.5) });
    expect(fresh.players.p1.score).toBe(0);
    expect(fresh.players.p1.answers).toEqual({});
    expect(fresh.players.p1.scoresPerSlide).toEqual({});
    expect(fresh.players.p1.name).toBe("Niko");
  });

  it("keeps a returning player's own scores, not the other deck's", () => {
    const parked = parkGame(room([player("p1", "Niko", 24.5)]));
    const back = restoreGame(parked, { p1: player("p1", "Niko", 3) });
    expect(back.players.p1.score).toBe(24.5);
  });

  it("adds someone who joined while another deck was live", () => {
    const parked = parkGame(room([player("p1", "Niko", 24.5)]));
    const back = restoreGame(parked, {
      p1: player("p1", "Niko", 24.5),
      p2: player("p2", "myöhäinen", 8),
    });
    expect(back.players.p2.score).toBe(0);
    expect(back.players.p2.name).toBe("myöhäinen");
  });

  it("does not let a parked game share objects with the live room", () => {
    const before = room([player("p1", "Niko", 24.5)]);
    const parked = parkGame(before);
    before.players.p1.score = 999;
    expect(restoreGame(parked, {}).players.p1.score).toBe(24.5);
  });
});
