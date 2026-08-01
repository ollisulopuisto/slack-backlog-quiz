"use client";

import { SlideSource } from "@/lib/types";
import { MessageSquare } from "lucide-react";

/**
 * Shows a quoted answer back in the conversation it came from.
 *
 * A quote on its own is a floating line; the messages either side are usually
 * where the joke actually is. The context is baked into the question at build
 * time (build_source_context.py), so nothing is fetched here and the archive
 * doesn't need to be mounted during the quiz.
 *
 * The cited message carries a gold rail and heavier type. Nothing else is
 * dimmed — the surrounding conversation is the reason to show this at all.
 */

const CITE = "#f0a020";

export default function SourceContext({ source }: { source: SlideSource }) {
  const all = [...source.messages, ...(source.threadReplies ?? [])];

  return (
    <div
      style={{
        marginTop: "1.25rem",
        border: "1px solid var(--border-glass)",
        borderRadius: "14px",
        overflow: "hidden",
        background: "rgba(255, 255, 255, 0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.55rem 1rem",
          borderBottom: "1px solid var(--border-glass)",
          background: "rgba(255, 255, 255, 0.04)",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <MessageSquare size={14} />
        <strong style={{ color: "var(--text-main)" }}>#{source.channel}</strong>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{source.date}</span>
        {source.replyCount > 0 && (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{source.replyCount} vastausta ketjussa</span>
          </>
        )}
      </div>

      <div style={{ padding: "0.6rem 0.4rem" }}>
        {all.map((m, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "3.4rem 1fr",
              gap: "0 0.55rem",
              padding: m.isAnswer ? "0.5rem 0.7rem" : "0.28rem 0.7rem",
              marginLeft: m.inThread ? "2rem" : 0,
              borderLeft: m.isAnswer
                ? `2px solid ${CITE}`
                : m.inThread
                ? "2px solid var(--border-glass)"
                : "2px solid transparent",
              background: m.isAnswer ? "rgba(240, 160, 32, 0.11)" : undefined,
              borderRadius: m.isAnswer ? "0 8px 8px 0" : 0,
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                textAlign: "right",
                paddingTop: "0.15rem",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {m.time}
            </span>
            <div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  color: m.isAnswer ? CITE : "var(--text-muted)",
                }}
              >
                {m.author}
              </span>
              <div
                style={{
                  fontSize: m.isAnswer ? "1.05rem" : "0.93rem",
                  fontWeight: m.isAnswer ? 600 : 400,
                  color: m.isAnswer ? "var(--text-main)" : "var(--text-muted)",
                  overflowWrap: "anywhere",
                }}
              >
                {m.text}
              </div>
              {m.reactions.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.25rem",
                    marginTop: "0.3rem",
                  }}
                >
                  {m.reactions.slice(0, 8).map((r) => (
                    <span
                      key={r.name}
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: "0.68rem",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid var(--border-glass)",
                        borderRadius: "999px",
                        padding: "0.05rem 0.4rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      :{r.name}: {r.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
