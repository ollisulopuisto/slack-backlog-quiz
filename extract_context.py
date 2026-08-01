"""Pulls the messages around a quiz answer straight out of the archive.

A question that quotes a real message can show where it came from: the message
itself plus the conversation on either side. Reading it from the JSON rather
than screenshotting the HTML archive means the context ships inside the deck,
works with the NAS unplugged, and stays selectable text.

    uv run python extract_context.py <channel> <ts> [--before N] [--after N]
"""

import argparse
import json
import os
import re
from datetime import datetime, timezone

from slack_archive import (
    ARCHIVE_DIR,
    load_channel_name_to_id,
    load_users,
)

# Slack markup that would render as noise: <@U123|name>, <http://x|label>,
# <!channel>. Keep the human-readable half.
MENTION_RE = re.compile(r"<@([A-Z0-9]+)(?:\|([^>]*))?>")
LINK_RE = re.compile(r"<(https?://[^|>]+)(?:\|([^>]*))?>")
BANG_RE = re.compile(r"<!(channel|here|everyone)>")


def humanize(text, name_of):
    def mention(m):
        uid, label = m.group(1), m.group(2)
        return "@" + (label or name_of.get(uid, uid))

    text = MENTION_RE.sub(mention, text or "")
    text = LINK_RE.sub(lambda m: m.group(2) or m.group(1), text)
    text = BANG_RE.sub(lambda m: "@" + m.group(1), text)
    return text


def _thread_replies(parent, name_of, limit):
    """Replies live nested inside their parent, not in the channel array."""
    out = []
    for r in (parent.get("replies") or [])[:limit]:
        if not r.get("ts") or r.get("ts") == parent.get("ts"):
            continue
        when = datetime.fromtimestamp(float(r["ts"]), tz=timezone.utc)
        out.append(
            {
                "author": name_of.get(r.get("user"), r.get("user")),
                "time": when.strftime("%H:%M"),
                "date": when.strftime("%-d.%-m.%Y"),
                "text": humanize(r.get("text"), name_of),
                "reactions": [],
                "isAnswer": False,
                "inThread": True,
            }
        )
    return out


def extract(channel, ts, before=4, after=4, thread=6):
    users = load_users(ARCHIVE_DIR)
    name_of = {uid: u["display_name"] for uid, u in users.items()}
    cid = load_channel_name_to_id(ARCHIVE_DIR).get(channel)
    if not cid:
        raise SystemExit(f"unknown channel #{channel}")

    path = os.path.join(ARCHIVE_DIR, f"{cid}.json")
    with open(path, "r", encoding="utf-8") as f:
        msgs = [
            m
            for m in json.load(f)
            if isinstance(m, dict) and m.get("type") == "message" and m.get("user")
        ]
    msgs.sort(key=lambda m: float(m.get("ts", 0)))

    # A quoted message may itself be a threaded reply, and those are not in the
    # channel array at all -- they hang off their parent. Look there too before
    # falling back to the nearest top-level message.
    wanted = f"{float(ts):.6f}"
    reply_parent = None
    for m in msgs:
        for r in m.get("replies") or []:
            if r.get("ts") and f"{float(r['ts']):.6f}" == wanted:
                reply_parent = m
                break
        if reply_parent:
            break

    if reply_parent is not None:
        target = msgs.index(reply_parent)
    else:
        target = min(
            range(len(msgs)),
            key=lambda i: abs(float(msgs[i].get("ts", 0)) - float(ts)),
        )
    lo = max(0, target - before)
    hi = min(len(msgs), target + after + 1)

    out = []
    for i in range(lo, hi):
        m = msgs[i]
        when = datetime.fromtimestamp(float(m["ts"]), tz=timezone.utc)
        out.append(
            {
                "author": name_of.get(m["user"], m["user"]),
                "time": when.strftime("%H:%M"),
                "date": when.strftime("%-d.%-m.%Y"),
                "text": humanize(m.get("text"), name_of),
                "reactions": [
                    {"name": r.get("name"), "count": r.get("count", 0)}
                    for r in (m.get("reactions") or [])
                ],
                "isAnswer": i == target,
                "hasFile": bool(m.get("files")),
            }
        )

    parent = msgs[target]
    replies = _thread_replies(parent, name_of, thread) if thread else []
    if replies:
        # Show the thread under its parent rather than the channel chatter that
        # happened to follow it -- the conversation continued in the thread.
        out = [m for m in out if not (m["isAnswer"] is False and out.index(m) > (target - lo))]

    return {
        "channel": channel,
        "ts": str(parent.get("ts")),
        "replyCount": parent.get("reply_count") or 0,
        "threadReplies": replies,
        "date": out[target - lo]["date"],
        "archivePath": f"html/{cid}-N.html#{msgs[target].get('ts')}",
        "messages": out,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("channel")
    ap.add_argument("ts")
    ap.add_argument("--before", type=int, default=4)
    ap.add_argument("--after", type=int, default=4)
    ap.add_argument("--thread", type=int, default=6)
    args = ap.parse_args()
    print(
        json.dumps(
            extract(args.channel, args.ts, args.before, args.after, args.thread),
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
