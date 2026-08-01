"""Builds the deck's quote cards -- single messages, blown up between questions.

The quiz already mines the most-reacted messages, but only a handful survive as
questions: "kuka kirjoitti tämän" needs an answer nobody can deduce, and most of
the great lines are great precisely because everyone remembers who said them.
Those are the ones that belong on the projector anyway, as a beat rather than a
question -- the host reads the line out, the room laughs, the quiz moves on.

Which lines: picked by hand, by ts, from backlog_summary.json. Ranking by
reaction count alone surfaces messages that only work inside their thread ("eli
vessoja", "mites sun?"), and the archive isn't mounted at build time to pull
that context in. A pull-quote has to land on its own, so the pick is a judgement
call; the numbers around it are not, and are read from the archive data.

The picks are checked against the deck: a line already quoted by a question
would either spoil it or repeat it, and that fails the build rather than sitting
in a JSON file waiting for someone to notice on quiz night.

    uv run python build_quote_cards.py
"""

import json
import re
import unicodedata

from members import label
from quiz_files import write_json_copies

SUMMARY = "backlog_summary.json"
DECK = "quiz_data.json"
OUT_PATHS = ("src/lib/quote_cards.json", "quote_cards.json")

MONTHS = 12

#: Chosen by hand, in the order the deck should show them: one per person, one
#: every couple of years, no line that needs the messages either side of it.
PICKS = [
    "1550849838.5509",  # Niko, #general, 2019
    "1615210952.421",  # Robin, #general, 2021
    "1683737900.551109",  # Vili, #general, 2023
    "1753166092.952239",  # Alex, #random, 2025
]

#: ":pray:(3)" and ":pray::skin-tone-5:(1)" are one reaction with four presses.
REACTION_RE = re.compile(r":([^:]+):(?::skin-tone-\d+:)?\((\d+)\)")


def _slug(text, year):
    """Stable id from the first words, so a card keeps its id across builds."""
    words = re.findall(r"[\w]+", text.lower(), flags=re.UNICODE)[:3]
    ascii_words = [
        unicodedata.normalize("NFKD", w).encode("ascii", "ignore").decode() or "x"
        for w in words
    ]
    return f"quote_{year}_" + "_".join(ascii_words)


def _reactions(raw):
    """[":dart:(2)", …] -> [{"name": "dart", "count": 2}], biggest first."""
    merged = {}
    for item in raw:
        m = REACTION_RE.fullmatch(item)
        if not m:
            continue
        merged[m.group(1)] = merged.get(m.group(1), 0) + int(m.group(2))
    return [
        {"name": name, "count": count}
        for name, count in sorted(merged.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def _date(stamp):
    """'2019-02-22 17:37' -> ('22.2.2019', 2019), the deck's date format."""
    date, _, _time = stamp.partition(" ")
    year, month, day = (int(p) for p in date.split("-"))
    return f"{day}.{month}.{year}", year


def _deck_quotes():
    """Every line the deck already puts on screen, normalised for comparison."""
    with open(DECK, encoding="utf-8") as f:
        slides = json.load(f)

    seen = set()
    for slide in slides:
        texts = [slide.get("question"), slide.get("explanation")]
        texts += [p.get("left", "") for p in slide.get("pairs") or []]
        texts += slide.get("options") or []
        for text in texts:
            for quoted in re.findall(r"[\"”']([^\"”']{12,})[\"”']", text or ""):
                seen.add(_normalise(quoted))
    return seen


def _normalise(text):
    return re.sub(r"[^\w]+", " ", (text or "").lower(), flags=re.UNICODE).strip()


def build():
    with open(SUMMARY, encoding="utf-8") as f:
        messages = json.load(f)["top_reacted_messages"]

    by_ts = {str(m["ts"]): m for m in messages}
    used = _deck_quotes()

    cards = []
    for ts in PICKS:
        m = by_ts.get(ts)
        if m is None:
            raise SystemExit(f"{ts} is not among the top-reacted messages")

        text = m["text"].strip()
        key = _normalise(text)
        clash = next((q for q in used if q and (q in key or key in q)), None)
        if clash:
            raise SystemExit(
                f"the deck already quotes {text[:40]!r} -- a card would repeat it"
            )

        date, year = _date(m["date"])
        cards.append(
            {
                "id": _slug(text, year),
                "text": text,
                # The archive display name is unwieldy for a projected slide;
                # members.py already keeps the short label a question uses.
                "author": label(m["user_name"]),
                "channel": m["channel"],
                "date": date,
                "reactionCount": m["react_count"],
                "reactions": _reactions(m.get("reactions") or []),
            }
        )

    ids = [c["id"] for c in cards]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"two cards share an id: {ids}")

    return {"generated_from": SUMMARY, "cards": cards}


if __name__ == "__main__":
    data = build()
    write_json_copies(data, OUT_PATHS)
    print(f"Wrote {len(data['cards'])} quote cards to {' and '.join(OUT_PATHS)}")
    for card in data["cards"]:
        print(f"  {card['id']}: {card['author']} — {card['text'][:60]}")
