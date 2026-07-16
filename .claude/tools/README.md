# Skill tools

Standalone scripts that skills call, instead of embedding logic inside a
`SKILL.md`. Keeping substantial logic here makes it testable, keeps skill files
readable as instructions, and avoids re-pasting fragile multi-line heredocs
into shell calls on every run.

## Design conventions

- **Subcommands are dispatched off `sys.argv`** — no `argparse`. At this scale
  the ceremony isn't worth it.
- **Each command does its own HTTP and prints JSON to stdout.** The calling
  skill runs one command and parses the result; it never pipes `curl` into an
  inline interpreter.
- **HTTP goes through `curl`, not `urllib`.** The python.org build of Python on
  macOS ships without a CA bundle, so `urllib`'s TLS verification fails.
  `curl` uses the system keychain and works.
- **Keep pure logic pure.** Parsing/transform functions take data in and return
  data out with no network, so they can be unit-tested against fixtures.
- Run scripts from the **project root**: `python3 .claude/tools/<script>.py ...`

## Tools

### `wikipedia.py` — used by the `add-game` skill

```bash
python3 .claude/tools/wikipedia.py search "Hollow Knight"
# -> ["Hollow Knight", "Hollow Knight: Silksong", ...]

python3 .claude/tools/wikipedia.py infobox "Hollow Knight"
# -> {"genre": "...", "platforms": "...", "released_raw": "..."}
#    or {"error": "no_infobox"}
```

`parse_infobox()` is a pure function (wikitext string in, dict out).

### `now_playing.py` — used by the `now-playing` skill

Manages play sessions in `sessions.csv` (one row per playthrough:
`game,start_date,end_date`). An open session — empty `end_date` — means the
game is being played now, which is the source of truth for "currently playing".

```bash
python3 .claude/tools/now_playing.py list
# -> {"currently_playing": ["Persona 5 Royal"]}

python3 .claude/tools/now_playing.py set "Persona 5 Royal"   # open a session
# -> {"set": "Persona 5 Royal", "since": "2026-07-15", "also_playing": ["Mixtape"]}
#    or {"error": "already_playing" | "not_found" | "ambiguous", ...} (exit 1)

python3 .claude/tools/now_playing.py stop "Mixtape"          # close its session
# -> {"stopped": "Mixtape", "ended": "2026-07-15", "still_playing": ["Persona 5 Royal"]}
#    or {"error": "not_playing" | "ambiguous", ...} (exit 1)

python3 .claude/tools/now_playing.py rate "Mixtape" "Great"  # set games.csv rating
# -> {"rated": "Mixtape", "rating": "Great"}
#    or {"error": "invalid_rating" | "not_found" | "ambiguous", ...} (exit 1)
```

`set`/`stop` rewrite `sessions.csv`; `rate` rewrites the `rating` column in
`games.csv`. `set` resolves the name against `games.csv` (won't open a session
for a game that isn't in the library); `stop` resolves against currently-open
sessions. Name matching is exact (case-insensitive) with substring fallback.
`find_matches()`, `is_open()`, `open_session_names()`, `find_open_index()`, and
`close_session()` are pure functions.

## Tests

```bash
python3 .claude/tools/test_wikipedia.py
python3 .claude/tools/test_now_playing.py
```

Fixture-based, no network. Exits non-zero on failure.
