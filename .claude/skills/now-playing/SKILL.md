---
name: now-playing
description: "Mark a game as currently playing — it appears on the CRT TV at the top of /video_games. Opens a play session; 'stop' closes it and offers to rate the game. Confirms before stopping other in-progress games (multiple at once is allowed)."
argument-hint: "[stop] [game name]"
---

You are managing play **sessions** in `sessions.csv` via
`.claude/tools/now_playing.py` (see `.claude/tools/README.md`). Run it from the
project root. Every command prints JSON.

A session is one playthrough: `set` opens it (start date = today, no end date),
`stop` closes it (end date = today). An **open session is the source of truth
for "currently playing"** — the site derives it, there is no more
`currently_playing` column.

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

If the argument starts with `stop`, `done`, or `none` (case-insensitive), set
**mode = stop**. Otherwise **mode = set** and the argument is the game name —
ask for it if missing.

## Step 1 — See what's currently playing

```bash
python3 .claude/tools/now_playing.py list
```

## Step 2a — mode = set (start playing)

The game must already exist in `games.csv`. If it doesn't, say so and offer to
run the `add-game` skill first — do not add rows yourself.

```bash
python3 .claude/tools/now_playing.py set "GAME NAME"
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
python3 .claude/tools/now_playing.py stop "GAME NAME"
```

On `{"stopped": ...}`, go to **Step 4** to offer a rating.

## Step 3 — Resolve other in-progress games (mode = set only)

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
python3 .claude/tools/now_playing.py rate "GAME NAME" "Great"
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
