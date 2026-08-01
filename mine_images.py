"""Eighth pass: images with everything the quiz can ask about them.

An image on its own is only good for "which channel was this in". The
interesting questions need the message around it -- who posted it, what it
collected, what the first person to reply said -- so this records all of that
alongside the file and copies the picture into public/quiz_images.

Only images that earned a reaction or a reply are kept. A photo nobody
responded to makes a question nobody can answer.

    uv run python mine_images.py [--limit 60]
"""

import argparse
import json
import os
import re
import shutil

from PIL import Image
from datetime import datetime, timezone

from slack_archive import (
    ARCHIVE_DIR,
    FILES_DIR,
    iter_channel_files,
    iter_messages,
    load_channels,
    load_users,
)

OUT_PATH = "image_catalog.json"
#: Every candidate, so the ranking can be retuned without another 7-minute
#: pass over the archive. Not committed -- it names file paths on the NAS.
CANDIDATES_PATH = "image_candidates.json"
PUBLIC_DIR = os.path.join("public", "quiz_images")

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_BYTES = 30 * 1024 * 1024  # the source may be huge; the copy will not be
MAX_EDGE = 1600  # a projector is 1920 wide and the picture sits inside a panel

MENTION_RE = re.compile(r"<@([A-Z0-9]+)(?:\|([^>]*))?>")
LINK_RE = re.compile(r"<(https?://[^|>]+)(?:\|([^>]*))?>")


def humanize(text, name_of):
    text = MENTION_RE.sub(
        lambda m: "@" + (m.group(2) or name_of.get(m.group(1), m.group(1))), text or ""
    )
    return LINK_RE.sub(lambda m: m.group(2) or m.group(1), text).strip()


def _load(fpath):
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


#: channel id -> {file_id: path}. Listing the upload folder once per channel
#: rather than once per file: #general holds thousands of them, and over SMB
#: the per-file scan never finished.
_FILE_INDEX = {}


def channel_files(channel_id):
    if channel_id in _FILE_INDEX:
        return _FILE_INDEX[channel_id]
    folder = os.path.join(FILES_DIR, channel_id)
    index = {}
    if os.path.isdir(folder):
        for name in os.listdir(folder):
            stem, ext = os.path.splitext(name)
            if ext.lower() in IMAGE_EXTS:
                index[stem] = os.path.join(folder, name)
    _FILE_INDEX[channel_id] = index
    return index


def find_file(channel_id, file_id):
    """The archiver stores uploads under html/files/<channel>/<file_id>.<ext>."""
    return channel_files(channel_id).get(file_id)


def score(i):
    """How hard a picture landed.

    Distinct reactors dominate: eight reactions from eight people means the
    room responded, eight from two means two people spammed emoji. Raw
    reactions still count, and replies are a modest bonus rather than the whole
    ranking -- weighting them heavily put pictures with forty replies and zero
    reactions at the top, which are threads that happen to contain an image
    rather than pictures anybody reacted to.
    """
    return (
        i["reactorCount"] * 10
        + i["reactionTotal"] * 2
        + min(i["replyCount"], 10)
        + i["distinctEmoji"]
    )


