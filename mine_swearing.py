"""Sixth pass: swearing, and what made each year its own.

Two things at once, because both need a full read of the archive.

Swearing: who swears, how often relative to how much they write, which words,
and how the habit has changed over ten years. Rate matters more than volume --
the person who writes most will swear most in absolute terms without being the
group's biggest swearer.

Per-year character: for every year, the word that spiked hardest *that* year
compared with its baseline across the rest of the decade, plus the year's
top-reacted message, its busiest day and the custom emoji born in it. A
year-specific question needs something that only fits that year.

    uv run python mine_swearing.py
"""

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

from slack_archive import (
    ARCHIVE_DIR,
    iter_channel_files,
    iter_messages,
    load_channels,
    load_users,
)

OUT_PATH = "archive_swearing.json"

#: Stems, matched as whole words with any Finnish inflection glued on. Keyed by
#: the base word so "vittu", "vitun" and "vituttaa" tally together.
SWEAR_STEMS = {
    "vittu": r"vit(?:tu|un|tui|uttaa|tuil|tumai|un?)\w*",
    "paska": r"paska\w*",
    "saatana": r"saatana\w*|saatanan|saamari\w*",
    "perkele": r"perkele\w*|perkeleen",
    "helvetti": r"helvet(?:ti|in|tiin|tisti)\w*",
    "jumalauta": r"jumalauta|jumaliste|jumalavita\w*",
    "kyrpä": r"kyrp\w*",
    "mulkku": r"mulkku\w*|mulkero\w*",
    "hitto": r"hito\w*|hitto\w*",
    "piru": r"piru\w*|pirun",
    "vitsi": r"",  # placeholder, dropped below
}
SWEAR_STEMS.pop("vitsi")

SWEAR_RE = {
    base: re.compile(rf"\b(?:{pattern})\b", re.IGNORECASE)
    for base, pattern in SWEAR_STEMS.items()
}

WORD_RE = re.compile(r"[a-zäöå]{4,}", re.UNICODE)
URL_RE = re.compile(r"<https?://[^>]*>|https?://\S+")

# Words that are common everywhere and say nothing about a particular year.
YEAR_STOPWORDS = frozenset(
    """
    että olla ollut oli ovat mutta niin sitten koska vain myös kuin jossa
    tämä tuo joka mikä kaikki jotain jonkin siitä siihen tässä tuossa
    minä sinä hän nyt vielä ihan just tosi aika sellainen semmoinen
    https http www com jpg png here channel image redd imgur twitter
    status html photo video amp quot nbsp
    """.split()
)


