# Slack Backlog Quiz

A live quiz you run off your own Slack export. Questions come from what the
group actually said; the answers are counted from the archive rather than
remembered, so nobody has to be the authority on who swears most.

The host drives a projector view, everyone else plays on their phone over the
local network. No accounts, no cloud, no internet needed once it is running.

## What it does

- **Projector + phones.** `/deck` on the big screen, `/play` on phones, joined
  by scanning a QR code. `/editor` builds decks, `/summary` grades open answers.
- **Question types.** Multiple choice, connect-pairs, sliders, open answers
  judged by the host, and a standing prediction market on who wins and who
  comes last.
- **One point is one right answer.** A four-way pairing is one point split four
  ways, an open question is worth up to three. A final score reads as roughly
  how many you got right.
- **Beats between the questions.** Charts of the archive's shape, quote cards,
  and the prediction market, woven in automatically rather than authored.
- **Several decks.** Each keeps its own scoreboard, so a warm-up round can be
  parked and resumed.
- **It shows its sources.** A question quoting a real message can show that
  message back in its conversation, pulled from the export at build time.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The console prints a `/deck?key=…` link on first boot — that key is what makes
you the host. Players join at `/play` with no key.

For an actual event, build first: `npm run build && npm start`. The dev server
is fine for trying it out, but the production build is what you want in front
of people.

Everything lives on one machine on one network. It is deliberately not
serverless-compatible: the room is a file on disk.

## Pointing it at your own archive

Out of the box you get an example deck and an empty editor, which is enough to
run a quiz you write by hand. To generate questions from a real export:

```bash
export SLACK_ARCHIVE_ROOT=/path/to/slack-export
uv run python parser.py           # totals and top-reacted messages
uv run python mine_archive.py     # rhythm, channels, reactions, uploads
uv run python mine_records.py     # timeline records and monthly series
uv run python build_stat_charts.py
uv run python embed_assets.py     # your custom emoji, inlined
```

The miners expect the layout produced by a Slack export archiver:
`data/<channel>.json` per channel, `html/emojis/`, `html/avatars/`,
`html/files/<channel>/`. Thread replies are nested inside their parent rather
than listed alongside their siblings, which is easy to walk past — see
`iter_messages` in `slack_archive.py`.

Nothing mined is committed. `.gitignore` keeps every `archive_*.json`, the
image catalogue and `data/` out, because they describe real people saying real
things.

## Writing questions

`/editor` has a deck view and a bank. The bank is a pool you pick from; adding
to a deck never renumbers the questions already in it, so you can add one
mid-quiz without disturbing anybody's score.

The editor flags decks that repeat themselves, and one failure worth knowing
about: an explanation stating a number that a later question asks for. That
explanation sits on the projector while you talk over it, so it is not a hint,
it is the answer.

## Licence

MIT.
