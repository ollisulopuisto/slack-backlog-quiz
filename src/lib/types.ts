export type QuestionType =
  | "wifi"
  | "lobby"
  | "multiple_choice"
  | "connect_pairs"
  | "open_ended"
  | "prediction_market"
  | "slider"
  | "scoreboard"
  | "bet_market"
  | "intro"
  | "stat_chart"
  | "quote_card";

export interface PairItem {
  left: string;
  right: string;
}

export interface SourceMessage {
  author: string;
  time: string;
  text: string;
  isAnswer: boolean;
  inThread: boolean;
  reactions: { name: string; count: number }[];
}

/** The conversation a quoted answer came from, baked in at build time. */
export interface SlideSource {
  channel: string;
  date: string;
  ts: string;
  replyCount: number;
  messages: SourceMessage[];
  threadReplies: SourceMessage[];
}

export interface SlideData {
  id: number | string;
  type: QuestionType;
  category?: string;
  title?: string;
  subtitle?: string;
  instructions?: string;
  bullets?: string[]; // for the intro slide
  ssid?: string; // for the wifi slide
  password?: string; // for the wifi slide
  chartId?: string; // for the stat_chart slide
  quoteId?: string; // for the quote_card slide (see quote_cards.json)
  emojiQuiz?: string[]; // custom emoji names to be written out as the answer
  sourceChannel?: string;
  sourceTs?: string;
  source?: SlideSource;
  footnote?: string;
  question?: string;
  imageUrl?: string;
  options?: string[];
  correctAnswer?: number; // for multiple choice
  explanation?: string;
  pairs?: PairItem[]; // for connect pairs
  pairOptions?: string[]; // shuffled right-hand choices sent to players (see visibility.ts)
  hint?: string;
  sampleAnswers?: string[];
  correctAnswerText?: string;
  resolvedOutcome?: number; // 0 for YES (or Option 0), 1 for NO (or Option 1) for prediction market
  min?: number; // for slider
  max?: number; // for slider
  step?: number; // for slider
  correctValue?: number; // for slider
  unit?: string; // for slider (e.g. "viestiä", "kertaa")
  points?: number;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  answers: Record<number | string, any>; // slideId -> answer payload
  scoresPerSlide?: Record<number | string, number>; // slideId -> awarded points
  bets?: Record<string, string>; // betMarketId -> picked playerId
  joinedAt: number;
}

export interface RoomState {
  code: string;
  /** Which deck is on the projector; see src/lib/decks.ts. */
  activeDeckId?: string;
  currentSlideIndex: number;
  gamePhase: "answering" | "review";
  isAnswerRevealed: boolean;
  isQuestionLocked: boolean;
  isOfflineMode?: boolean;
  // Latches true when review starts; bets are editable right up to that point
  // and never reopen, so nobody can re-bet on a scoreboard they've now seen.
  areBetsClosed?: boolean;
  // Latches once the market has paid out, so a second scoreboard reveal can't
  // re-settle it against scores that already include the winnings.
  areBetsResolved?: boolean;
  players: Record<string, Player>;
  slides: SlideData[];
}
