"""Fifth pass: where the archive is missing.

The export is a backup of a backup, and it has holes -- stretches with no
messages at all that are too long and too abrupt to be quiet periods. The quiz
opens by saying so, and a claim like that should come with numbers.

Records one count per calendar day, then reports every run of consecutive days
with nothing in them.

    uv run python mine_gaps.py
"""

import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone

from slack_archive import (
    ARCHIVE_DIR,
    iter_channel_files,
    iter_messages,
    load_channels,
)

OUT_PATH = "archive_gaps.json"


def mine():
    channels = load_channels(ARCHIVE_DIR)
    days = Counter()

    for _cid, ch_name, fpath in iter_channel_files(ARCHIVE_DIR, channels):
        print(f"  #{ch_name}", flush=True)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                msgs = json.load(f)
        except Exception:
            continue
        if not isinstance(msgs, list):
            continue
        for m in iter_messages(msgs):
            try:
                ts = float(m.get("ts", 0))
            except (TypeError, ValueError):
                continue
            if ts > 0:
                days[datetime.fromtimestamp(ts, tz=timezone.utc).date()] += 1

    first, last = min(days), max(days)
    span = (last - first).days + 1

    gaps = []
    run_start = None
    d = first
    while d <= last:
        if days[d] == 0:
            if run_start is None:
                run_start = d
        else:
            if run_start is not None:
                gaps.append(
                    {
                        "from": run_start.isoformat(),
                        "to": (d - timedelta(days=1)).isoformat(),
                        "days": (d - run_start).days,
                    }
                )
                run_start = None
        d += timedelta(days=1)

    gaps.sort(key=lambda g: -g["days"])
    silent = sum(g["days"] for g in gaps)

    out = {
        "first_day": first.isoformat(),
        "last_day": last.isoformat(),
        "span_days": span,
        "days_with_messages": len(days),
        "silent_days": silent,
        "gap_count": len(gaps),
        "longest_gaps": gaps[:25],
        "gaps_over_7_days": [g for g in gaps if g["days"] >= 7],
        "messages_per_year": dict(
            sorted(Counter(d.year for d in days for _ in range(days[d])).items())
        ),
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(
        f"\nWrote {OUT_PATH}: {span} day span, {len(days)} with messages, "
        f"{silent} silent across {len(gaps)} gaps"
    )


if __name__ == "__main__":
    mine()
