"""Tests for now_playing.py's pure functions. No file I/O — run directly:

    python3 .claude/tools/test_now_playing.py
"""

import sys

from now_playing import find_matches, flagged_names, set_flag


def rows_fixture() -> list[list[str]]:
    # Mirrors games.csv shape: most rows have 7 fields (no currently_playing),
    # flagged rows have 8.
    return [
        ["Persona 5", "PS4", "Great", "JRPG", "2017-04-04", "2017-04-04", "url1"],
        ["Persona 5 Royal", "Nintendo Switch", "", "JRPG", "2019-10-31", "", "url2"],
        ["Mixtape", "Nintendo Switch 2", "Great", "Adventure", "2026-05-07", "2026-06-30", "url3", "true"],
    ]


def test_exact_match_beats_substring() -> None:
    rows = rows_fixture()
    # "Persona 5" is a substring of "Persona 5 Royal" — exact must win alone.
    assert find_matches(rows, "Persona 5") == [0]
    assert find_matches(rows, "persona 5 ROYAL") == [1]


def test_substring_fallback_and_ambiguity() -> None:
    rows = rows_fixture()
    assert find_matches(rows, "mixta") == [2]
    # No exact "persona" row → substring matches both.
    assert find_matches(rows, "persona") == [0, 1]
    assert find_matches(rows, "zelda") == []


def test_flagged_names_ignores_short_rows() -> None:
    rows = rows_fixture()
    assert flagged_names(rows, 7) == ["Mixtape"]


def test_set_flag_pads_short_rows() -> None:
    rows = rows_fixture()
    set_flag(rows, 1, 7, "true")
    assert rows[1][7] == "true"
    assert len(rows[1]) == 8
    # Other fields untouched.
    assert rows[1][0] == "Persona 5 Royal"
    assert flagged_names(rows, 7) == ["Persona 5 Royal", "Mixtape"]


def test_unset_clears_flag() -> None:
    rows = rows_fixture()
    set_flag(rows, 2, 7, "")
    assert flagged_names(rows, 7) == []


def main() -> None:
    tests = [v for k, v in globals().items() if k.startswith("test_")]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL {test.__name__}: {e}")
    if failures:
        sys.exit(1)
    print(f"{len(tests)} tests passed")


if __name__ == "__main__":
    main()
