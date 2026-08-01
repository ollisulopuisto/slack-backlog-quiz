"""Third mining pass: when did each thing first appear.

Ordering questions need first-seen dates, which neither backlog_summary.json
nor archive_facts.json carry. This pass records, for every Slackbot custom
response and every custom emoji, the date it first shows up in the archive —
so a question can ask which came first without anyone having to remember.

Slackbot responses are messages from USLACKBOT; the *trigger* phrase isn't in
the export, but the response text is, and its first appearance is the day the
response was installed. Custom emoji are dated by their first use as a
reaction, which is a lower bound on when they were created.

    uv run python mine_chronology.py
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
)

OUT_PATH = "archive_chronology.json"
EMOJI_FILE = os.path.join(ARCHIVE_DIR, "emojis.json")

SLACKBOT_UID = "USLACKBOT"

# Slackbot also relays reminders and join notices; those aren't custom
# responses and would drown the real ones.
BOILERPLATE = re.compile(
    r"^(reminder: .*(added by|set by)|<@|you have|here'?s your|this is your)",
    re.I,
)


def _load(fpath):
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def mine():
    channels = load_channels(ARCHIVE_DIR)

    try:
        with open(EMOJI_FILE, "r", encoding="utf-8") as f:
            custom_emoji = set(json.load(f).keys())
    except Exception:
        custom_emoji = set()

    bot_first = {}
    bot_count = Counter()
    bot_channel = {}

    emoji_first = {}
    emoji_count = Counter()

    channel_first = {}

    for _cid, ch_name, fpath in iter_channel_files(ARCHIVE_DIR, channels):
        print(f"  #{ch_name}", flush=True)
        for m in iter_messages(_load(fpath)):
            try:
                ts = float(m.get("ts", 0))
            except (TypeError, ValueError):
                continue
            if ts <= 0:
                continue

            if ch_name not in channel_first or ts < channel_first[ch_name]:
                channel_first[ch_name] = ts

            if m.get("user") == SLACKBOT_UID:
                text = (m.get("text") or "").strip()
                if text and len(text) <= 200 and not BOILERPLATE.match(text):
                    bot_count[text] += 1
                    if text not in bot_first or ts < bot_first[text]:
                        bot_first[text] = ts
                        bot_channel[text] = ch_name

            for r in m.get("reactions") or []:
                name = r.get("name")
                if not name or name not in custom_emoji:
                    continue
                emoji_count[name] += r.get("count", 0)
                if name not in emoji_first or ts < emoji_first[name]:
                    emoji_first[name] = ts

    responses = sorted(
        (
            {
                "text": t,
                "count": bot_count[t],
                "first": _iso(bot_first[t]),
                "channel": bot_channel[t],
            }
            for t in bot_first
            if bot_count[t] >= 5
        ),
        key=lambda r: r["first"],
    )

    emoji = sorted(
        (
            {"name": e, "first": _iso(emoji_first[e]), "count": emoji_count[e]}
            for e in emoji_first
        ),
        key=lambda e: e["first"],
    )

    out = {
        "slackbot_responses_by_date": responses,
        "slackbot_responses_by_use": sorted(
            responses, key=lambda r: -r["count"]
        )[:40],
        "slackbot_distinct": len(bot_count),
        "custom_emoji_by_date": emoji,
        "custom_emoji_total": len(custom_emoji),
        "custom_emoji_seen": len(emoji),
        "channels_by_date": sorted(
            ({"channel": c, "first": _iso(ts)} for c, ts in channel_first.items()),
            key=lambda c: c["first"],
        ),
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(
        f"\nWrote {OUT_PATH}: {len(responses)} Slackbot responses, "
        f"{len(emoji)} dated custom emoji, {len(channel_first)} channels"
    )


if __name__ == "__main__":
    mine()
