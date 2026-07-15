"""Manage the currently_playing flag in games.csv — used by the now-playing skill.

Usage (from the project root):
    python3 .claude/tools/now_playing.py list
    python3 .claude/tools/now_playing.py set "Game Name"
    python3 .claude/tools/now_playing.py unset "Game Name"

Prints JSON to stdout. Hard errors (bad usage, missing file/column, no match,
ambiguous match) print {"error": ...} and exit non-zero so callers can branch.
"""

import csv
import io
import json
import sys
from pathlib import Path

CSV_PATH = Path("games.csv")
COLUMN = "currently_playing"
NAME_COLUMN = "name"


# --- Pure logic (unit-testable, no I/O) ---


def find_matches(rows: list[list[str]], name: str) -> list[int]:
    """Indices of rows whose name matches, exact (case-insensitive) first.

    Falls back to substring matching only when there is no exact match, so
    "Persona 5" matches its own row even though "Persona 5 Royal" also exists.
    """
    target = name.strip().lower()
    exact = [i for i, r in enumerate(rows) if r and r[0].strip().lower() == target]
    if exact:
        return exact
    return [i for i, r in enumerate(rows) if r and target in r[0].strip().lower()]


def flagged_names(rows: list[list[str]], col: int) -> list[str]:
    """Names of all rows whose currently_playing field is "true"."""
    return [r[0] for r in rows if len(r) > col and r[col].strip() == "true"]


def set_flag(rows: list[list[str]], index: int, col: int, value: str) -> None:
    """Set rows[index][col] to value, padding the row if it's short.

    Most rows omit trailing optional columns entirely; padding with "" keeps
    every other field untouched.
    """
    row = rows[index]
    while len(row) <= col:
        row.append("")
    row[col] = value


# --- I/O helpers ---


def fail(payload: dict) -> None:
    print(json.dumps(payload))
    sys.exit(1)


def load() -> tuple[list[str], list[list[str]]]:
    if not CSV_PATH.exists():
        fail({"error": "file_not_found", "path": str(CSV_PATH)})
    with CSV_PATH.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = [r for r in reader if r]  # drop blank lines
    if NAME_COLUMN != header[0]:
        fail({"error": "unexpected_header", "header": header})
    if COLUMN not in header:
        fail({"error": "missing_column", "column": COLUMN, "header": header})
    return header, rows


def save(header: list[str], rows: list[list[str]]) -> None:
    # QUOTE_MINIMAL matches the existing file: fields are only quoted when they
    # contain a comma. lineterminator avoids \r\n on any platform.
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    CSV_PATH.write_text(buf.getvalue())


def resolve_single(rows: list[list[str]], name: str) -> int:
    matches = find_matches(rows, name)
    if not matches:
        fail({"error": "not_found", "name": name})
    if len(matches) > 1:
        fail({"error": "ambiguous", "name": name, "candidates": [rows[i][0] for i in matches]})
    return matches[0]


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("list", "set", "unset"):
        fail({"error": "usage", "usage": "now_playing.py list | set NAME | unset NAME"})
    command = sys.argv[1]

    header, rows = load()
    col = header.index(COLUMN)

    if command == "list":
        print(json.dumps({"currently_playing": flagged_names(rows, col)}))
        return

    if len(sys.argv) < 3 or not sys.argv[2].strip():
        fail({"error": "usage", "usage": f"now_playing.py {command} NAME"})
    index = resolve_single(rows, sys.argv[2])

    set_flag(rows, index, col, "true" if command == "set" else "")
    save(header, rows)

    others = [n for n in flagged_names(rows, col) if n != rows[index][0]]
    if command == "set":
        print(json.dumps({"set": rows[index][0], "also_playing": others}))
    else:
        print(json.dumps({"unset": rows[index][0], "still_playing": others}))


if __name__ == "__main__":
    main()
