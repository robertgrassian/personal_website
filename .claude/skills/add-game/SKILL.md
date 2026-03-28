---
name: add-game
description: "Add a game to games.csv. Looks up release date, platform, and genres from Wikipedia's infobox, fetches cover art from IGDB. Asks only when data is ambiguous."
argument-hint: "[game name (optional)]"
---

You are adding a game to `games.csv` at the project root. The CSV columns are:

```
name,system,rating,genre,release_date,last_played,image_url
```

- `genre` is pipe-separated for multiple genres (e.g. `Action-Adventure|Puzzle`)
- `rating` must be one of: `Perfect`, `Great`, `Good`, `Okay`, `Bad`, or empty
- `release_date` is ISO format: `YYYY-MM-DD`, or empty
- `last_played` is ISO format: `YYYY-MM-DD`, or empty

---

## Step 1 — Determine game name

If the game name was provided as an argument, use it. Otherwise, ask the user for it before proceeding.

---

## Step 2 — Read existing systems and genres from games.csv

Use the Read tool (not Bash) to read the full `games.csv` file, then extract:

- All unique values from the `system` column → use as the option list when asking the user to pick a system
- All unique genre tokens from the `genre` column (split each cell on `|`) → use as a reference when mapping Wikipedia genres

---

## Step 3 — Look up game data on Wikipedia

Search Wikipedia for the game:

```bash
curl -s "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=GAME_NAME+video+game&srlimit=5&format=json" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['query']['search']:
    print(r['title'])
"
```

Pick the most relevant result (clearly a video game, not a film or book adaptation). Then fetch its wikitext:

```bash
curl -s "https://en.wikipedia.org/w/api.php?action=query&titles=PAGE_TITLE&prop=revisions&rvprop=content&rvslots=main&format=json" \
  | python3 -c "
import sys, json, re

data = json.load(sys.stdin)
pages = data['query']['pages']
page = next(iter(pages.values()))
text = page['revisions'][0]['slots']['main']['*']

# Find the infobox using bracket-matching (handles nested templates)
start = text.lower().find('{{infobox video game')
if start == -1:
    print('NO_INFOBOX')
    sys.exit()

depth, i, end = 0, start, -1
while i < len(text):
    if text[i:i+2] == '{{': depth += 1; i += 2
    elif text[i:i+2] == '}}':
        depth -= 1
        if depth == 0: end = i + 2; break
        i += 2
    else: i += 1

infobox = text[start:end] if end > -1 else text[start:]

def extract_field(name, text):
    m = re.search(r'\|\s*' + re.escape(name) + r'\s*=\s*(.*?)(?=\n\s*\||\}\})', text, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else ''

def clean(s):
    s = re.sub(r'\[\[[^\]]*\|([^\]]+)\]\]', r'\1', s)
    s = re.sub(r'\[\[([^\]]+)\]\]', r'\1', s)
    s = re.sub(r'<br\s*/?>', ', ', s, flags=re.IGNORECASE)
    s = re.sub(r'<[^>]+>', '', s)
    return s.strip()

genre_raw   = extract_field('genre', infobox)
plat_raw    = extract_field('platforms', infobox)
rel_raw     = extract_field('released', infobox)

print('=== GENRE ===')
print(clean(genre_raw))
print('=== PLATFORMS ===')
print(clean(plat_raw))
print('=== RELEASED (RAW) ===')
print(rel_raw)
"
```

The `=== RELEASED (RAW) ===` section may contain template markup like `{{vgrelease|NA=...|EU=...}}`. Extract the **North America (NA)** date from it. If no NA-specific date exists, use the earliest worldwide date. Always prefer NA. Convert to `YYYY-MM-DD`.

---

## Step 4 — Resolve ambiguity and confirm data

### System

- Map the Wikipedia platforms to systems that appear in `games.csv` (read in Step 2).
- If the game shipped on multiple platforms **and more than one maps to a system in the library**, ask the user to pick via `AskUserQuestion`. Use the existing system names from `games.csv` as options, plus "Other" appended automatically.
- If it maps unambiguously to one system, use it without asking.

### Release date

- Always use the **North America release date**. If no NA-specific date is available, use the worldwide date.
- No need to ask the user about dates — just resolve it and move on.

### Genres

- Use the genres exactly as listed in the Wikipedia infobox side panel.
- Map them to genres that already exist in `games.csv` (read in Step 2) where there is a clear match.
- If a Wikipedia genre doesn't match any existing genre, include it as-is — new genres are fine.
- Do not limit genres to any fixed list.

After resolving all fields, **output a single summary message** to the user showing the game name, system, release date, and genres you found. Note anything that was ambiguous.

---

## Step 5 — Collect rating and last_played via dialog

Use `AskUserQuestion` with exactly **two questions**:

1. **Rating** — options: `Perfect`, `Great`, `Good`, `Okay`. "Other" is auto-appended; the user can note `Bad` or leave blank.
2. **Last played date** — options: the game's NA release date as the first option (mark it "(Recommended)" if the user is likely unsure, i.e. it was released more than a year ago), then the first day of the current year and 2 prior years (e.g. `2026-01-01`, `2025-01-01`, `2024-01-01`). "Other" is auto-appended for anything else. All dates in `YYYY-MM-DD` format. Do NOT include today's date as an option. Note: `AskUserQuestion` allows a maximum of 4 options — the release date counts as one, leaving room for 3 year entries.

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

## Step 8 — Write to games.csv

Append the row:

```bash
printf '%s\n' 'NAME,SYSTEM,RATING,GENRE,RELEASE_DATE,LAST_PLAYED,IMAGE_URL' >> /full/path/to/games.csv
```

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
- Do not commit or push — only modify `games.csv`.
