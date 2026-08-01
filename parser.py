import json
import os
from collections import Counter
from datetime import datetime

from slack_archive import (
    ARCHIVE_DIR,
    iter_channel_files,
    iter_messages,
    load_channels,
    load_users,
)


def analyze_slack_archive(archive_dir):
    users = load_users(archive_dir)
    channels = load_channels(archive_dir)

    user_msg_count = Counter()
    user_reaction_received = Counter()
    user_reaction_given = Counter()
    emoji_counts = Counter()

    reacted_messages = []

    total_messages = 0
    min_ts = float("inf")
    max_ts = 0.0

    print("Analyzing Slack archive data...")

    for _ch_id, ch_name, fpath in iter_channel_files(archive_dir, channels):
        print(
            f"Processing channel: #{ch_name} ({os.path.getsize(fpath) / (1024 * 1024):.1f} MB)"
        )
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                msgs = json.load(f)
        except Exception as e:
            print(f"Error loading {fpath}: {e}")
            continue

        for m in iter_messages(msgs):
            user = m["user"]

            ts = float(m.get("ts", 0))
            if ts > 0:
                if ts < min_ts:
                    min_ts = ts
                if ts > max_ts:
                    max_ts = ts

            total_messages += 1
            user_msg_count[user] += 1

            reactions = m.get("reactions", [])
            total_reacts = 0
            for r in reactions:
                rcount = r.get("count", 0)
                emoji_name = r.get("name")
                emoji_counts[emoji_name] += rcount
                total_reacts += rcount

                for ruser in r.get("users", []):
                    user_reaction_given[ruser] += 1

            if total_reacts > 0:
                user_reaction_received[user] += total_reacts
                text = m.get("text", "").strip()
                if text and len(text) > 3:
                    reacted_messages.append(
                        {
                            "user": user,
                            "user_name": users.get(user, {}).get("display_name", user),
                            "channel": ch_name,
                            "text": text,
                            "react_count": total_reacts,
                            "reactions": [
                                f":{r['name']}:({r['count']})" for r in reactions
                            ],
                            "ts": ts,
                            "date": datetime.fromtimestamp(ts).strftime(
                                "%Y-%m-%d %H:%M"
                            ),
                        }
                    )
    # Sort top reacted messages
    reacted_messages.sort(key=lambda x: x["react_count"], reverse=True)

    print("\n" + "=" * 50)
    print("SLACK ARCHIVE SUMMARY REPORT")
    print("=" * 50)
    print(f"Total Messages Analyzed: {total_messages}")
    if min_ts != float("inf"):
        print(
            f"Date Range: {datetime.fromtimestamp(min_ts).strftime('%Y-%m-%d')} -> {datetime.fromtimestamp(max_ts).strftime('%Y-%m-%d')}"
        )

    print("\n--- TOP MEMBERS BY MESSAGE COUNT ---")
    for uid, count in user_msg_count.most_common(15):
        uname = users.get(uid, {}).get("display_name", uid)
        print(f"  {uname:25s} ({uid}): {count:6d} messages")

    print("\n--- TOP EMOJIS USED IN REACTIONS ---")
    for em, count in emoji_counts.most_common(15):
        print(f"  :{em}: {count}")

    print("\n--- TOP 10 MOST REACTED MESSAGES ---")
    for i, m in enumerate(reacted_messages[:10], 1):
        print(
            f"\n#{i} [{m['date']}] #{m['channel']} | {m['user_name']} ({m['react_count']} reacts: {', '.join(m['reactions'])})"
        )
        print(f'    "{m["text"][:150]}"')

    # Export a summary JSON for quiz generation
    summary = {
        "total_messages": total_messages,
        "date_start": datetime.fromtimestamp(min_ts).strftime("%Y-%m-%d")
        if min_ts != float("inf")
        else "",
        "date_end": datetime.fromtimestamp(max_ts).strftime("%Y-%m-%d")
        if max_ts != float("inf")
        else "",
        "users": users,
        "user_msg_count": {
            users.get(k, {}).get("display_name", k): v
            for k, v in user_msg_count.items()
        },
        "top_reacted_messages": reacted_messages[:100],
    }

    with open("backlog_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("\nSaved summary to backlog_summary.json")


if __name__ == "__main__":
    analyze_slack_archive(ARCHIVE_DIR)
