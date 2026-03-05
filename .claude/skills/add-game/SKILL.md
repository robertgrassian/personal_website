---
name: add-game
description: "Add a game to games.csv and fetch its cover art from IGDB. Prompts for all required fields, previews the cover, and confirms before writing."
argument-hint: "[game name (optional)]"
---

You are adding a game to `games.csv` at the project root. The CSV columns are:

```
name,system,rating,genre,release_date,first_played,image_url
```

- `genre` is pipe-separated for multiple genres (e.g. `Action-Adventure|Puzzle`)
- `rating` must be one of: `Perfect`, `Great`, `Good`, `Okay`, `Bad`, or empty
- `release_date` is ISO format: `YYYY-MM-DD`, or empty
- `first_played` is a 4-digit year (e.g. `2024`), or empty

---

## Step 1 — Collect system and rating via dialog

Use `AskUserQuestion` with exactly **two questions** — system and rating — both of which are pure option pickers with no free-text input needed:

1. **System** — options: `PS5`, `Nintendo Switch`, `Nintendo Switch 2`, `PC`. "Other" is auto-appended for anything else; the user can note it there.
2. **Rating** — options: `Perfect`, `Great`, `Good`, `Okay`. "Other" is auto-appended; the user can note `Bad` or leave it blank there.

Do not ask for genres or dates here.

---

## Step 2 — Collect genres, dates, and game name via chat

After the dialog, output the following prompt as a single message and wait for the user's reply. Replace `[GAME NAME]` with the actual game name if it was provided; otherwise ask for it in the same message.

```
A few more fields for [GAME NAME] — reply in one message:

Genre(s): (comma-separated; e.g. "Third-person Shooter, Survival")
  Known genres: Action, Action RPG, Action-Adventure, Adventure, Battle Royale,
  Deck-building, Fighting, First Person Shooter, Metroidvania, Party, Platform,
  Puzzle, Racing, Real-time Strategy, Rhythm, Roguelike, RPG, Sandbox,
  Social Simulation, Sports, Survival, Survival Horror, Third-person Shooter,
  Turn-based Strategy, Visual Novel — or type anything custom.

Release date (YYYY-MM-DD or skip):
Year first played (YYYY or skip):
```

Parse the user's reply:

- Split `Genre(s)` on commas; trim whitespace from each; join with `|` for the CSV
- Treat "skip", "blank", "-", or missing values as empty string for dates
- If game name was not provided via arguments, extract it from the reply too

---

## Step 3 — Fetch cover art from IGDB

Check whether `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` are set without echoing their values:

```bash
[ -n "${IGDB_CLIENT_ID}" ] && [ -n "${IGDB_CLIENT_SECRET}" ] && echo "ok" || echo "missing"
```

If the output is `missing`, stop and tell the user: "Cannot continue — `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` must be set in your environment."

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

## Step 4 — Preview and confirm cover

For each IGDB result, show:

- The matched game title
- The cover as markdown: `![cover](IMAGE_URL)`
- The raw image URL

Use `AskUserQuestion` with one option per match (pure option-picking, no typing needed), plus a "Skip cover art" option.

---

## Step 5 — Write to games.csv

Append the row using `printf` (safer than `echo` with special characters):

```bash
printf '%s\n' 'NAME,SYSTEM,RATING,GENRE,RELEASE_DATE,FIRST_PLAYED,IMAGE_URL' >> /full/path/to/games.csv
```

- Wrap `name` in double quotes if it contains a comma
- Join genres with `|`
- Leave empty fields as empty strings between commas

Print a confirmation showing the exact row appended.

---

## Notes

- If IGDB returns no results, offer to retry with a different search term or accept a direct URL.
- If the user skips cover art, use empty string for `image_url`.
- Do not run `fetch-covers.ts`.
- Do not commit or push — only modify `games.csv`.
