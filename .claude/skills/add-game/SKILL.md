---
name: add-game
description: "Add a game to games.csv or wishlist.csv. Pass 'wishlist' as the first arg to add to the wishlist. Looks up release date, platform, and genres from Wikipedia's infobox, fetches cover art from IGDB. Asks only when data is ambiguous."
argument-hint: "[wishlist] [game name (optional)]"
---

You are adding a game to a CSV file at the project root.

## Mode detection

Check the first argument:

- If it starts with `wishlist` (case-insensitive), set **mode = wishlist** and treat any remaining text as the game name.
- Otherwise, set **mode = games** and treat all args as the game name.

**games.csv** columns:

```
name,system,rating,genre,release_date,image_url
```

- Play state (currently playing / last played) is **not** stored here — it
  lives in `sessions.csv`, managed by the **now-playing** skill. This skill
  appends 6-field rows and never touches sessions.

**wishlist.csv** columns:

```
name,system,genre,release_date,image_url,starred,date_added,notes
```

- `genre` is pipe-separated for multiple genres (e.g. `Action-Adventure|Puzzle`)
- `rating` (games only) must be one of: `Perfect`, `Great`, `Good`, `Okay`, `Bad`, or empty
- `starred` (wishlist only) is `true` or empty
- `date_added` (wishlist only) is today's date in ISO format: `YYYY-MM-DD` — get it with `date +%F`
- `notes` (wishlist only) is free text or empty
- `release_date` is ISO format: `YYYY-MM-DD`, or empty

---

## Step 1 — Determine game name

If the game name was provided (after stripping the `wishlist` prefix if present), use it. Otherwise, ask the user for it before proceeding.

---

## Step 2 — Read existing systems and genres

**Always read `games.csv`** to extract:

- All unique values from the `system` column → use as the option list when asking the user to pick a system
- All unique genre tokens from the `genre` column (split each cell on `|`) → use as a reference when mapping Wikipedia genres

If **mode = wishlist**, also read `wishlist.csv` and merge any additional system/genre tokens not already found in `games.csv`.

---

## Step 3 — Look up game data on Wikipedia

The Wikipedia lookup logic lives in a helper script, `.claude/tools/wikipedia.py`
(see `.claude/tools/README.md`). Run it from the project root.

Search Wikipedia for the game — this prints a JSON array of candidate page titles:

```bash
python3 .claude/tools/wikipedia.py search "GAME_NAME"
```

Pick the most relevant result (clearly a video game, not a film or book adaptation). If the searched title is an **enhanced edition or port** (e.g. "Persona 5 Royal", "Portal on Switch") with no dedicated article — it's covered inside the parent game's article — say so, use the parent page, and confirm the key data (system, edition) with the user before continuing. Then fetch its infobox fields — this prints a JSON object:

```bash
python3 .claude/tools/wikipedia.py infobox "PAGE_TITLE"
```

The output looks like:

```json
{
  "genre": "Metroidvania, Action-adventure",
  "platforms": "Windows, Nintendo Switch",
  "released_raw": "{{vgrelease|NA=February 24, 2017|WW=...}}"
}
```

- If the page has no video-game infobox, the output is `{"error": "no_infobox"}` — fall back to asking the user manually (see Notes).
- `released_raw` is intentionally left un-cleaned. It may contain template markup like `{{vgrelease|NA=...|EU=...}}`. Extract the **North America (NA)** date from it. If no NA-specific date exists, use the earliest worldwide date. Always prefer NA. Convert to `YYYY-MM-DD`.

---

## Step 4 — Resolve ambiguity and confirm data

### System

- Map the Wikipedia platforms to systems that appear in `games.csv` (read in Step 2).
- If the game shipped on multiple platforms **and more than one maps to a system in the library**, ask the user to pick via `AskUserQuestion`. Use the existing system names as options, plus "Other" appended automatically.
- If it maps unambiguously to one system, use it without asking.

### Release date

