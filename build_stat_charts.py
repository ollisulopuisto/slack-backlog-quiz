"""Builds the deck's stat screens from the mined archive data.

The charts are a beat between questions, like the prediction market: no answer,
no points, just the shape of ten years on the projector. Writing a small
purpose-built file keeps the megabyte of archive_facts.json out of the client
bundle -- the deck only needs the series it draws.

Each chart is a single series, so it needs no legend: the title names it. The
peak bar is highlighted and directly labelled; nothing else carries a number,
because a projected slide is read from six metres away.

    uv run python build_stat_charts.py
"""

import json
import os

FACTS = "archive_facts.json"
RECORDS = "archive_records.json"  # optional, from mine_records.py
OUT_PATHS = ("src/lib/stat_charts.json", "stat_charts.json")

WEEKDAYS = ["ma", "ti", "ke", "to", "pe", "la", "su"]

MONTH_NAMES = [
    "tammi", "helmi", "maalis", "huhti", "touko", "kesä",
    "heinä", "elo", "syys", "loka", "marras", "joulu",
]


def _fi(n):
    return f"{n:,}".replace(",", " ")


def _load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _series(points, unit="viestiä"):
    """points: [(label, value)] in the order they should be drawn."""
    values = [v for _l, v in points]
    peak = max(range(len(values)), key=lambda i: values[i])
    return {
        "points": [{"label": l, "value": v} for l, v in points],
        "peakIndex": peak,
        "peakLabel": f"{_fi(values[peak])} {unit}",
        "max": max(values),
        "total": sum(values),
    }


def build():
    facts = _load(FACTS)
    charts = []

    hours = [(f"{h}", facts["hours"][str(h)]) for h in range(24)]
    charts.append(
        {
            "id": "chart_hours",
            "title": "Milloin Mörttinen kirjoittaa",
            "subtitle": "Viestit vuorokaudenajan mukaan, koko kymmenen vuoden ajalta",
            "axisLabel": "kellonaika",
            "series": _series(hours),
            "note": (
                "Työaika voittaa illan kirkkaasti. Klo 4 aikaan on kymmenessä "
                f"vuodessa kirjoitettu {_fi(facts['hours']['4'])} viestiä — "
                "yöunet ovat kunnossa."
            ),
            "labelEvery": 3,
        }
    )

    years = [(y, facts["years"][y]) for y in sorted(facts["years"])]
    charts.append(
        {
            "id": "chart_years",
            "title": "Kymmenen vuotta",
            "subtitle": "Viestejä vuosittain — huomaa aukot vuosina 2022–2025",
            "axisLabel": "vuosi",
            "series": _series(years),
            "note": (
                "Vuoden 2022 notkahdus on enimmäkseen varmuuskopion aukko, ei "
                "hiljaisuutta: siltä vuodelta puuttuu arkistosta 215 päivää."
            ),
            "labelEvery": 1,
        }
    )

    weekdays = [(WEEKDAYS[d], facts["weekdays"][str(d)]) for d in range(7)]
    charts.append(
        {
            "id": "chart_weekdays",
            "title": "Viikon rytmi",
            "subtitle": "Viestit viikonpäivän mukaan",
            "axisLabel": "viikonpäivä",
            "series": _series(weekdays),
            "note": (
                "Lauantai ja sunnuntai keräävät yhdessä vain noin 14 % "
                "kaikesta. Tämä on työpäivän chat."
            ),
            "labelEvery": 1,
        }
    )

    # The monthly series and the timeline records need mine_records.py, which
    # needs the archive mounted. Both are optional so the deck still builds.
    if os.path.exists(RECORDS):
        rec = _load(RECORDS)
        months = [
            (
                f"{MONTH_NAMES[int(m['month'][5:]) - 1]} {m['month'][2:4]}",
                m["count"],
            )
            for m in rec["by_month"]
        ]
        charts.append(
            {
                "id": "chart_months",
                "title": "Kymmenen vuotta, kuukausi kerrallaan",
                "subtitle": "Jokainen palkki on yksi kuukausi",
                "axisLabel": "kuukausi",
                "series": _series(months),
                "note": (
                    "Kevät 2021 on koko arkiston tiheintä aikaa. Nollat "
                    "vuosina 2022–2025 ovat varmuuskopion aukkoja."
                ),
                "labelEvery": 12,
            }
        )

        w = rec["busiest_hour_window"]
        gaps = _load("archive_gaps.json")

        # Every card answers the same question -- what does 1,1 million
        # actually amount to -- from a different angle. The first version put
        # three raw peaks side by side in three different units (per hour, per
        # 100 messages, per day), which meant switching mental models between
        # cards and having no idea whether any of the numbers was large.
        recorded_days = gaps["days_with_messages"]
        recorded_hours = recorded_days * 24
        total = facts["total_messages"]
        minutes_between = recorded_hours * 60 / total
        avg_per_hour = total / recorded_hours

        # 99,9 % of messages come from posters the length stats cover, so this
        # is the whole archive to within a rounding error.
        chars = sum(
            u["avg_chars"] * u["messages"] for u in facts["avg_message_length"]
        )
        reading_days = chars / 1000 / 60 / 24  # 1 000 merkkiä minuutissa
        pages = round(chars / 1800)

        charts.append(
            {
                "id": "chart_records",
                "type": "records",
                "title": "Paljonko 1,1 miljoonaa viestiä oikein on?",
                "subtitle": "Kolme tapaa suhteuttaa kymmenen vuoden backlog",
                "records": [
                    {
                        "value": f"{minutes_between:.0f} min",
                        "unit": "viestien väli keskimäärin",
                        "detail": (
                            "Yksi viesti joka neljäs minuutti, kymmenen vuotta "
                            "putkeen — yöt ja viikonloput mukaan luettuina."
                        ),
                    },
                    {
                        "value": f"{reading_days:.0f} vrk",
                        "unit": "yhtäjaksoista lukemista",
                        "detail": (
                            f"{_fi(round(chars / 1e6))} miljoonaa merkkiä eli "
                            f"noin {_fi(pages)} kirjan sivua. Nukkumatta."
                        ),
                    },
                    {
                        "value": f"{round(w['count'] / avg_per_hour)}×",
                        "unit": "vilkkain tunti vs. tavallinen",
                        "detail": (
                            f"{w['count']} viestiä {w['start']}, kun tavallinen "
                            f"tunti on {avg_per_hour:.0f}. "
                            f"{w['top_channels'][0][1]} niistä #{w['top_channels'][0][0]}."
                        ),
                    },
                ],
            }
        )

    # The deck has room for one chart per gap between market screens -- three,
    # with the default four stops -- so the order here is a priority order. The
    # ten-year shape and the records land first because they are the two that
    # get an audible reaction; the rest are there for a longer deck.
    PRIORITY = [
        "chart_months",
        "chart_hours",
        "chart_records",
        "chart_years",
        "chart_weekdays",
    ]
    charts.sort(key=lambda c: PRIORITY.index(c["id"]))

    payload = {"charts": charts}
    blob = json.dumps(payload, ensure_ascii=False, indent=2)
    for p in OUT_PATHS:
        with open(p, "w", encoding="utf-8") as f:
            f.write(blob)
    print(
        f"{len(charts)} kuvaajaa -> {' ja '.join(OUT_PATHS)}"
        + ("" if os.path.exists(RECORDS) else f"  ({RECORDS} puuttuu, 2 jäi pois)")
    )


if __name__ == "__main__":
    build()
