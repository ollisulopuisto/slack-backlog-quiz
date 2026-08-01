import { BET_POINTS } from "./scoring";
import { RoomState } from "./types";

/**
 * The standing prediction market.
 *
 * Unlike a question slide, these markets are open for the whole answering
 * phase and every bet stays editable until the host moves to review — talking
 * someone off their pick is half the game. Both resolve straight from the
 * final scores, so the host never has to adjudicate anything.
 */

export type BetMarketId = "best_player" | "worst_player";

export interface BetMarket {
  id: BetMarketId;
  question: string;
  short: string;
  hint: string;
  points: number;
}

export const BET_MARKETS: BetMarket[] = [
  {
    id: "best_player",
    question: "Kuka voittaa visan?",
    short: "Voittaja",
    hint: "Eniten pisteitä lopussa.",
    points: BET_POINTS,
  },
  {
    id: "worst_player",
    question: "Kuka jää viimeiseksi?",
    short: "Häviäjä",
    hint: "Vähiten pisteitä lopussa.",
    points: BET_POINTS,
  },
];

export function getBetMarket(id: string): BetMarket | undefined {
  return BET_MARKETS.find((m) => m.id === id);
}

function extremesBy<T>(
  items: T[],
  value: (item: T) => number,
  pick: "min" | "max"
): T[] {
  if (items.length === 0) return [];
  const scores = items.map(value);
  const target = pick === "max" ? Math.max(...scores) : Math.min(...scores);
  return items.filter((_, i) => scores[i] === target);
}

/**
 * The winning bet values for a market. Always an array: a tie pays everyone
 * who backed any of the tied players rather than silently picking one.
 */
export function resolveMarket(id: BetMarketId, room: RoomState): string[] {
  const players = Object.values(room.players);
  return extremesBy(
    players,
    (p) => p.score,
    id === "best_player" ? "max" : "min"
  ).map((p) => p.id);
}

/**
 * Live bet tallies for one market, ordered biggest backing first — the shape
 * the deck's between-questions standings graph renders.
 */
export function betStandings(
  id: BetMarketId,
  room: RoomState
): { playerId: string; name: string; backers: string[] }[] {
  const counts = new Map<string, string[]>();
  for (const player of Object.values(room.players)) {
    const pick = player.bets?.[id];
    if (pick === undefined) continue;
    const key = String(pick);
    counts.set(key, [...(counts.get(key) ?? []), player.name]);
  }

  return [...counts.entries()]
    .map(([playerId, backers]) => ({
      playerId,
      name: room.players[playerId]?.name ?? "(poistunut)",
      backers,
    }))
    .sort(
      (a, b) =>
        b.backers.length - a.backers.length || a.name.localeCompare(b.name)
    );
}

/**
 * Points every player earned from their bets, as
 * `{ [playerId]: { [marketId]: points } }`. A market that can't resolve
 * (nobody joined) simply pays nobody.
 */
export function scoreBets(
  room: RoomState
): Record<string, Record<BetMarketId, number>> {
  const resolved = new Map<BetMarketId, string[]>(
    BET_MARKETS.map((m) => [m.id, resolveMarket(m.id, room)])
  );

  const awards: Record<string, Record<BetMarketId, number>> = {};
  for (const player of Object.values(room.players)) {
    const perMarket = {} as Record<BetMarketId, number>;
    for (const market of BET_MARKETS) {
      const pick = player.bets?.[market.id];
      const winners = resolved.get(market.id) ?? [];
      perMarket[market.id] =
        pick !== undefined && winners.includes(String(pick))
          ? market.points
          : 0;
    }
    awards[player.id] = perMarket;
  }
  return awards;
}
