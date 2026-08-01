"""Bakes the group's custom emoji and avatars into the app as data URIs.

Reaction names on their own are meaningless -- ":janari: 4" tells nobody
anything. The images live as loose files on the NAS, which is no use during the
quiz, so they get downscaled and inlined here. 262 emoji and 38 avatars come to
a few hundred kilobytes at display size, which is cheaper than a single photo
slide.

Animated emoji keep moving (see `encode`), so this needs the NAS mounted --
regenerating from an unmounted archive is what would silently freeze them.

    uv run python embed_assets.py [--emoji-size 32] [--avatar-size 48]
"""

import argparse
import base64
import io
import json
import os

from PIL import Image, ImageSequence

from slack_archive import ARCHIVE_ROOT, ARCHIVE_DIR, load_users

EMOJI_DIR = os.path.join(ARCHIVE_ROOT, "html", "emojis")
AVATAR_DIR = os.path.join(ARCHIVE_ROOT, "html", "avatars")
OUT_PATHS = ("src/lib/archive_assets.json", "archive_assets.json")


#: An animated emoji above this (encoded GIF bytes) is dropped to one frame.
#: 262 emoji ship in the client bundle, so one 300 kB spinner would cost more
#: than every still image put together.
MAX_ANIMATED_BYTES = 40 * 1024


def _still(im, size):
    """First frame, downscaled, as PNG bytes."""
    if getattr(im, "is_animated", False):
        im.seek(0)
    frame = im.convert("RGBA")
    frame.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    frame.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _thin(frames, durations, step):
    """Every `step`th frame, each held for the frames it now stands in for.

    A 158-frame :catjam: at half the frames is still a cat jamming; the loop
    has to take the same two seconds, so the kept frames absorb the durations
    of the ones dropped between them.
    """
    kept, held = [], []
    for i, (frame, duration) in enumerate(zip(frames, durations)):
        if i % step == 0:
            kept.append(frame)
            held.append(duration)
        else:
            held[-1] += duration
    return kept, held


def _animation(im, size, budget=None):
    """Every frame downscaled, re-saved as a lossless animated WebP.

    Frames are composited onto the canvas by the iterator, so a GIF that only
    stores what changed between frames still yields whole pictures to resize.
    Durations are kept per frame — a wave that runs at 40 ms and a blink at
    400 ms are not the same joke at a single averaged speed.

    WebP rather than GIF because GIF carries one bit of alpha: every emoji
    drawn on the deck's near-black panels would wear a white fringe.

    Both encodings are tried and the smaller one wins. Lossless is right for
    the flat pixel art half of the set and wrong for the other half — a
    spinning Sonic or a photo of a fish is roughly twice the size losslessly,
    and across the whole set that difference is a megabyte of bundle.
    """
    frames, durations = [], []
    for frame in ImageSequence.Iterator(im):
        thumb = frame.convert("RGBA")
        thumb.thumbnail((size, size), Image.LANCZOS)
        frames.append(thumb)
        durations.append(frame.info.get("duration", 100))

    def save(pics, times, **options):
        buf = io.BytesIO()
        pics[0].save(
            buf,
            format="WEBP",
            save_all=True,
            append_images=pics[1:],
            duration=times,
            loop=0,
            **options,
        )
        return buf.getvalue()

    def encode_both(pics, times):
        # 88 is where a 32 px emoji stops showing visible blocking; alpha
        # survives either way, so transparency is not what is being traded.
        return min(
            save(pics, times, lossless=True, minimize_size=True),
            save(pics, times, quality=88, method=6),
            key=len,
        )

    best = encode_both(frames, durations)
    # Over budget: thin the frames before giving up on the motion entirely.
    # The long ones are long because they repeat — 42 frames of
    # :rage-intensifies: shake exactly as angrily at 21.
    for step in (2, 3, 4):
        if budget is None or len(best) <= budget or len(frames) // step < 2:
            break
        best = encode_both(*_thin(frames, durations, step))
    return best


def encode(path, size, max_animated_bytes=MAX_ANIMATED_BYTES):
    """Downscale to a square thumbnail and return a data URI.

    An animated emoji stays animated: half of these are a wobble or a blink,
    and a frozen first frame of :joy-vibrate-angry-2: is a different picture
    from the one people reacted with. Stills stay PNG, animations become
    animated WebP, and an animation that would blow the budget falls back to
    its first frame rather than dragging the bundle down with it.
    """
    with Image.open(path) as im:
        if getattr(im, "is_animated", False) and getattr(im, "n_frames", 1) > 1:
            data = _animation(im, size, budget=max_animated_bytes)
            if len(data) <= max_animated_bytes:
                return "data:image/webp;base64," + base64.b64encode(data).decode()
        data = _still(im, size)
    return "data:image/png;base64," + base64.b64encode(data).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--emoji-size", type=int, default=32)
    ap.add_argument("--avatar-size", type=int, default=48)
    ap.add_argument("--only", help="comma-separated emoji names, for a subset")
    args = ap.parse_args()

    wanted = set(args.only.split(",")) if args.only else None

    emoji = {}
    for fname in sorted(os.listdir(EMOJI_DIR)):
        name, ext = os.path.splitext(fname)
        if ext.lower() not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
            continue
        if wanted and name not in wanted:
            continue
        try:
            emoji[name] = encode(os.path.join(EMOJI_DIR, fname), args.emoji_size)
        except Exception as e:
            print(f"  skipped :{name}: ({e})")

    name_of = {uid: u["display_name"] for uid, u in load_users(ARCHIVE_DIR).items()}
    avatars = {}
    for fname in sorted(os.listdir(AVATAR_DIR)):
        uid, ext = os.path.splitext(fname)
        if ext.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        label = name_of.get(uid)
        if not label:
            continue
        try:
            avatars[label] = encode(
                os.path.join(AVATAR_DIR, fname), args.avatar_size
            )
        except Exception as e:
            print(f"  skipped avatar {uid} ({e})")

    payload = {"emoji": emoji, "avatars": avatars}
    blob = json.dumps(payload, ensure_ascii=False)
    for p in OUT_PATHS:
        with open(p, "w", encoding="utf-8") as f:
            f.write(blob)

    animated = sum(1 for uri in emoji.values() if uri.startswith("data:image/webp"))
    print(
        f"{len(emoji)} emoji ({animated} animoitua) + {len(avatars)} avatars -> "
        f"{len(blob) / 1024:.0f} kB in {' and '.join(OUT_PATHS)}"
    )


if __name__ == "__main__":
    main()
