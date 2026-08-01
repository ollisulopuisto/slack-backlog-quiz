"use client";

import assets from "@/lib/archive_assets.json";
import React from "react";

/**
 * Renders `:name:` tokens as the emoji they stand for.
 *
 * Half the group's jokes are carried by its own emoji, and ":janari: 4" on a
 * projector conveys none of it. The 262 custom ones are inlined as data URIs
 * (embed_assets.py), so nothing is fetched and the archive doesn't need to be
 * mounted. Slack's standard emoji aren't files anywhere, so the handful the
 * questions actually use are mapped to unicode.
 *
 * A name we have neither an image nor a character for is left as `:name:`,
 * which is what Slack itself shows.
 */

const EMOJI: Record<string, string> = (
  assets as { emoji: Record<string, string> }
).emoji;

/** The standard emoji the question bank actually mentions. */
const UNICODE: Record<string, string> = {
  dart: "🎯",
  joy: "😂",
  heart: "❤️",
  "+1": "👍",
  rage: "😡",
  white_check_mark: "✅",
  heavy_check_mark: "✔️",
  one: "1️⃣",
  two: "2️⃣",
  three: "3️⃣",
  fish: "🐟",
  watch: "⌚",
  yum: "😋",
  beer: "🍺",
  cocktail: "🍸",
  grapes: "🍇",
  bear: "🐻",
  hankey: "💩",
  evergreen_tree: "🌲",
  question: "❓",
  eyeglasses: "👓",
  eyes: "👀",
  pray: "🙏",
  fire: "🔥",
  heart_eyes: "😍",
  zany_face: "🤪",
  joy_cat: "😹",
  handshake: "🤝",
  // Standard reactions the quote cards carry (build_quote_cards.py).
  clinking_glasses: "🥂",
  raised_hands: "🙌",
  santa: "🎅",
  trumpet: "🎺",
  // A modifier, not an emoji: it trails the one before it and shows nothing.
  "skin-tone-2": "",
};

const TOKEN = /:([a-z0-9_+\-äöå]+):/gi;

export function hasEmoji(text: string | undefined): boolean {
  return Boolean(text && TOKEN.test(text));
}

export default function EmojiText({
  text,
  size = "1.15em",
}: {
  text: string | undefined;
  size?: string;
}) {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN)) {
    const name = match[1];
    const image = EMOJI[name];
    const char = UNICODE[name];
    if (image === undefined && char === undefined) continue;

    if (match.index! > last) parts.push(text.slice(last, match.index));
    last = match.index! + match[0].length;

    if (image) {
      parts.push(
        <img
          key={key++}
          src={image}
          alt={`:${name}:`}
          title={`:${name}:`}
          style={{
            height: size,
            width: size,
            objectFit: "contain",
            verticalAlign: "-0.18em",
            display: "inline-block",
          }}
        />
      );
    } else if (char) {
      parts.push(
        <span key={key++} title={`:${name}:`}>
          {char}
        </span>
      );
    }
  }

  if (last === 0) return <>{text}</>;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** A single emoji at whatever size, for a question that shows them large. */
export function Emoji({ name, size }: { name: string; size: string }) {
  const image = EMOJI[name];
  if (image) {
    return (
      <img
        src={image}
        alt={`:${name}:`}
        style={{ height: size, width: size, objectFit: "contain" }}
      />
    );
  }
  return <span style={{ fontSize: size }}>{UNICODE[name] ?? `:${name}:`}</span>;
}