def rank(found):
    """Best first, dropping anything nobody really responded to.

    One message can carry several attachments, and each would otherwise become
    its own near-identical question -- same poster, same caption, same
    reactions, different crop. Only the first survives.
    """
    good = [
        i
        for i in found
        if i["reactorCount"] >= 2 or i["reactionTotal"] >= 4 or i["replyCount"] >= 10
    ]
    good.sort(key=lambda i: -score(i))

    seen = set()
    unique = []
    for i in good:
        key = (i["channel"], i["poster"], i["date"], i["caption"], i["reactionTotal"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(i)
    return unique


def mine(limit, per_channel_cap, channel_reserve, from_cache=False):
    users = load_users(ARCHIVE_DIR)
    name_of = {uid: u["display_name"] for uid, u in users.items()}
    channels = load_channels(ARCHIVE_DIR)

    if from_cache and os.path.exists(CANDIDATES_PATH):
        with open(CANDIDATES_PATH, encoding="utf-8") as f:
            found = json.load(f)
        print(f"  {len(found)} kandidaattia välimuistista")
        found = rank(found)
        return _select_and_copy(found, limit, per_channel_cap, channel_reserve)

    found = []
    for cid, ch_name, fpath in iter_channel_files(ARCHIVE_DIR, channels):
        print(f"  #{ch_name}", flush=True)
        for m in iter_messages(_load(fpath)):
            files = [f for f in (m.get("files") or []) if isinstance(f, dict)]
            if not files:
                continue

            reactions = m.get("reactions") or []
            react_total = sum(r.get("count", 0) for r in reactions)
            # Distinct people who reacted. Eight reactions from eight people
            # means the picture landed with the room; eight from two means two
            # people spammed emoji at it. The first makes a better question.
            reactors = {u for r in reactions for u in (r.get("users") or [])}
            replies = [
                r for r in (m.get("replies") or []) if r.get("ts") != m.get("ts")
            ]
            # Nobody responded, so there is nothing to ask.
            if react_total == 0 and not replies:
                continue

            for f in files:
                fid = f.get("id")
                if not fid or (f.get("filetype") or "").lower() not in {
                    e.lstrip(".") for e in IMAGE_EXTS
                }:
                    continue
                src = find_file(cid, fid)
                if not src or os.path.getsize(src) > MAX_BYTES:
                    continue

                ts = float(m.get("ts", 0))
                dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                found.append(
                    {
                        "fileId": fid,
                        "src": src,
                        "channel": ch_name,
                        "poster": name_of.get(m["user"], m["user"]),
                        "date": dt.strftime("%-d.%-m.%Y"),
                        "year": dt.year,
                        "caption": humanize(m.get("text"), name_of)[:180],
                        "reactionTotal": react_total,
                        "reactorCount": len(reactors),
                        "distinctEmoji": len(reactions),
                        "reactions": [
                            {"name": r.get("name"), "count": r.get("count", 0)}
                            for r in sorted(
                                reactions, key=lambda r: -r.get("count", 0)
                            )[:6]
                        ],
                        "replyCount": len(replies),
                        "replies": [
                            {
                                "author": name_of.get(r.get("user"), r.get("user")),
                                "text": humanize(r.get("text"), name_of)[:140],
                            }
                            for r in replies[:4]
                            if humanize(r.get("text"), name_of)
                        ],
                    }
                )

    with open(CANDIDATES_PATH, "w", encoding="utf-8") as f:
        json.dump(found, f, ensure_ascii=False)

    return _select_and_copy(rank(found), limit, per_channel_cap, channel_reserve)


def _select_and_copy(found, limit, per_channel_cap, channel_reserve):
    # Quality first: take the best overall, so the good ones from the big
    # channels are not crowded out by whatever a quiet channel happened to
    # have. Then top up with the best from each channel not yet represented,
    # because "which channel was this posted in" needs more than one answer.
    kept = []
    per_channel = {}
    for item in found:
        if len(kept) >= limit - channel_reserve:
            break
        bucket = per_channel.setdefault(item["channel"], [])
        if len(bucket) < per_channel_cap:
            bucket.append(item)
            kept.append(item)

    for item in found:
        if len(kept) >= limit:
            break
        if item["channel"] not in per_channel:
            per_channel[item["channel"]] = [item]
            kept.append(item)

    os.makedirs(PUBLIC_DIR, exist_ok=True)
    catalog = []
    for i, item in enumerate(kept, 1):
        ext = os.path.splitext(item["src"])[1].lower()
        # Deliberately no channel in the filename: the image URL is right
        # there in the page source, so "q001_general.jpg" would hand over the
        # answer to "which channel was this posted in".
        dest_name = f"q{i:03d}{ext}"
        dest = os.path.join(PUBLIC_DIR, dest_name)
        # Slack keeps the original upload, which for a phone photo is 24 MB.
        # Copying those wholesale put 600 MB of pictures in the repo; the deck
        # never shows one larger than the panel it sits in.
        try:
            with Image.open(item["src"]) as im:
                if getattr(im, "is_animated", False):
                    im.seek(0)
                if max(im.size) > MAX_EDGE:
                    im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
                if ext in (".jpg", ".jpeg"):
                    im.convert("RGB").save(dest, "JPEG", quality=82, optimize=True)
                else:
                    im.convert("RGBA").save(dest, "PNG", optimize=True)
        except Exception:
            shutil.copy2(item["src"], dest)
        entry = {k: v for k, v in item.items() if k != "src"}
        entry["id"] = f"img_{i:03d}"
        entry["url"] = f"/quiz_images/{dest_name}"
        catalog.append(entry)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    reactors = sum(c["reactorCount"] for c in catalog) / max(1, len(catalog))
    print(
        f"\nWrote {OUT_PATH}: {len(catalog)} images, "
        f"{reactors:.1f} distinct reactors on average, "
        f"{len(set(c['channel'] for c in catalog))} channels"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=60)
    ap.add_argument(
        "--per-channel",
        type=int,
        default=14,
        help="how many images one channel may contribute before others get a turn",
    )
    ap.add_argument(
        "--channel-reserve",
        type=int,
        default=12,
        help="slots held back so quiet channels are represented at all",
    )
    ap.add_argument(
        "--from-cache",
        action="store_true",
        help="re-rank image_candidates.json instead of re-reading the archive",
    )
    args = ap.parse_args()
    mine(args.limit, args.per_channel, args.channel_reserve, args.from_cache)
