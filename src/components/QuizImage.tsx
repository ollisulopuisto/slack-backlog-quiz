"use client";

/**
 * Renders a question's `imageUrl`.
 *
 * The same markup was copy-pasted ten times — once per question type in both
 * /deck and /play — differing only in `maxHeight`. Two variants cover every
 * previous use: `stage` for the projector, `mobile` for the phone.
 */

type QuizImageVariant = "stage" | "mobile";

const VARIANTS: Record<
  QuizImageVariant,
  {
    maxHeight: number;
    wrapperStyle: React.CSSProperties;
    borderRadius: string;
    boxShadow: string;
    border: string;
  }
> = {
  stage: {
    maxHeight: 350,
    wrapperStyle: { marginBottom: "1.5rem" },
    borderRadius: "16px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
    border: "2px solid rgba(255, 255, 255, 0.15)",
  },
  mobile: {
    maxHeight: 220,
    wrapperStyle: { margin: "0.75rem 0" },
    borderRadius: "12px",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
  },
};

interface QuizImageProps {
  src?: string;
  variant: QuizImageVariant;
  /** Overrides the variant default (some slide types render shorter) */
  maxHeight?: number;
  alt?: string;
}

export default function QuizImage({
  src,
  variant,
  maxHeight,
  alt = "Kuvatehtävä",
}: QuizImageProps) {
  if (!src) return null;

  const v = VARIANTS[variant];

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        ...v.wrapperStyle,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          maxHeight: `${maxHeight ?? v.maxHeight}px`,
          maxWidth: "100%",
          objectFit: "contain",
          borderRadius: v.borderRadius,
          boxShadow: v.boxShadow,
          border: v.border,
        }}
      />
    </div>
  );
}
