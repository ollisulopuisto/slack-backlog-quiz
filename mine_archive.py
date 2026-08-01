"""Second-pass archive mining for the question bank.

`parser.py` already produces backlog_summary.json: totals, per-user message
counts and the top-reacted messages. Everything easy to ask about that data is
already in the bank, so this pass goes after the dimensions nobody has mined
yet — when people post, how channels live and die, who *gives* reactions rather
than collects them, how long messages run, and what gets uploaded.

One full pass over the archive (~41 GB), writing archive_facts.json. Run it
before regenerating the bank:

    uv run python mine_archive.py
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

OUT_PATH = "archive_facts.json"

# Helsinki is UTC+2/+3. The archive stores epoch seconds; for "what hour do
# these people post at" a fixed +2 is close enough and avoids a tz dependency,
# but it means summer hours read one lower than the wall clock.
TZ_OFFSET_HOURS = 2

WORD_RE = re.compile(r"[a-zäöåA-ZÄÖÅ]{4,}", re.UNICODE)

# Words that would win any frequency contest without saying anything.
STOPWORDS = frozenset(
    """
    että olla ollut oli ovat mutta niin sitten koska vain myös kuin jossa
    tämä tuo joka mikä kaikki jotain jonkin siitä siihen tässä tuossa
    minä sinä hän mekin nyt vielä ihan just tosi aika sellainen semmoinen
    https http www com fi jpg png here channel
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
    channels = load_channels(ARCHIVE_DIR)
    name_of = {uid: u["display_name"] for uid, u in users.items()}

    hour_counts = Counter()
    weekday_counts = Counter()
    year_counts = Counter()
    month_counts = Counter()

    channel_first_ts = {}
    channel_last_ts = {}
    channel_msg_count = Counter()
    channel_user_counts = defaultdict(Counter)

    reactions_given = Counter()
    emoji_counts = Counter()
    emoji_by_user = defaultdict(Counter)

    user_char_total = Counter()
    user_msg_count = Counter()
    user_night_msgs = Counter()
    user_first_ts = {}
    user_thread_replies = Counter()

    file_types = Counter()
    file_uploaders = Counter()
    total_files = 0

    edited_count = 0
    thread_parent_replies = []
    longest_msgs = []
    word_counts = Counter()
    at_channel_uses = Counter()

    total_messages = 0

    for _cid, ch_name, fpath in iter_channel_files(ARCHIVE_DIR, channels):
        size_mb = os.path.getsize(fpath) / (1024 * 1024)
        print(f"  #{ch_name} ({size_mb:.1f} MB)", flush=True)

        for m in iter_messages(_load(fpath)):
            uid = m["user"]

            try:
                ts = float(m.get("ts", 0))
            except (TypeError, ValueError):
                continue
            if ts <= 0:
                continue

            total_messages += 1
            channel_msg_count[ch_name] += 1
            channel_user_counts[ch_name][uid] += 1
            user_msg_count[uid] += 1

            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            local_hour = (dt.hour + TZ_OFFSET_HOURS) % 24
            hour_counts[local_hour] += 1
            weekday_counts[dt.weekday()] += 1
            year_counts[dt.year] += 1
            month_counts[f"{dt.year}-{dt.month:02d}"] += 1
            if local_hour in (2, 3, 4, 5):
                user_night_msgs[uid] += 1

            if ch_name not in channel_first_ts or ts < channel_first_ts[ch_name]:
                channel_first_ts[ch_name] = ts
            if ch_name not in channel_last_ts or ts > channel_last_ts[ch_name]:
                channel_last_ts[ch_name] = ts
            if uid not in user_first_ts or ts < user_first_ts[uid]:
                user_first_ts[uid] = ts

            text = m.get("text") or ""
            user_char_total[uid] += len(text)
            if len(text) > 400:
                longest_msgs.append(
                    {
                        "chars": len(text),
                        "user": name_of.get(uid, uid),
                        "channel": ch_name,
                        "year": dt.year,
                        "text": text[:400],
                    }
                )
            if "<!channel>" in text or "<!here>" in text:
                at_channel_uses[uid] += 1
            if m.get("edited"):
                edited_count += 1

            for w in WORD_RE.findall(text.lower()):
                if w not in STOPWORDS:
                    word_counts[w] += 1

            for r in m.get("reactions") or []:
                emoji = r.get("name")
                if not emoji:
                    continue
                emoji_counts[emoji] += r.get("count", 0)
                emoji_by_user[uid][emoji] += r.get("count", 0)
                for giver in r.get("users") or []:
                    reactions_given[giver] += 1

            for f in m.get("files") or []:
                if not isinstance(f, dict):
                    continue
                total_files += 1
                file_types[(f.get("filetype") or "?").lower()] += 1
                file_uploaders[f.get("user") or uid] += 1

            replies = m.get("reply_count") or 0
            if replies:
                thread_parent_replies.append(
                    {
                        "replies": replies,
                        "user": name_of.get(uid, uid),
                        "channel": ch_name,
                        "year": dt.year,
                        "text": text[:220],
                    }
                )
                user_thread_replies[uid] += replies

    def named(counter, n=25):
        return [
            {"name": name_of.get(uid, uid), "count": c}
            for uid, c in counter.most_common(n)
        ]

    def iso(ts):
        return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")

    channel_life = sorted(
        (
            {
                "channel": ch,
                "messages": channel_msg_count[ch],
                "first": iso(channel_first_ts[ch]),
                "last": iso(channel_last_ts[ch]),
                "days": round((channel_last_ts[ch] - channel_first_ts[ch]) / 86400),
                "top_poster": name_of.get(
                    channel_user_counts[ch].most_common(1)[0][0], "?"
                )
                if channel_user_counts[ch]
                else "?",
            }
            for ch in channel_msg_count
        ),
        key=lambda c: -c["messages"],
    )

    avg_len = [
        {
            "name": name_of.get(uid, uid),
            "avg_chars": round(user_char_total[uid] / user_msg_count[uid], 1),
            "messages": user_msg_count[uid],
        }
        for uid in user_msg_count
        if user_msg_count[uid] >= 500
    ]
    avg_len.sort(key=lambda u: -u["avg_chars"])

    facts = {
        "generated_from": ARCHIVE_DIR,
        "total_messages": total_messages,
        "hours": {str(h): hour_counts[h] for h in range(24)},
        "weekdays": {str(d): weekday_counts[d] for d in range(7)},
        "years": dict(sorted(year_counts.items())),
        "busiest_months": month_counts.most_common(15),
        "channels": channel_life,
        "channel_count": len(channel_life),
        "reactions_given": named(reactions_given),
        "top_emoji": emoji_counts.most_common(40),
        "signature_emoji": {
            name_of.get(uid, uid): c.most_common(3)
            for uid, c in emoji_by_user.items()
            if sum(c.values()) >= 200
        },
        "avg_message_length": avg_len,
        "night_owls": named(user_night_msgs),
        "at_channel": named(at_channel_uses),
        "thread_replies_by_user": named(user_thread_replies),
        "biggest_threads": sorted(
            thread_parent_replies, key=lambda t: -t["replies"]
        )[:25],
        "longest_messages": sorted(longest_msgs, key=lambda m: -m["chars"])[:15],
        "file_types": file_types.most_common(15),
        "file_uploaders": named(file_uploaders),
        "total_files": total_files,
        "edited_messages": edited_count,
        "top_words": word_counts.most_common(60),
        "first_joiners": [
            {"name": name_of.get(uid, uid), "first": iso(ts)}
            for uid, ts in sorted(user_first_ts.items(), key=lambda kv: kv[1])[:15]
        ],
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(facts, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {OUT_PATH}: {total_messages:,} messages, "
          f"{len(channel_life)} channels")


if __name__ == "__main__":
    mine()
