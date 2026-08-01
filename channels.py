"""The channels an ”on which channel” question can offer.

A four-option channel question is guessable by elimination -- three of the
names are obviously wrong for a given picture. Offering every real channel
makes it a question about actually knowing the group.

Every public channel with any real traffic is in. Out: direct messages and
group DMs, which the export stores as channels but which nobody thinks of as
one, and the abandoned test channels with a handful of messages between them.
"""

import json

FACTS_FILE = "archive_facts.json"

#: Below this a channel is a leftover experiment, not somewhere you posted.
MIN_MESSAGES = 50

#: Group DMs and one-to-ones the export lists alongside real channels. They
#: carry a display name in parentheses or the "Group messaging with:" prefix.
def _is_dm(name):
    return name.startswith("Group messaging with:") or "(" in name


def load_roster(path=FACTS_FILE):
    """Channel names, busiest first, as offered in a question."""
    with open(path, encoding="utf-8") as f:
        facts = json.load(f)
    return [
        c["channel"]
        for c in facts["channels"]
        if c["messages"] >= MIN_MESSAGES and not _is_dm(c["channel"])
    ]


def options(roster=None):
    """Channel options in a fixed alphabetical order.

    Alphabetical rather than by size, so the ordering itself never hints that
    the answer is one of the big ones -- which it usually is.
    """
    roster = roster if roster is not None else load_roster()
    return sorted((f"#{c}" for c in roster), key=lambda s: s.lower())


def channel_options(correct_channel, roster=None):
    """(options, correct_index) offering every real channel."""
    opts = options(roster)
    answer = f"#{correct_channel}"
    if answer not in opts:
        raise ValueError(
            f"#{correct_channel} is not a listed channel; a question cannot "
            "offer it alongside the others"
        )
    return opts, opts.index(answer)


if __name__ == "__main__":
    r = load_roster()
    print(f"{len(r)} kanavaa:")
    for c in options(r):
        print("  ", c)
