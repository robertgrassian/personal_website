"""Unit tests for the play-state derivation pure function (spec §4.3).

No database: PlaySession is instantiated in memory. The cases mirror the
semantics of derivePlayState() in src/lib/gamesServer.ts.
"""

from datetime import date

from app.models import PlaySession
from app.services.users import derive_play_state


def session(start: str, end: str | None) -> PlaySession:
    return PlaySession(
        start_date=date.fromisoformat(start),
        end_date=date.fromisoformat(end) if end else None,
    )


def test_no_sessions() -> None:
    state = derive_play_state([])
    assert state.currently_playing is False
    assert state.last_played == ""
    assert state.playing_since == ""


def test_single_open_session() -> None:
    state = derive_play_state([session("2026-07-13", None)])
    assert state.currently_playing is True
    assert state.playing_since == "2026-07-13"
    # An open session alone never sets last_played.
    assert state.last_played == ""


def test_single_closed_session() -> None:
    state = derive_play_state([session("2026-06-10", "2026-06-20")])
    assert state.currently_playing is False
    assert state.last_played == "2026-06-20"
    assert state.playing_since == ""


def test_closed_sessions_take_newest_end_date() -> None:
    state = derive_play_state(
        [
            session("2026-01-01", "2026-01-15"),
            session("2026-03-01", "2026-03-05"),
            session("2026-02-01", "2026-02-10"),
        ]
    )
    assert state.last_played == "2026-03-05"


def test_mixed_open_and_closed() -> None:
    # Open session drives currently_playing/playing_since; the closed one
    # still supplies last_played independently.
    state = derive_play_state(
        [
            session("2026-06-01", "2026-06-05"),
            session("2026-07-13", None),
        ]
    )
    assert state.currently_playing is True
    assert state.playing_since == "2026-07-13"
    assert state.last_played == "2026-06-05"


def test_multiple_open_sessions_take_newest_start() -> None:
    state = derive_play_state(
        [
            session("2026-07-01", None),
            session("2026-07-13", None),
        ]
    )
    assert state.currently_playing is True
    assert state.playing_since == "2026-07-13"
    assert state.last_played == ""
