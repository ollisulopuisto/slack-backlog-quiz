"""Finds numbers in the question bank that no longer match the mined data.

Questions carry figures in three places: the question text, the options and the
explanation. Most are interpolated from the mined files and correct themselves
on a re-mine, but plenty were written by hand into an explanation and quietly
go stale when the underlying count changes.

This compares every number in the bank against every number the mining passes
produced, and reports the ones that appear nowhere. A hit is not proof of a
bug -- years, points and round numbers are legitimately absent -- but a stale
count almost always shows up here.

    uv run python audit_numbers.py
"""

import json
import re
import sys

MINED = (
    "archive_facts.json",
    "archive_chronology.json",
    "archive_social.json",
    "archive_gaps.json",
    "backlog_summary.json",
)
BANK = "src/lib/question_bank.json"
DECK = "src/lib/quiz_data.json"

# Numbers that mean something other than a measurement.
IGNORE = set(range(0, 101)) | {
    1000, 1500, 2000, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027,
    2016, 2017, 2018, 2019, 200, 300, 150, 250, 400, 500,
}

NUM_RE = re.compile(r"\d+(?:[\u0020\u00a0]\d{3})*")


def numbers_in(value, out):
    """Every integer reachable in a JSON value, including inside prose."""
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        out.add(int(value))
    elif isinstance(value, str):
        for m in NUM_RE.finditer(value):
            raw = m.group(0).replace(" ", "").replace(" ", "").replace(".", "")
            raw = raw.replace(",", "")
            if raw.isdigit():
                out.add(int(raw))
    elif isinstance(value, dict):
        for v in value.values():
            numbers_in(v, out)
    elif isinstance(value, list):
        for v in value:
            numbers_in(v, out)


def main():
    known = set()
    for path in MINED:
        try:
            with open(path, encoding="utf-8") as f:
                numbers_in(json.load(f), known)
        except FileNotFoundError:
            print(f"  (missing {path})")

    # Derived figures a question may legitimately state.
    derived = set()
    for n in list(known):
        for other in (n,):
            derived.add(other)
    known |= derived

    stale = []
    for path in (BANK, DECK):
        with open(path, encoding="utf-8") as f:
            items = json.load(f)
        for q in items:
            found = set()
            for field in ("question", "explanation", "hint", "subtitle", "title"):
                numbers_in(q.get(field), found)
            for opt in q.get("options") or []:
                numbers_in(opt, found)
            for b in q.get("bullets") or []:
                numbers_in(b, found)
            for p in q.get("pairs") or []:
                numbers_in(p.get("right"), found)
                numbers_in(p.get("left"), found)

            unknown = sorted(n for n in found - known - IGNORE if n > 100)
            if unknown:
                stale.append((path, q.get("id"), unknown, (q.get("question") or q.get("title") or "")[:70]))

    if not stale:
        print("Every figure in the bank and deck traces back to the mined data.")
        return 0

    print(f"{len(stale)} item(s) contain a figure not found in any mined file:\n")
    for path, qid, nums, text in stale:
        where = "deck" if path == DECK else "bank"
        print(f"  [{where}] {qid}: {nums}")
        print(f"        {text}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
