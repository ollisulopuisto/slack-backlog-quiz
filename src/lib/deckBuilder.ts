import { SlideData } from "./types";

/**
 * Weaves the standing prediction market into the deck.
 *
 * The market isn't a question card — it's a beat between them, four times over
 * the evening: once before anyone has answered anything, twice at even
 * intervals through the questions, and once after the last one as a final call
 * before the answers are revealed. Four is enough for the graph to visibly
 * move between visits without the deck turning into a market screen every
 * other slide.
 *
 * Generated rather than authored, so `quiz_data.json` stays a list of real
 * questions and the cadence is one constant to change.
 */

export const BET_SLIDE_PREFIX = "bet_";

/** Market screens over the evening, including the opening and closing ones. */
export const BET_MARKET_STOPS = 4;

export const STAT_SLIDE_PREFIX = "stat_";

export const QUOTE_SLIDE_PREFIX = "quotecard_";

function isQuestion(slide: SlideData): boolean {
  return (
    slide.type !== "wifi" &&
    slide.type !== "lobby" &&
    slide.type !== "scoreboard" &&
    slide.type !== "intro" &&
    slide.type !== "bet_market" &&
    slide.type !== "stat_chart" &&
    slide.type !== "quote_card"
  );
}

/**
 * Question boundaries to pause on, as counts of questions already shown.
 * 0 means "before the first question", n means "after question n".
 *
 * Rounding keeps the gaps as even as the count allows: 10 questions split
 * 3/4/3 rather than 4/3/3, because `Math.round` lands the first stop early.
 * Duplicates are dropped, so a two-question deck gets two screens rather than
 * two of them stacked on the same boundary.
 */
export function betMarketBoundaries(
  questionCount: number,
  stops = BET_MARKET_STOPS
): number[] {
  if (questionCount <= 0) return [];

  const gaps = stops - 1;
  const seen = new Set<number>();
  for (let i = 0; i < stops; i++) {
    seen.add(Math.round((questionCount * i) / gaps));
  }
  return [...seen].sort((a, b) => a - b);
}

function marketSlide(index: number, total: number): SlideData {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  return {
    id: `${BET_SLIDE_PREFIX}${index + 1}`,
    type: "bet_market",
    title: "Ennustusmarkkina",
    subtitle: isFirst
      ? "Lyö ensimmäinen veto puhelimella — kuka voittaa, kuka jää viimeiseksi?"
      : isLast
      ? "Viimeinen mahdollisuus vaihtaa. Markkina sulkeutuu tarkistusvaiheen alkaessa."
      : "Päivitä veto puhelimella — voit vielä vaihtaa!",
  };
}

/**
 * Boundaries for the stat screens, placed in the gaps the market leaves.
 *
 * The market stops at 0, N/3, 2N/3 and N. A chart goes at the midpoint of each
 * interior gap, so the deck alternates market → questions → chart → questions →
 * market. Anything that lands on a market boundary, or immediately beside one,
 * is dropped: two interstitials in a row is a lull, not a beat.
 */
export function statChartBoundaries(
  questionCount: number,
  chartCount: number,
  marketStops: number[] = betMarketBoundaries(questionCount)
): number[] {
  if (questionCount < 6 || chartCount === 0 || marketStops.length < 2) return [];

  const taken = new Set(marketStops);
  const out: number[] = [];
  for (let i = 0; i < marketStops.length - 1 && out.length < chartCount; i++) {
    const mid = Math.round((marketStops[i] + marketStops[i + 1]) / 2);
    const tooClose = [...taken].some((t) => Math.abs(t - mid) <= 1);
    if (!tooClose) {
      taken.add(mid);
      out.push(mid);
    }
  }
  return out;
}

function statSlide(chartId: string, index: number): SlideData {
  return {
    id: `${STAT_SLIDE_PREFIX}${index + 1}`,
    type: "stat_chart",
    chartId,
  };
}

