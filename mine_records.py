"""Seventh pass: records and time series for the deck's stat screens.

The earlier passes produced distributions bucketed by hour-of-day and by year.
This one adds the things you can only get by looking at the timeline itself:
the busiest sixty minutes the group ever had, the longest it ever went quiet,
how fast a hundred messages can arrive. Plus full monthly and daily series, so
the deck can draw the shape of ten years rather than assert it.

Rolling windows need every timestamp in memory at once. There are ~1.1 million
of them and a float is 8 bytes, so that is single-digit megabytes -- fine, and
much simpler than a streaming approximation.

    uv run python mine_records.py
"""

import json
from bisect import bisect_right
from collections import Counter
from datetime import datetime, timedelta, timezone

from slack_archive import (
    ARCHIVE_DIR,
    iter_channel_files,
    iter_messages,
    load_channels,
    load_users,
)

OUT_PATH = "archive_records.json"
TZ_OFFSET = timedelta(hours=2)

WINDOW_SECONDS = 3600
BURST_SIZE = 100


def _load(fpath):
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _local(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc) + TZ_OFFSET


def mine():
    users = load_users(ARCHIVE_DIR)
    name_of = {uid: u["display_name"] for uid, u in users.items()}
    channels = load_channels(ARCHIVE_DIR)

    stamps = []  # (ts, channel, user)
    months = Counter()
    days = Counter()
    hours = Counter()

    for _cid, ch_name, fpath in iter_channel_files(ARCHIVE_DIR, channels):
        print(f"  #{ch_name}", flush=True)
        for m in iter_messages(_load(fpath)):
            try:
                ts = float(m.get("ts", 0))
            except (TypeError, ValueError):
                continue
            if ts <= 0:
                continue
            stamps.append((ts, ch_name, m["user"]))
            dt = _local(ts)
            months[dt.strftime("%Y-%m")] += 1
            days[dt.strftime("%Y-%m-%d")] += 1
            hours[dt.hour] += 1

    stamps.sort(key=lambda s: s[0])
    times = [s[0] for s in stamps]
    n = len(times)

    # Busiest rolling hour: for each message, how many fall in the hour after it.
    best_window = {"count": 0}
    for i, start in enumerate(times):
        j = bisect_right(times, start + WINDOW_SECONDS)
        count = j - i
        if count > best_window["count"]:
            best_window = {"count": count, "start_index": i, "end_index": j}

    def window_detail(w):
        lo, hi = w["start_index"], w["end_index"]
        seg = stamps[lo:hi]
        who = Counter(name_of.get(u, u) for _t, _c, u in seg)
        where = Counter(c for _t, c, _u in seg)
        return {
            "count": w["count"],
            "start": _local(seg[0][0]).strftime("%-d.%-m.%Y %H:%M"),
            "end": _local(seg[-1][0]).strftime("%H:%M"),
            "date": _local(seg[0][0]).strftime("%-d.%-m.%Y"),
            "top_people": who.most_common(4),
            "top_channels": where.most_common(3),
        }

    # Fastest hundred messages in a row.
    best_burst = {"seconds": None}
    for i in range(n - BURST_SIZE):
        span = times[i + BURST_SIZE - 1] - times[i]
        if best_burst["seconds"] is None or span < best_burst["seconds"]:
            best_burst = {"seconds": span, "index": i}

    burst = {
        "messages": BURST_SIZE,
        "seconds": round(best_burst["seconds"]),
        "when": _local(times[best_burst["index"]]).strftime("%-d.%-m.%Y %H:%M"),
        "channel": Counter(
            c for _t, c, _u in stamps[best_burst["index"] : best_burst["index"] + BURST_SIZE]
        ).most_common(1)[0][0],
    }

    # Longest silence between two consecutive messages anywhere.
    gaps = [(times[i + 1] - times[i], i) for i in range(n - 1)]
    gaps.sort(reverse=True)
    longest_silence = [
        {
            "days": round(g / 86400, 1),
            "from": _local(times[i]).strftime("%-d.%-m.%Y"),
            "to": _local(times[i + 1]).strftime("%-d.%-m.%Y"),
        }
        for g, i in gaps[:5]
    ]

    out = {
        "busiest_hour_window": window_detail(best_window),
        "fastest_burst": burst,
        "longest_silences": longest_silence,
        "by_month": [
            {"month": m, "count": months[m]} for m in sorted(months)
        ],
        "by_day_top": days.most_common(15),
        "by_hour": [{"hour": h, "count": hours[h]} for h in range(24)],
        "by_year": _series_by_year(months),
        "total_messages": n,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(
        f"\nWrote {OUT_PATH}: busiest hour {out['busiest_hour_window']['count']} "
        f"messages, {BURST_SIZE} in {burst['seconds']}s, "
        f"{len(out['by_month'])} months"
    )


def _series_by_year(months):
    per_year = Counter()
    for m, c in months.items():
        per_year[m[:4]] += c
    return [{"year": y, "count": per_year[y]} for y in sorted(per_year)]


if __name__ == "__main__":
    mine()
