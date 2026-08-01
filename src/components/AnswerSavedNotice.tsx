"use client";

/**
 * The green "your answer is stored" confirmation under a question on /play.
 *
 * Was repeated five times — once per answerable question type — with identical
 * styling and only the wording differing.
 */
interface AnswerSavedNoticeProps {
  children: React.ReactNode;
  /** Top gap; the connect_pairs list already has flex spacing above it */
  marginTop?: string;
}

export default function AnswerSavedNotice({
  children,
  marginTop = "1rem",
}: AnswerSavedNoticeProps) {
  return (
    <div
      style={{
        marginTop,
        textAlign: "center",
        color: "var(--neon-green)",
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}