/**
 * Boundaries for the quote cards, in whatever room the other two leave.
 *
 * The market and the charts have fixed homes; a quote card is filler in the
 * best sense, so it goes wherever the deck is emptiest. Each one is placed at
 * the boundary furthest from every beat already scheduled, then counts as a
 * beat itself, which spreads them without any arithmetic about thirds.
 *
 * A gap of one is refused: two interstitials with a single question wedged
 * between them reads as an interlude, not a pause. That is also what stops a
 * short deck from taking every card it is offered.
 */
export function quoteCardBoundaries(
  questionCount: number,
  quoteCount: number,
  taken: number[]
): number[] {
  if (questionCount <= 0 || quoteCount <= 0 || taken.length === 0) return [];

  const used = [...taken];
  const out: number[] = [];

  while (out.length < quoteCount) {
    let best = -1;
    let bestGap = 1;
    for (let boundary = 1; boundary < questionCount; boundary++) {
      const gap = Math.min(...used.map((t) => Math.abs(t - boundary)));
      if (gap > bestGap) {
        bestGap = gap;
        best = boundary;
      }
    }
    if (best < 0) break;
    used.push(best);
    out.push(best);
  }

  return out.sort((a, b) => a - b);
}

function quoteSlide(quoteId: string, index: number): SlideData {
  return {
    id: `${QUOTE_SLIDE_PREFIX}${index + 1}`,
    type: "quote_card",
    quoteId,
  };
}

/**
 * Weaves both kinds of interstitial into a plain list of questions.
 *
 * `chartIds` comes from the generated stat_charts.json; passing none leaves the
 * deck with markets only, which is what happens when the archive hasn't been
 * mined for the timeline series yet.
 */
export function withInterstitials(
  slides: SlideData[],
  chartIds: string[] = [],
  quoteIds: string[] = []
): SlideData[] {
  const source = slides.filter(
    (s) =>
      s.type !== "bet_market" &&
      s.type !== "stat_chart" &&
      s.type !== "quote_card"
  );
  const questionCount = source.filter(isQuestion).length;
  const markets = betMarketBoundaries(questionCount);
  if (markets.length === 0) return source;

  const charts = statChartBoundaries(questionCount, chartIds.length, markets);
  const quotes = quoteCardBoundaries(questionCount, quoteIds.length, [
    ...markets,
    ...charts,
  ]);
  const marketAt = new Set(markets);
  const chartAt = new Map(charts.map((b, i) => [b, chartIds[i]]));
  const quoteAt = new Map(quotes.map((b, i) => [b, quoteIds[i]]));

  const out: SlideData[] = [];
  let placedMarkets = 0;
  let placedCharts = 0;
  let placedQuotes = 0;
  let seen = 0;

  const placeIfDue = () => {
    if (marketAt.has(seen)) {
      marketAt.delete(seen);
      out.push(marketSlide(placedMarkets, markets.length));
      placedMarkets++;
    }
    const chartId = chartAt.get(seen);
    if (chartId !== undefined) {
      chartAt.delete(seen);
      out.push(statSlide(chartId, placedCharts));
      placedCharts++;
    }
    const quoteId = quoteAt.get(seen);
    if (quoteId !== undefined) {
      quoteAt.delete(seen);
      out.push(quoteSlide(quoteId, placedQuotes));
      placedQuotes++;
    }
  };

  for (const slide of source) {
    // A screen goes immediately before whatever slide follows its boundary, so
    // the closing market lands between the last question and the scoreboard
    // rather than after the results are already up. The `seen > 0` guard keeps
    // the opening screen from jumping ahead of the wifi code, the lobby and
    // the intro — the three screens people need before they can play at all.
    if (isQuestion(slide) || seen > 0) placeIfDue();
    out.push(slide);
    if (isQuestion(slide)) seen++;
  }
  // Only fires for a deck that ends on a question, with no scoreboard.
  placeIfDue();

  return out;
}

/** Back-compat alias: the market-only build, used by the existing tests. */
export function withBetMarketSlides(slides: SlideData[]): SlideData[] {
  return withInterstitials(slides);
}
