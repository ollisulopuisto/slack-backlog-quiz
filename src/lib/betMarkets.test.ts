import { describe, expect, it } from "vitest";

import { BET_POINTS } from "./scoring";
import {
  BET_MARKETS,
  betStandings,
  resolveMarket,
  scoreBets,
} from "./betMarkets";
import { Player, RoomState } from "./types";

function player(
  id: string,
  score: number,
  extra: Partial<Player> = {}
): Player {
  return {
    id,
    name: id,
    score,
    answers: {},
    scoresPerSlide: {},
    joinedAt: 0,
    ...extra,
  };
}

function room(players: Player[]): RoomState {
  return {
    code: "TEST",
    currentSlideIndex: 0,
    gamePhase: "review",
    isAnswerRevealed: false,
    isQuestionLocked: false,
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    slides: [],
  };
}

describe("BET_MARKETS", () => {
  it("offers exactly the winner and the loser market", () => {
    expect(BET_MARKETS.map((m) => m.id)).toEqual([
      "best_player",
      "worst_player",
    ]);
  });
});

describe("resolveMarket", () => {
  it("resolves the winner and the last place from final scores", () => {
    const r = room([player("a", 900), player("b", 1200), player("c", 300)]);
    expect(resolveMarket("best_player", r)).toEqual(["b"]);
    expect(resolveMarket("worst_player", r)).toEqual(["c"]);
  });

  it("pays every backer when the top is tied", () => {
    const r = room([player("a", 500), player("b", 500), player("c", 100)]);
    expect(resolveMarket("best_player", r).sort()).toEqual(["a", "b"]);
  });

  it("resolves to nothing when nobody has joined", () => {
    expect(resolveMarket("best_player", room([]))).toEqual([]);
  });

  it("makes a lone player both the winner and the loser", () => {
    const r = room([player("a", 400)]);
    expect(resolveMarket("best_player", r)).toEqual(["a"]);
    expect(resolveMarket("worst_player", r)).toEqual(["a"]);
  });
});

describe("betStandings", () => {
  it("tallies backers per pick, biggest first", () => {
    const r = room([
      player("a", 0, { bets: { best_player: "c" } }),
      player("b", 0, { bets: { best_player: "c" } }),
      player("c", 0, { bets: { best_player: "a" } }),
    ]);
    const standings = betStandings("best_player", r);
    expect(standings[0].playerId).toBe("c");
    expect(standings[0].backers).toHaveLength(2);
    expect(standings[1].playerId).toBe("a");
  });

  it("leaves out players who haven't bet yet", () => {
    const r = room([player("a", 0), player("b", 0)]);
    expect(betStandings("best_player", r)).toEqual([]);
  });
});

describe("scoreBets", () => {
  it("pays a correct bet and nothing for a wrong one", () => {
    const winner = player("a", 1000, { bets: { best_player: "a" } });
    const loser = player("b", 200, { bets: { best_player: "b" } });
    const awards = scoreBets(room([winner, loser]));

    const market = BET_MARKETS.find((m) => m.id === "best_player")!;
    expect(awards.a.best_player).toBe(market.points);
    expect(awards.b.best_player).toBe(0);
  });

  it("pays both sides when a market ties", () => {
    const a = player("a", 500, { bets: { best_player: "b" } });
    const b = player("b", 500, { bets: { best_player: "a" } });
    const awards = scoreBets(room([a, b]));
    expect(awards.a.best_player).toBeGreaterThan(0);
    expect(awards.b.best_player).toBeGreaterThan(0);
  });

  it("pays nothing for a market the player never bet on", () => {
    const awards = scoreBets(room([player("a", 100)]));
    expect(awards.a.best_player).toBe(0);
  });

  it("lets a player cash in by backing themselves", () => {
    const a = player("a", 1000, {
      bets: { best_player: "a", worst_player: "b" },
    });
    const b = player("b", 100);
    const awards = scoreBets(room([a, b]));
    expect(awards.a.best_player).toBe(BET_POINTS);
    expect(awards.a.worst_player).toBe(BET_POINTS);
  });
});
