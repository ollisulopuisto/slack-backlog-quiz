"use client";

import EmojiText, { Emoji } from "@/components/EmojiText";
import quoteCards from "@/lib/quote_cards.json";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";

/**
 * One message from the archive, blown up between two questions.
 *
 * No question, no answer, no points — the host reads the line out and the deck
 * moves on. The card is deliberately the emptiest screen in the deck: a single
 * line of type, the person who wrote it, and the reactions it collected, which
 * are half of why the line is remembered at all.
 *
 * The type scales down as the quote gets longer so a projected card never
 * scrolls; a one-liner ("se on moro") fills the screen, an argued point takes
 * the smaller size and still reads from the back of the room.
 *
 * The cards themselves come from build_quote_cards.py, which refuses any line
 * the questions already quote.
 */

type QuoteCardData = {
  id: string;
  text: string;
  author: string;
  channel: string;
  date: string;
  reactionCount: number;
  reactions: { name: string; count: number }[];
};

const GOLD = "#f0a020";

export function getQuoteCards(): QuoteCardData[] {
  return (quoteCards as { cards: QuoteCardData[] }).cards;
}

/** Long lines drop a step rather than wrapping into a paragraph of shouting. */
function quoteSize(text: string): string {
  if (text.length <= 24) return "clamp(3rem, 7.5vw, 6rem)";
  if (text.length <= 60) return "clamp(2.4rem, 5vw, 4.2rem)";
  return "clamp(1.9rem, 3.6vw, 3rem)";
}

export default function QuoteCard({ quoteId }: { quoteId: string }) {
  const card = getQuoteCards().find((c) => c.id === quoteId);
  if (!card) return null;

  return (
    <div
      className="glass-panel"
      style={{ padding: "3rem 3.5rem", width: "100%" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          color: GOLD,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "1rem",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <Quote size={22} />
        Backlogista poimittua
      </div>

      <motion.blockquote
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        style={{
          margin: "2rem 0 0 0",
          paddingLeft: "1.5rem",
          borderLeft: `4px solid ${GOLD}`,
          fontSize: quoteSize(card.text),
          lineHeight: 1.15,
          fontWeight: 800,
          // break-word, not anywhere: a projected line should wrap between
          // words, and only a single unbreakable word may be split.
          overflowWrap: "break-word",
        }}
      >
        <EmojiText text={card.text} />
      </motion.blockquote>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem 1.25rem",
          marginTop: "2.25rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid var(--border-glass)",
        }}
      >
        <span style={{ fontSize: "1.6rem", fontWeight: 800 }}>
          — {card.author}
        </span>
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "1.1rem",
            color: "var(--text-muted)",
          }}
        >
          #{card.channel} · {card.date}
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginLeft: "auto",
          }}
          aria-label={`${card.reactionCount} reaktiota`}
        >
          {card.reactions.map((r) => (
            <span
              key={r.name}
              title={`:${r.name}:`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid var(--border-glass)",
                borderRadius: "999px",
                padding: "0.3rem 0.7rem",
                fontSize: "1.05rem",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <Emoji name={r.name} size="1.5rem" />
              {r.count}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
