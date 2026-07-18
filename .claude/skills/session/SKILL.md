---
name: session
description: "Log a video game play session in sessions.csv. With no dates, marks a game as currently playing (shows on the CRT TV at /video_games); 'stop' closes an open session and offers to rate; 'log' records a past or backdated session with explicit start/end dates. Confirms before stopping other in-progress games (multiple at once is allowed)."
argument-hint: "[stop|log] [game name] [dates]"
---

You are managing play **sessions** in `sessions.csv` via
`.claude/tools/session.py` (see `.claude/tools/README.md`). Run it from the
project root. Every command prints JSON.

A session is one playthrough with a start date and (once finished) an end date.
The script commands map to intents:

- `set` opens a session starting **today** with no end date.
- `stop` closes an open session with **today's** end date.
- `log NAME [START] [END]` is the general form — it appends a session with
  explicit dates. START defaults to today, END defaults to empty (open). Use it
  for a **past playthrough** (both dates given) or a session that **started
  before today** and is still going (start given, end omitted).

An **open session (no end date) is the source of truth for "currently
playing"** — the site derives it, there is no more `currently_playing` column.

## How this shows on the site

- `/video_games` shows the **first** currently-playing game (games.csv row
  order) on the CRT TV, with a "playing since {start date}" label. If several
  sessions stay open, only the first game is displayed — tell the user this
  whenever they end up with more than one open session.
- Rating rules: an unrated game appears **only** on the CRT; a rated game
  appears on the shelves too. Games are usually unrated while in progress and
  get rated when you `stop` them — that's expected, don't treat a blank rating
  as a problem.

## Mode detection

Pick the mode from the request:

- Starts with `stop`, `done`, or `none` (case-insensitive) → **mode = stop**.
- Describes a session in the **past** or one that **started before today** —
  e.g. it names dates, or says things like "last week", "yesterday", "finished
  on…", "played it in June", or starts with `log` → **mode = log**.
- Otherwise → **mode = set** (start playing now). The argument is the game
  name — ask for it if missing.

## Step 1 — See what's currently playing

```bash
python3 .claude/tools/session.py list
```

## Step 2a — mode = set (start playing)

The game must already exist in `games.csv`. If it doesn't, say so and offer to
run the `add-game` skill first — do not add rows yourself.

```bash
python3 .claude/tools/session.py set "GAME NAME"
```

- `{"error": "not_found"}` → tell the user; offer `add-game`.
- `{"error": "ambiguous", "candidates": [...]}` → ask the user to pick via
  `AskUserQuestion`, then re-run with the exact name.
- `{"error": "already_playing", "since": ...}` → it already has an open session;
  tell the user it's been playing since that date and stop.
- `{"set": ..., "also_playing": [...]}` → success. If `also_playing` is
  non-empty, go to Step 3; otherwise report (Step 5) and stop.

## Step 2b — mode = stop (finish playing)

Ask which game to stop if more than one is open (otherwise use the only one; if
none, say there's nothing to stop and end):

```bash
python3 .claude/tools/session.py stop "GAME NAME"
```

On `{"stopped": ...}`, go to **Step 4** to offer a rating.

## Step 2c — mode = log (past or backdated session)

First resolve the dates from the request to ISO `YYYY-MM-DD`, using today's date
(from context) as the anchor for relative phrasing:

- "stopped yesterday" → END = yesterday; "last week for a week" → START ≈ 7 days
  before END. Do the arithmetic and state the dates you inferred.
- If the request gives an explicit start/end, use them as-is.
- If a date is genuinely unclear, ask the user with `AskUserQuestion` rather than
  guessing. Omit END entirely if the game is still being played (backdated
  start, open session).

Then append the session (START and END are optional positionals):

```bash
python3 .claude/tools/session.py log "GAME NAME" 2026-07-10 2026-07-16
```

- `{"error": "not_found"}` → tell the user; offer `add-game`. Do not add rows
  yourself.
- `{"error": "ambiguous", "candidates": [...]}` → ask the user to pick, re-run.
- `{"error": "invalid_date", "field": ...}` → you passed a non-ISO date; fix it.
- `{"error": "end_before_start", ...}` → the dates are backwards; recheck.
- `{"error": "already_playing", "since": ...}` → an open session already exists
  for this game and you passed no END; tell the user and stop.
- `{"logged": ..., "open": true, "also_playing": [...]}` → success on an **open**
  (end-less) log; treat it like `set` — if `also_playing` is non-empty go to
  Step 3, then report (Step 5).
- `{"logged": ..., "open": false}` → success on a **closed** past session. This
  is a finished playthrough, so go to **Step 4** to offer a rating, then report.

## Step 3 — Resolve other in-progress games (open sessions only)

The user may genuinely be playing several games at once, so never silently
stop one. Ask via `AskUserQuestion` (multiSelect: true): "Still playing these,
or done with them?" with one option per game in `also_playing`, phrased like
"Stop <name>". Marking the new game is not in question — only what happens to
the old ones.

- For each game the user chooses to stop, run `stop "<name>"`, then offer a
  rating for it (Step 4).
- If they keep extras open, remind them only the first one (games.csv order)
  shows on the TV.

## Step 4 — Offer a rating for a stopped game

A finished game usually gets a rating (which puts it on the shelves). For each
game you just stopped, ask via `AskUserQuestion`: "How would you rate <name>?"
with these options — **Perfect, Great, Good, Okay, Bad** — plus let the user
skip. If they pick a rating:

```bash
python3 .claude/tools/session.py rate "GAME NAME" "Great"
```

- `{"rated": ...}` → success.
- `{"error": "invalid_rating", "valid": [...]}` → only the five names above are
  accepted; re-ask.

If they skip, leave the rating blank (the game just won't appear on the shelves
yet).

## Step 5 — Confirm

Report the final state: run `list` again and show who's on the TV now. If a
newly playing game has a rating, mention it also stays on the shelves; if it's
unrated, mention it lives only on the CRT until rated.

## Notes

- Do not edit `sessions.csv` or `games.csv` by hand for this — always go
  through the script.
- Do not commit or push.
