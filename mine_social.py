"""Fourth mining pass: who does what to whom.

The first three passes counted things. This one counts *relationships* — who
reacts to whose messages, which word each person overuses, how the emoji
fashion shifted year by year, and which single day the whole group lost its
mind. Those make better questions than another leaderboard, because everyone
in the room has an opinion about the answer before it appears.

    uv run python mine_social.py
"""

import json
import os
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

OUT_PATH = "archive_social.json"

# Words worth attributing to a person. Picked from the top-60 frequency list,
# minus anything that turned out to come from pasted URLs (status, twitter,
# html) rather than from anyone actually typing it.
SIGNATURE_WORDS = [
    "vittu",
    "vitun",
    "siis",
    "kyllä",
    "ehkä",
    "joku",
    "hyvä",
    "varmaan",
    "aivan",
    "tänään",
    "paska",
    "saatana",
    "juuri",
    "todella",
    "oikeasti",
]

WORD_RE = re.compile(r"[a-zäöå]+", re.UNICODE)
URL_RE = re.compile(r"<https?://[^>]*>|https?://\S+")


def _load(fpath):
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def mine():
    users = load_users(ARCHIVE_DIR)
    channels = load_channels(ARCHIVE_DIR)
    name_of = {uid: u["display_name"] for uid, u in users.items()}

    reaction_graph = Counter()  # (reactor_uid, author_uid) -> n
    self_reactions = Counter()
    word_by_user = defaultdict(Counter)
    user_msgs = Counter()
    emoji_by_year = defaultdict(Counter)
    day_counts = Counter()
    emoji_by_channel = defaultdict(Counter)
    user_first_msg = {}
    question_marks = Counter()
    caps_msgs = Counter()
    link_posts = Counter()

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
            day_counts[dt.strftime("%Y-%m-%d")] += 1
            user_msgs[uid] += 1

            raw = m.get("text") or ""
            if uid not in user_first_msg or ts < user_first_msg[uid]["ts"]:
                user_first_msg[uid] = {
                    "ts": ts,
                    "date": dt.strftime("%Y-%m-%d"),
                    "channel": ch_name,
                    "text": raw[:160],
                }

            if URL_RE.search(raw):
                link_posts[uid] += 1
            # Strip URLs before counting words, so a pasted link can't make
            # someone the group's biggest user of "status".
            text = URL_RE.sub(" ", raw).lower()
            if "?" in raw:
                question_marks[uid] += 1
            letters = [c for c in raw if c.isalpha()]
            if len(letters) >= 8 and all(c.isupper() for c in letters):
                caps_msgs[uid] += 1

            words = set(WORD_RE.findall(text))
            for w in SIGNATURE_WORDS:
                if w in words:
                    word_by_user[uid][w] += 1

            for r in m.get("reactions") or []:
                name = r.get("name")
                if not name:
                    continue
                emoji_by_year[dt.year][name] += r.get("count", 0)
                emoji_by_channel[ch_name][name] += r.get("count", 0)
                for giver in r.get("users") or []:
                    if giver == uid:
                        self_reactions[uid] += 1
                    else:
                        reaction_graph[(giver, uid)] += 1

    def nm(uid):
        return name_of.get(uid, uid)

    # Who reacts to whom, as a readable top list.
    pairs = [
        {"from": nm(a), "to": nm(b), "count": c}
        for (a, b), c in reaction_graph.most_common(40)
    ]

    # Each person's most disproportionately used word: their rate against the
    # group's rate, so "siis" doesn't win for everyone just by being common.
    total_msgs = sum(user_msgs.values())
    group_rate = {
        w: sum(word_by_user[u][w] for u in word_by_user) / total_msgs
        for w in SIGNATURE_WORDS
    }
    signature = {}
    for uid, counts in word_by_user.items():
        if user_msgs[uid] < 5000:
            continue
        scored = [
            (w, (counts[w] / user_msgs[uid]) / group_rate[w], counts[w])
            for w in SIGNATURE_WORDS
            if group_rate[w] > 0 and counts[w] >= 50
        ]
        scored.sort(key=lambda s: -s[1])
        if scored:
            signature[nm(uid)] = [
                {"word": w, "index": round(idx, 2), "count": n}
                for w, idx, n in scored[:3]
            ]

    out = {
        "reaction_pairs": pairs,
        "self_reactions": [
            {"name": nm(u), "count": c} for u, c in self_reactions.most_common(10)
        ],
        "signature_words": signature,
        "word_totals_by_user": {
            nm(u): dict(c.most_common()) for u, c in word_by_user.items()
            if user_msgs[u] >= 5000
        },
        "emoji_by_year": {
            str(y): emoji_by_year[y].most_common(5) for y in sorted(emoji_by_year)
        },
        "busiest_days": day_counts.most_common(20),
        "quietest_active_days": sorted(
            (d for d in day_counts.items() if d[1] > 0), key=lambda d: d[1]
        )[:10],
        "emoji_by_channel": {
            ch: c.most_common(3)
            for ch, c in emoji_by_channel.items()
            if sum(c.values()) >= 500
        },
        "first_messages": sorted(
            (
                {
                    "name": nm(u),
                    "date": v["date"],
                    "channel": v["channel"],
                    "text": v["text"],
                }
                for u, v in user_first_msg.items()
                if user_msgs[u] >= 1000
            ),
            key=lambda v: v["date"],
        ),
        "question_askers": [
            {"name": nm(u), "count": c, "pct": round(c / user_msgs[u] * 100, 1)}
            for u, c in question_marks.most_common(15)
            if user_msgs[u] >= 5000
        ],
        "shouters": [
            {"name": nm(u), "count": c} for u, c in caps_msgs.most_common(12)
        ],
        "link_posters": [
            {"name": nm(u), "count": c} for u, c in link_posts.most_common(12)
        ],
        "total_days_with_messages": len(day_counts),
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(
        f"\nWrote {OUT_PATH}: {len(pairs)} reaction pairs, "
        f"{len(signature)} signature-word profiles, "
        f"{len(day_counts)} active days"
    )


if __name__ == "__main__":
    mine()
