"""Bakes the conversation around each quoted message into the question.

A question that quotes a real message can show where it came from: the message
itself with a few either side, so the room sees what was actually being talked
about. `extract_context.py` can do that one message at a time, but it reloads
the whole channel dump per call and #general is 700 MB, so this groups the
work by channel and reads each one once.

The context ends up inside the question, which is the point: no NAS at quiz
time, no 500 kB page renders, and the text stays selectable.

Run after bank_generator.py:

    uv run python build_source_context.py
"""

import json
import os
from collections import defaultdict
from datetime import datetime, timezone

from extract_context import humanize
from quiz_files import QUESTION_BANK_PATHS, QUIZ_DATA_PATHS, write_json_copies
from slack_archive import (
    ARCHIVE_DIR,
    iter_messages,
    load_channel_name_to_id,
    load_users,
)

BEFORE = 3
AFTER = 4
THREAD = 5


def _context_for(msgs, target_index, name_of, cid):
    lo = max(0, target_index - BEFORE)
    hi = min(len(msgs), target_index + AFTER + 1)
    parent = msgs[target_index]

    def render(m, in_thread=False):
        when = datetime.fromtimestamp(float(m["ts"]), tz=timezone.utc)
        return {
            "author": name_of.get(m.get("user"), m.get("user")),
            "time": when.strftime("%H.%M"),
            "text": humanize(m.get("text"), name_of),
            "isAnswer": not in_thread and m["ts"] == parent["ts"],
            "inThread": in_thread,
            "reactions": [
                {"name": r.get("name"), "count": r.get("count", 0)}
                for r in (m.get("reactions") or [])
            ],
        }

    messages = [render(msgs[i]) for i in range(lo, hi)]

    # Replies hang off the parent rather than sitting in the channel array, so
    # a quote that started a thread would otherwise show none of the answers.
    replies = [
        render(r, in_thread=True)
        for r in (parent.get("replies") or [])[:THREAD]
        if r.get("ts") != parent.get("ts") and humanize(r.get("text"), {})
    ]
    if replies:
        # The thread is where the conversation went, so drop the channel
        # chatter that merely happened next.
        messages = [m for m in messages if m["isAnswer"] or messages.index(m) <= target_index - lo]

    when = datetime.fromtimestamp(float(parent["ts"]), tz=timezone.utc)
    return {
        "channel": None,  # filled in by the caller
        "date": when.strftime("%-d.%-m.%Y"),
        "ts": str(parent["ts"]),
        "replyCount": parent.get("reply_count") or 0,
        "messages": messages,
        "threadReplies": replies,
    }


def attach(items):
    """Adds `source` to every item carrying sourceChannel + sourceTs."""
    name_of = {
        uid: u["display_name"] for uid, u in load_users(ARCHIVE_DIR).items()
    }
    by_channel = defaultdict(list)
    for q in items:
        # Either a timestamp (the quote questions carry one) or the text
        # itself: the stats miners recorded what a message said but never when
        # it was said, and re-mining for a timestamp costs a full pass over
        # 41 GB. The text is unique enough.
        if q.get("sourceChannel") and (q.get("sourceTs") or q.get("sourceText")):
            by_channel[q["sourceChannel"]].append(q)

    name_to_id = load_channel_name_to_id(ARCHIVE_DIR)
    attached = 0
    for channel, questions in by_channel.items():
        cid = name_to_id.get(channel)
        path = os.path.join(ARCHIVE_DIR, f"{cid}.json") if cid else None
        if not path or not os.path.exists(path):
            print(f"  #{channel}: dump missing, skipped {len(questions)}")
            continue

        print(f"  #{channel} ({len(questions)} kysymystä)", flush=True)
        with open(path, encoding="utf-8") as f:
            msgs = list(iter_messages(json.load(f)))
        msgs.sort(key=lambda m: float(m.get("ts", 0)))
        index = {f"{float(m['ts']):.6f}": i for i, m in enumerate(msgs)}
        # First 60 characters are plenty to identify a message and survive the
        # truncation the miners applied when they stored it.
        by_text = {}
        for i, m in enumerate(msgs):
            head = (m.get("text") or "")[:60]
            if head and head not in by_text:
                by_text[head] = i

        for q in questions:
            if q.get("sourceTs"):
                i = index.get(f"{float(q['sourceTs']):.6f}")
            else:
                i = by_text.get((q.get("sourceText") or "")[:60])
            if i is None:
                print(f"    {q['id']}: lähdeviestiä ei löytynyt")
                continue
            ctx = _context_for(msgs, i, name_of, cid)
            ctx["channel"] = channel
            q["source"] = ctx
            attached += 1
    return attached


QUOTE_RE = __import__("re").compile(r'[”"«]([^”"»]{12,})[”"»]')


def borrow_by_quote(targets, donors):
    """Copies context onto questions that quote the same message.

    The deck's wording drifted from the bank's -- "Kuka julisti vuonna 2021"
    against "Kuka kirjoitti kanavalle #general vuonna 2021" -- so matching on
    the question text finds nothing. The quotation inside it is the same
    message either way, and that is what identifies it.
    """
    quotes = {}
    exact = {}
    for q in donors:
        if not q.get("source"):
            continue
        exact[(q.get("question") or "").strip().lower()] = q["source"]
        for m in QUOTE_RE.finditer(q.get("question") or ""):
            quotes[m.group(1).strip().lower()[:60]] = q["source"]

    n = 0
    for q in targets:
        if q.get("source"):
            continue
        # A question added to the deck from the bank keeps its wording, so an
        # exact match covers everything picked in the editor. The quote match
        # is the fallback for the older deck, whose phrasing had drifted.
        src = exact.get((q.get("question") or "").strip().lower())
        if not src:
            for m in QUOTE_RE.finditer(q.get("question") or ""):
                src = quotes.get(m.group(1).strip().lower()[:60])
                if src:
                    break
        if src:
            q["source"] = src
            n += 1
    return n


def main():
    for paths in (QUESTION_BANK_PATHS, QUIZ_DATA_PATHS):
        first = paths[0]
        if not os.path.exists(first):
            continue
        with open(first, encoding="utf-8") as f:
            items = json.load(f)
        n = attach(items)
        if paths is QUIZ_DATA_PATHS:
            with open(QUESTION_BANK_PATHS[0], encoding="utf-8") as bf:
                n += borrow_by_quote(items, json.load(bf))
        write_json_copies(items, paths)
        print(f"{first}: {n} lähdekontekstia liitetty\n")


if __name__ == "__main__":
    main()
