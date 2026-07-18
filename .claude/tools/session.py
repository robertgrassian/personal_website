"""Manage play sessions (sessions.csv) — used by the session skill.

A session is one playthrough: it opens when you start a game and closes when
you finish/drop it. An open session (empty end_date) means the game is being
played now — this is the source of truth for "currently playing", replacing the
old currently_playing / last_played columns on games.csv.

Usage (from the project root):
    python3 .claude/tools/session.py list
    python3 .claude/tools/session.py set "Game Name"      # open a session (start today)
    python3 .claude/tools/session.py stop "Game Name"     # close its session (end today)
    python3 .claude/tools/session.py rate "Game Name" "Great"  # set games.csv rating
    python3 .claude/tools/session.py log "Game Name" [START] [END]  # log an arbitrary session

`log` is the general form: START defaults to today, END defaults to empty (an
open/currently-playing session). Both dates are ISO (YYYY-MM-DD). `set` is just
`log NAME` and `stop` closes an already-open session with today's date; `log`
adds the missing case — a fully-past session, or one that started before today.

Prints JSON to stdout. Hard errors (bad usage, missing file, no match, ambiguous
match, already/not playing, invalid rating, invalid date) print {"error": ...}
and exit non-zero so callers can branch.
"""

import csv
import io
import json
import sys
from datetime import date
from pathlib import Path

SESSIONS_PATH = Path("sessions.csv")
GAMES_PATH = Path("games.csv")

# sessions.csv columns.
SESSIONS_HEADER = ["game", "start_date", "end_date"]
GAME, START, END = 0, 1, 2

# games.csv columns we touch.
NAME_COLUMN = "name"
RATING_COLUMN = "rating"
# Mirrors RATINGS in src/lib/games.ts — keep in sync.
VALID_RATINGS = ("Perfect", "Great", "Good", "Okay", "Bad")


# --- Pure logic (unit-testable, no I/O) ---


def find_matches(names: list[str], query: str) -> list[int]:
    """Indices of names matching query, exact (case-insensitive) first.

    Falls back to substring matching only when there is no exact match, so
    "Persona 5" matches its own entry even though "Persona 5 Royal" also exists.
    """
    target = query.strip().lower()
    exact = [i for i, n in enumerate(names) if n.strip().lower() == target]
    if exact:
        return exact
    return [i for i, n in enumerate(names) if target in n.strip().lower()]


def is_open(row: list[str]) -> bool:
    """True if a session row has no end date (still being played).

    A short row (missing the end_date field entirely) counts as open.
    """
    return len(row) <= END or row[END].strip() == ""


def open_session_names(sessions: list[list[str]]) -> list[str]:
    """Names of all games with an open session (currently playing)."""
    return [r[GAME] for r in sessions if r and is_open(r)]


def find_open_index(sessions: list[list[str]], game: str) -> int:
    """Row index of the open session for game (case-insensitive), or -1."""
    target = game.strip().lower()
    for i, r in enumerate(sessions):
        if r and is_open(r) and r[GAME].strip().lower() == target:
            return i
    return -1


def close_session(sessions: list[list[str]], index: int, end_date: str) -> None:
    """Set the end date on sessions[index], padding a short row if needed."""
    row = sessions[index]
    while len(row) <= END:
        row.append("")
    row[END] = end_date


def parse_date(value: str) -> str | None:
    """Normalize an ISO date string, or None if it isn't a valid YYYY-MM-DD.

    date.fromisoformat both validates and canonicalizes (e.g. rejects
    2026-13-40 and month/day out of range), so the returned string is always a
    real calendar date in YYYY-MM-DD form.
    """
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None


# --- I/O helpers ---


def fail(payload: dict) -> None:
    print(json.dumps(payload))
    sys.exit(1)


def load_sessions() -> tuple[list[str], list[list[str]]]:
    """Read sessions.csv. Returns a default header + empty rows if it's absent,
    so the first `set` creates the file."""
    if not SESSIONS_PATH.exists():
        return SESSIONS_HEADER[:], []
    with SESSIONS_PATH.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader, SESSIONS_HEADER[:])
        rows = [r for r in reader if r]  # drop blank lines
    if not header or header[GAME] != "game":
        fail({"error": "unexpected_header", "header": header})
    return header, rows


def load_games() -> tuple[list[str], list[list[str]]]:
    if not GAMES_PATH.exists():
        fail({"error": "file_not_found", "path": str(GAMES_PATH)})
    with GAMES_PATH.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = [r for r in reader if r]
    if NAME_COLUMN != header[0]:
        fail({"error": "unexpected_header", "header": header})
    if RATING_COLUMN not in header:
        fail({"error": "missing_column", "column": RATING_COLUMN, "header": header})
    return header, rows


def save(path: Path, header: list[str], rows: list[list[str]]) -> None:
    # QUOTE_MINIMAL matches the existing files: fields are only quoted when they
    # contain a comma. lineterminator avoids \r\n on any platform.
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    path.write_text(buf.getvalue())


