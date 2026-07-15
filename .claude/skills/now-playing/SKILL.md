---
name: now-playing
description: "Mark a game in games.csv as currently playing — it appears on the CRT TV at the top of /video_games. Confirms before unmarking other in-progress games (multiple at once is allowed). Use 'stop' to unmark without setting a new game."
argument-hint: "[stop] [game name]"
---

You are updating the `currently_playing` column in `games.csv` via
`.claude/tools/now_playing.py` (see `.claude/tools/README.md`). Run it from the
project root. Every command prints JSON.

## How the flag behaves on the site

- The `/video_games` page shows the **first** flagged game (CSV row order) on
  the CRT TV. If multiple games stay flagged, only the first one is displayed —
  tell the user this whenever they end up with more than one flag.
- Rating rules: a game with no rating appears **only** on the CRT; a rated game
  appears on the shelves too. Currently-playing games are usually unrated until
  finished — that's expected, don't treat a blank rating as a problem.

## Mode detection

If the argument starts with `stop`, `done`, or `none` (case-insensitive), set
**mode = stop**. Otherwise **mode = set** and the argument is the game name —
ask for it if missing.

## Step 1 — See what's currently flagged

```bash
python3 .claude/tools/now_playing.py list
```

## Step 2a — mode = set

The game must already exist in `games.csv`. If it doesn't, say so and offer to
run the `add-game` skill first — do not add rows yourself.

```bash
python3 .claude/tools/now_playing.py set "GAME NAME"
```

- `{"error": "not_found"}` → tell the user; offer `add-game`.
- `{"error": "ambiguous", "candidates": [...]}` → ask the user to pick via
  `AskUserQuestion`, then re-run with the exact name.
- `{"set": ..., "also_playing": [...]}` → success. If `also_playing` is
  non-empty, go to Step 3; otherwise report and stop.

## Step 2b — mode = stop

Ask which game to unmark if more than one is flagged (otherwise use the only
one; if none, say there's nothing to unmark and stop):

```bash
python3 .claude/tools/now_playing.py unset "GAME NAME"
```

## Step 3 — Resolve other in-progress games

The user may genuinely be playing several games at once, so never silently
unmark. Ask via `AskUserQuestion` (multiSelect: true): "Still playing these,
or done with them?" with one option per game in `also_playing`, phrased like
"Unmark <name>". Marking the new game is not in question — only what happens
to the old ones.

- For each game the user chooses to unmark, run `unset`.
- If they keep extras flagged, remind them only the first flagged game (CSV
  order) shows on the TV.

## Step 4 — Confirm

Report the final state: run `list` again and show who's on the TV now. If the
newly marked game has a rating, mention it also stays on the shelves; if it's
unrated, mention it lives only on the CRT until rated.

## Notes

- Do not edit `games.csv` by hand for this — always go through the script.
- Do not commit or push.