- Always use the **North America release date**. If no NA-specific date is available, use the worldwide date.
- For a **port or enhanced edition**, use the game's **original NA release date**, not the port's (e.g. Portal on Switch keeps its 2007 date).
- No need to ask the user about dates — just resolve it and move on.

### Genres

- Use the genres exactly as listed in the Wikipedia infobox side panel.
- Map them to genres that already exist in `games.csv` (read in Step 2) where there is a clear match.
- If a Wikipedia genre doesn't match any existing genre, include it as-is — new genres are fine.
- Do not limit genres to any fixed list.

After resolving all fields, **output a single summary message** to the user showing the game name, system, release date, and genres you found. Note anything that was ambiguous.

---

## Step 5 — Collect mode-specific fields via dialog

### If mode = games

Use `AskUserQuestion` with **one question**:

1. **Rating** — options: `Perfect`, `Great`, `Good`, `Okay`. "Other" is auto-appended; the user can note `Bad` or leave blank. If the user says they're **currently playing** the game (not finished), skip this question and leave the rating blank.

Play state (currently playing / last played) is not collected here — it lives
in `sessions.csv`. If the user is currently playing the game, mention they can
run the **now-playing** skill afterward to mark it on the CRT (this skill does
not touch `sessions.csv`).

### If mode = wishlist

Use `AskUserQuestion` with exactly **two questions**:

1. **Starred?** — options: `Yes`, `No`.
2. **Notes** — options: `No notes`, `Replay`. "Other" is auto-appended for anything custom (e.g. "Recommended for Pao", "Remake of X").

---

## Step 6 — Fetch cover art from IGDB

Check whether credentials are set:

```bash
[ -n "${IGDB_CLIENT_ID}" ] && [ -n "${IGDB_CLIENT_SECRET}" ] && echo "ok" || echo "missing"
```

If `missing`, stop and tell the user: "Cannot continue — `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` must be set in your environment."

### Get an access token:

```bash
curl -s -X POST \
  "https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
```

### Search IGDB for up to 4 matches:

```bash
curl -s -X POST "https://api.igdb.com/v4/games" \
  -H "Client-ID: ${IGDB_CLIENT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: text/plain" \
  -d 'search "GAME_NAME"; fields name, cover.url; where cover != null; limit 4;'
```

For each result, upgrade `cover.url`: replace `t_thumb` → `t_cover_big` and `//` → `https://`.

---

## Step 7 — Preview and confirm cover

For each IGDB result show:

- The matched game title
- The cover: `![cover](IMAGE_URL)`
- The raw image URL

Use `AskUserQuestion` with one option per match plus "Skip cover art".

---

## Step 8 — Write to the target CSV

Get today's date (wishlist only):

```bash
date +%F
```

**If mode = games**, append to `games.csv`:

```
NAME,SYSTEM,RATING,GENRE,RELEASE_DATE,IMAGE_URL
```

**If mode = wishlist**, append to `wishlist.csv`:

```
NAME,SYSTEM,GENRE,RELEASE_DATE,IMAGE_URL,STARRED,DATE_ADDED,NOTES
```

- `starred`: `true` if the user said Yes, otherwise empty
- `date_added`: today's date from `date +%F`
- `notes`: the user's answer, or empty if "No notes"

Use `printf '%s\n' 'ROW' >> /full/path/to/FILE.csv` to append.

- Wrap `name` in double quotes if it contains a comma
- Join genres with `|`
- Leave empty fields as empty strings between commas

Print a confirmation showing the exact row appended.

---

## Notes

- If Wikipedia returns no infobox or the page can't be found, fall back to asking the user for genres, platform, and release date manually.
- If IGDB returns no results, offer to retry with a different search term or accept a direct URL.
- If the user skips cover art, use empty string for `image_url`.
- Do not run `fetch-covers.ts`.
- Do not commit or push — only modify the target CSV.
- If the game was added as currently being played, offer to run the `now-playing` skill next to flag it.
