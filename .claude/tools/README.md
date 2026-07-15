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

```bash
python3 .claude/tools/now_playing.py list
# -> {"currently_playing": ["Mixtape"]}

python3 .claude/tools/now_playing.py set "Persona 5 Royal"
# -> {"set": "Persona 5 Royal", "also_playing": ["Mixtape"]}
#    or {"error": "not_found" | "ambiguous", ...} (exit 1)

python3 .claude/tools/now_playing.py unset "Mixtape"
# -> {"unset": "Mixtape", "still_playing": ["Persona 5 Royal"]}
```

Rewrites `games.csv` with the flag toggled; name matching is exact
(case-insensitive) with substring fallback. `find_matches()`, `set_flag()`,
and `flagged_names()` are pure functions.

## Tests

```bash
python3 .claude/tools/test_wikipedia.py
python3 .claude/tools/test_now_playing.py
```

Fixture-based, no network. Exits non-zero on failure.
