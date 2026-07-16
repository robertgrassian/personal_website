"""Tests for now_playing.py's pure functions. No file I/O — run directly:

    python3 .claude/tools/test_now_playing.py
"""

import sys

from now_playing import (
    close_session,
    find_matches,
    find_open_index,
    is_open,
    open_session_names,
)


def sessions_fixture() -> list[list[str]]:
    # Mirrors sessions.csv shape: [game, start_date, end_date].
    # An empty (or missing) end_date means the session is open (playing now).
    return [
        ["Persona 5 Royal", "2026-07-14", ""],  # open
        ["Mixtape", "2026-06-30", "2026-06-30"],  # finished
        ["Borderlands 3", "2021-01-01"],  # short row — also open
    ]


def game_names_fixture() -> list[str]:
    return ["Persona 5", "Persona 5 Royal", "Mixtape"]


def test_exact_match_beats_substring() -> None:
    names = game_names_fixture()
    # "Persona 5" is a substring of "Persona 5 Royal" — exact must win alone.
    assert find_matches(names, "Persona 5") == [0]
    assert find_matches(names, "persona 5 ROYAL") == [1]


def test_substring_fallback_and_ambiguity() -> None:
    names = game_names_fixture()
    assert find_matches(names, "mixta") == [2]
    # No exact "persona" entry → substring matches both.
    assert find_matches(names, "persona") == [0, 1]
    assert find_matches(names, "zelda") == []


def test_is_open_handles_empty_and_short_rows() -> None:
    assert is_open(["Persona 5 Royal", "2026-07-14", ""]) is True
    assert is_open(["Borderlands 3", "2021-01-01"]) is True  # missing end field
    assert is_open(["Mixtape", "2026-06-30", "2026-06-30"]) is False


def test_open_session_names() -> None:
    sessions = sessions_fixture()
    assert open_session_names(sessions) == ["Persona 5 Royal", "Borderlands 3"]


def test_find_open_index_is_case_insensitive() -> None:
    sessions = sessions_fixture()
    assert find_open_index(sessions, "persona 5 royal") == 0
    assert find_open_index(sessions, "Borderlands 3") == 2
    # Mixtape is finished, so it has no open session.
    assert find_open_index(sessions, "Mixtape") == -1


def test_close_session_sets_end_and_pads_short_rows() -> None:
    sessions = sessions_fixture()
    # Close the short (open) Borderlands 3 row — must pad to length 3 first.
    close_session(sessions, 2, "2026-07-15")
    assert sessions[2] == ["Borderlands 3", "2021-01-01", "2026-07-15"]
    assert open_session_names(sessions) == ["Persona 5 Royal"]


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
