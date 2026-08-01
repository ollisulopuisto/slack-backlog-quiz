"""Canonical locations of the generated quiz data files.

Every quiz file is kept in two places and the paths were spelled out in three
separate modules (generator.py, bank_generator.py, verify_images.py) plus the
Next API routes, each with its own copy of the write logic.

Why two copies:
  * ``src/lib/*.json`` is what the app imports (see ``src/lib/store.ts``).
  * The repo-root copies exist for the Python tooling and for eyeballing a diff.

Note that nothing currently *reads* the root copies except verify_images.py,
which checks them because they exist. If they are ever dropped, this module and
the ``ROOT_*_FILE_PATH`` constants in ``src/app/api/questions/route.ts`` and
``src/app/api/bank/route.ts`` are the only places that need changing.

Paths are relative, so these helpers expect the project root as the working
directory — which is how ``npm run prebuild`` and the generators already run.
"""

import json
import os

QUIZ_DATA_PATHS = ("quiz_data.json", "src/lib/quiz_data.json")
QUESTION_BANK_PATHS = ("question_bank.json", "src/lib/question_bank.json")

#: Everything a consistency check should look at.
ALL_QUIZ_FILES = QUIZ_DATA_PATHS + QUESTION_BANK_PATHS


def write_json_copies(data, paths):
    """Writes `data` as UTF-8 JSON to every path, creating parent dirs.

    Formatting is fixed (``ensure_ascii=False, indent=2``) so the copies stay
    byte-identical to each other and to what the app's API route writes.
    """
    for path in paths:
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return paths


def describe(paths):
    """'a.json and b.json' — for the generators' completion messages."""
    return " and ".join(paths)


def shuffle_pairs(questions):
    """Breaks the ordering of a connect-pairs question's prompt column.

    Pairs get authored in a natural sequence -- years ascending, counts
    descending -- and the prompts are rendered in array order. The player's
    option list is already shuffled in visibility.ts, but that doesn't help
    when the prompts themselves are sorted: you can ignore the question and
    just sort the numbers. Shuffling the pair order removes that shortcut.

    A plain shuffle isn't enough. Four items land back in sorted order 2 times
    in 24, so across a dozen questions roughly one would still be a free point.
    Each attempt is rejected while the answer column reads monotonically, and
    the seed includes the question id so a question keeps its layout across
    regenerations instead of reshuffling under a player's finger.
    """
    import random

    for q in questions:
        pairs = q.get("pairs")
        if q.get("type") != "connect_pairs" or not pairs or len(pairs) < 3:
            continue

        for attempt in range(20):
            random.Random(f"{q.get('id')}:pairs:{attempt}").shuffle(pairs)
            answers = [p["right"] for p in pairs]
            if answers != sorted(answers) and answers != sorted(answers, reverse=True):
                break
    return questions