def resolve_single(names: list[str], query: str) -> int:
    matches = find_matches(names, query)
    if not matches:
        fail({"error": "not_found", "name": query})
    if len(matches) > 1:
        fail({"error": "ambiguous", "name": query, "candidates": [names[i] for i in matches]})
    return matches[0]


# --- Commands ---


def cmd_list() -> None:
    _, sessions = load_sessions()
    print(json.dumps({"currently_playing": open_session_names(sessions)}))


def cmd_set(query: str) -> None:
    # Resolve against games.csv so the session stores the game's canonical name
    # (and so we don't open a session for a game that isn't in the library).
    _, games_rows = load_games()
    game_names = [r[0] for r in games_rows]
    canonical = game_names[resolve_single(game_names, query)]

    header, sessions = load_sessions()
    existing = find_open_index(sessions, canonical)
    if existing != -1:
        fail({"error": "already_playing", "name": canonical, "since": sessions[existing][START]})

    today = date.today().isoformat()
    sessions.append([canonical, today, ""])
    save(SESSIONS_PATH, header, sessions)

    others = [n for n in open_session_names(sessions) if n != canonical]
    print(json.dumps({"set": canonical, "since": today, "also_playing": others}))


def cmd_log(query: str, start: str | None, end: str | None) -> None:
    """Append an arbitrary session. START defaults to today; END empty = open.

    This is the general form of `set`/`stop`: it can record a fully-past
    playthrough (both dates given) or a session that started before today and is
    still open (start given, end omitted).
    """
    # Resolve against games.csv so we store the canonical name and don't log a
    # session for a game that isn't in the library (same rule as `set`).
    _, games_rows = load_games()
    game_names = [r[0] for r in games_rows]
    canonical = game_names[resolve_single(game_names, query)]

    start_norm = date.today().isoformat() if start is None else parse_date(start)
    if start_norm is None:
        fail({"error": "invalid_date", "field": "start", "value": start})

    if end is None:
        end_norm = ""
    else:
        end_norm = parse_date(end)
        if end_norm is None:
            fail({"error": "invalid_date", "field": "end", "value": end})
        if end_norm < start_norm:
            fail({"error": "end_before_start", "start": start_norm, "end": end_norm})

    header, sessions = load_sessions()
    # An open (end-less) log is "currently playing"; a second open session for
    # the same game is meaningless, so guard it exactly like `set`.
    if not end_norm:
        existing = find_open_index(sessions, canonical)
        if existing != -1:
            fail({"error": "already_playing", "name": canonical, "since": sessions[existing][START]})

    sessions.append([canonical, start_norm, end_norm])
    save(SESSIONS_PATH, header, sessions)

    others = [n for n in open_session_names(sessions) if n != canonical]
    print(json.dumps({
        "logged": canonical,
        "start": start_norm,
        "end": end_norm or None,
        "open": not end_norm,
        "also_playing": others,
    }))


def cmd_stop(query: str) -> None:
    header, sessions = load_sessions()
    open_names = open_session_names(sessions)
    if not open_names:
        fail({"error": "not_playing", "name": query})
    canonical = open_names[resolve_single(open_names, query)]

    index = find_open_index(sessions, canonical)
    today = date.today().isoformat()
    close_session(sessions, index, today)
    save(SESSIONS_PATH, header, sessions)

    still = open_session_names(sessions)
    print(json.dumps({"stopped": canonical, "ended": today, "still_playing": still}))


def cmd_rate(query: str, rating: str) -> None:
    valid = {r.lower(): r for r in VALID_RATINGS}
    canonical_rating = valid.get(rating.strip().lower())
    if canonical_rating is None:
        fail({"error": "invalid_rating", "rating": rating, "valid": list(VALID_RATINGS)})

    header, rows = load_games()
    names = [r[0] for r in rows]
    index = resolve_single(names, query)
    rating_col = header.index(RATING_COLUMN)
    row = rows[index]
    while len(row) <= rating_col:
        row.append("")
    row[rating_col] = canonical_rating
    save(GAMES_PATH, header, rows)

    print(json.dumps({"rated": rows[index][0], "rating": canonical_rating}))


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("list", "set", "stop", "rate", "log"):
        fail({"error": "usage", "usage": "session.py list | set NAME | stop NAME | rate NAME RATING | log NAME [START] [END]"})
    command = sys.argv[1]

    if command == "list":
        cmd_list()
        return

    if len(sys.argv) < 3 or not sys.argv[2].strip():
        fail({"error": "usage", "usage": f"session.py {command} NAME"})
    name = sys.argv[2]

    if command == "set":
        cmd_set(name)
    elif command == "stop":
        cmd_stop(name)
    elif command == "rate":
        if len(sys.argv) < 4 or not sys.argv[3].strip():
            fail({"error": "usage", "usage": "session.py rate NAME RATING"})
        cmd_rate(name, sys.argv[3])
    elif command == "log":
        # Optional positional dates: log NAME [START] [END]. A missing or blank
        # slot is None → start defaults to today, end to open.
        start = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3].strip() else None
        end = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4].strip() else None
        cmd_log(name, start, end)


if __name__ == "__main__":
    main()