def _load(fpath):
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def mine():
    users = load_users(ARCHIVE_DIR)
    name_of = {uid: u["display_name"] for uid, u in users.items()}
    channels = load_channels(ARCHIVE_DIR)

    swear_by_user = defaultdict(Counter)
    swear_by_year = defaultdict(Counter)
    swear_by_channel = defaultdict(Counter)
    swear_total = Counter()
    user_msgs = Counter()
    year_msgs = Counter()
    sweariest_msgs = []
    first_swear = {}

    words_by_year = defaultdict(Counter)
    top_msg_by_year = {}
    day_by_year = defaultdict(Counter)

    for _cid, ch_name, fpath in iter_channel_files(ARCHIVE_DIR, channels):
        print(f"  #{ch_name}", flush=True)
        for m in iter_messages(_load(fpath)):
            uid = m["user"]
            try:
                ts = float(m.get("ts", 0))
            except (TypeError, ValueError):
                continue
            if ts <= 0:
                continue

            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            year = dt.year
            user_msgs[uid] += 1
            year_msgs[year] += 1
            day_by_year[year][dt.strftime("%Y-%m-%d")] += 1

            raw = m.get("text") or ""
            text = URL_RE.sub(" ", raw)

            hits = 0
            for base, rx in SWEAR_RE.items():
                found = len(rx.findall(text))
                if found:
                    hits += found
                    swear_by_user[uid][base] += found
                    swear_by_year[year][base] += found
                    swear_by_channel[ch_name][base] += found
                    swear_total[base] += found
                    if base not in first_swear or ts < first_swear[base]["ts"]:
                        first_swear[base] = {
                            "ts": ts,
                            "date": dt.strftime("%Y-%m-%d"),
                            "user": name_of.get(uid, uid),
                            "channel": ch_name,
                            "text": raw[:180],
                        }
            if hits >= 4:
                sweariest_msgs.append(
                    {
                        "swears": hits,
                        "user": name_of.get(uid, uid),
                        "channel": ch_name,
                        "date": dt.strftime("%-d.%-m.%Y"),
                        "text": raw[:220],
                    }
                )

            for w in WORD_RE.findall(text.lower()):
                if w not in YEAR_STOPWORDS:
                    words_by_year[year][w] += 1

            reacts = sum(r.get("count", 0) for r in (m.get("reactions") or []))
            if reacts and reacts > top_msg_by_year.get(year, {}).get("reacts", 0):
                top_msg_by_year[year] = {
                    "reacts": reacts,
                    "user": name_of.get(uid, uid),
                    "channel": ch_name,
                    "date": dt.strftime("%-d.%-m.%Y"),
                    "text": raw[:220],
                }

    # Swearing rate per 1 000 messages, for people who write enough to compare.
    rates = []
    for uid, counts in swear_by_user.items():
        if user_msgs[uid] < 5000:
            continue
        total = sum(counts.values())
        rates.append(
            {
                "name": name_of.get(uid, uid),
                "swears": total,
                "messages": user_msgs[uid],
                "per_1000": round(total / user_msgs[uid] * 1000, 1),
                "favourite": counts.most_common(1)[0][0],
                "breakdown": dict(counts.most_common()),
            }
        )
    rates.sort(key=lambda r: -r["per_1000"])

    # A word "belongs" to a year when its share of that year's words is far
    # above its share across the whole decade.
    year_totals = {y: sum(c.values()) for y, c in words_by_year.items()}
    overall = Counter()
    for c in words_by_year.values():
        overall.update(c)
    overall_total = sum(overall.values())

    signature_words = {}
    for year, counts in words_by_year.items():
        scored = []
        for w, n in counts.items():
            if n < 120:
                continue
            share = n / year_totals[year]
            base = overall[w] / overall_total
            if base <= 0:
                continue
            scored.append({"word": w, "count": n, "index": round(share / base, 1)})
        scored.sort(key=lambda s: -s["index"])
        signature_words[str(year)] = scored[:12]

    out = {
        "swear_totals": swear_total.most_common(),
        "swear_by_user": rates,
        "swear_by_year": {
            str(y): {
                "total": sum(c.values()),
                "per_1000": round(sum(c.values()) / year_msgs[y] * 1000, 1),
                "top": c.most_common(4),
            }
            for y, c in sorted(swear_by_year.items())
        },
        "swear_by_channel": {
            ch: {"total": sum(c.values()), "top": c.most_common(3)}
            for ch, c in sorted(
                swear_by_channel.items(), key=lambda kv: -sum(kv[1].values())
            )[:12]
        },
        "sweariest_messages": sorted(
            sweariest_msgs, key=lambda m: -m["swears"]
        )[:20],
        "first_use": {k: v for k, v in sorted(first_swear.items())},
        "signature_words_by_year": signature_words,
        "top_message_by_year": {str(y): m for y, m in sorted(top_msg_by_year.items())},
        "busiest_day_by_year": {
            str(y): list(c.most_common(1)[0]) for y, c in sorted(day_by_year.items())
        },
        "messages_by_year": {str(y): n for y, n in sorted(year_msgs.items())},
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(
        f"\nWrote {OUT_PATH}: {sum(swear_total.values()):,} swears, "
        f"{len(rates)} rated swearers, {len(signature_words)} years profiled"
    )


if __name__ == "__main__":
    mine()
