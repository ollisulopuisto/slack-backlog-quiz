"""Shared access to the Mörttinen Slack export.

The archive path, the non-channel file skip-list, and the users/channels
parsing were copy-pasted across parser.py, search_backlog.py, inspect_images.py
and quick_images.py. A path change meant editing four files, and the three
user-parsing copies had already drifted in shape.

Override the location without editing code:

    SLACK_ARCHIVE_ROOT=/mnt/elsewhere/slack-archive uv run python parser.py
"""

import json
import os

ARCHIVE_ROOT = os.environ.get(
    "SLACK_ARCHIVE_ROOT",
    "/path/to/slack-export",
)

#: Channel message dumps live here, one <channel_id>.json per channel.
ARCHIVE_DIR = os.path.join(ARCHIVE_ROOT, "data")

#: Uploaded attachments, grouped into per-channel subdirectories.
FILES_DIR = os.path.join(ARCHIVE_ROOT, "html", "files")

#: Files in ARCHIVE_DIR that are metadata, not channel message dumps.
NON_CHANNEL_FILES = frozenset(
    {
        "users.json",
        "channels.json",
        "emojis.json",
        "manifest.json",
        "slack-archive.json",
    }
)

#: Message dumps at or below this size are empty placeholders (e.g. "[]").
MIN_CHANNEL_FILE_BYTES = 10


def _display_name(udata):
    """Slack's own precedence: display name, then real name, then handle."""
    return (
        udata.get("profile", {}).get("display_name")
        or udata.get("real_name")
        or udata.get("name")
    )


def load_users(archive_dir=ARCHIVE_DIR):
    """uid -> {"name", "real_name", "display_name"}.

    Handles both export shapes: a uid-keyed dict and a flat list.
    """
    users_file = os.path.join(archive_dir, "users.json")
    if not os.path.exists(users_file):
        return {}

    with open(users_file, "r", encoding="utf-8") as f:
        raw = json.load(f)

    entries = raw.items() if isinstance(raw, dict) else ((u.get("id"), u) for u in raw)
    return {
        uid: {
            "name": udata.get("name"),
            "real_name": udata.get("real_name"),
            "display_name": _display_name(udata),
        }
        for uid, udata in entries
    }


def load_display_names(archive_dir=ARCHIVE_DIR):
    """uid -> display name, for callers that only need the label."""
    return {uid: u["display_name"] for uid, u in load_users(archive_dir).items()}


def load_channels(archive_dir=ARCHIVE_DIR):
    """channel id -> channel name."""
    ch_file = os.path.join(archive_dir, "channels.json")
    if not os.path.exists(ch_file):
        return {}

    with open(ch_file, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, list):
        return {}
    return {c.get("id"): c.get("name") for c in raw}


def load_channel_name_to_id(archive_dir=ARCHIVE_DIR):
    """channel name -> channel id (the inverse of load_channels)."""
    return {name: cid for cid, name in load_channels(archive_dir).items()}


def iter_channel_files(archive_dir=ARCHIVE_DIR, channels=None):
    """Yields (channel_id, channel_name, path) for every non-empty channel dump.

    Skips metadata files and empty placeholders so callers stop re-implementing
    the same two filters.
    """
    if channels is None:
        channels = load_channels(archive_dir)

    # Deliberately NOT sorted. Counter.most_common() and the stable sort of
    # top-reacted messages break ties by insertion order, so imposing an order
    # here silently changes which emojis and messages survive the top-N cutoffs
    # in backlog_summary.json — and therefore the generated quiz. Making this
    # pipeline deterministic is worth doing, but as a deliberate change with a
    # regenerated summary, not as a side effect of a refactor.
    for fname in os.listdir(archive_dir):
        if not fname.endswith(".json") or fname in NON_CHANNEL_FILES:
            continue

        fpath = os.path.join(archive_dir, fname)
        if os.path.getsize(fpath) <= MIN_CHANNEL_FILE_BYTES:
            continue

        ch_id = fname[: -len(".json")]
        yield ch_id, channels.get(ch_id, ch_id), fpath


def iter_messages(msgs):
    """Yields every real message in a channel dump, thread replies included.

    Replies are not stored alongside their siblings: they hang off the parent
    in a nested ``replies`` list, so anything iterating the top-level array
    alone silently omits them. That is how the archive's 34 000-odd replies
    went uncounted for the whole first round of mining.

    Broadcasts are the catch. A reply "also sent to channel" appears BOTH
    nested and top-level -- 7 379 times in #general alone -- so a naive merge
    double-counts it. Timestamps are unique per message, so dedupe on those.
    """
    seen = set()

    def emit(m):
        if not isinstance(m, dict) or m.get("type") != "message":
            return None
        if not m.get("user"):
            return None
        ts = m.get("ts")
        if not ts or ts in seen:
            return None
        seen.add(ts)
        return m

    for m in msgs:
        if not isinstance(m, dict):
            continue
        top = emit(m)
        if top is not None:
            yield top
        for r in m.get("replies") or []:
            reply = emit(r)
            if reply is not None:
                yield reply
