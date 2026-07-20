"""Integration tests for the public user read endpoints against the seeded
local database (same skip pattern as test_db_constraints.py: they run only
when DATABASE_URL is set).

Expectations are DERIVED from the repo-root CSVs at test time via the seed's
own pure parsers, so tests keep passing as the CSVs grow (they are living
data — /add-game and rating changes mutate them routinely). Pinned literals
here would break on the next reseed for non-code reasons. Play-state
*semantics* are owned by test_play_state.py with hand-built cases; these
tests only assert liveness and wiring against whatever the CSVs currently say.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from scripts.seed import parse_game_rows, parse_wishlist_rows, read_csv

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

# The exact wire keys of the TS types being mirrored (src/lib/games.ts,
# src/lib/wishlist.ts) — camelCase, via the schema alias generator.
GAME_KEYS = {
    "name",
    "system",
    "genres",
    "releaseDate",
    "imageUrl",
    "rating",
    "lastPlayed",
    "currentlyPlaying",
    "playingSince",
}
WISHLIST_KEYS = {
    "name",
    "system",
    "genres",
    "releaseDate",
    "imageUrl",
    "starred",
    "dateAdded",
    "notes",
}


def expected_games() -> list[dict]:
    return parse_game_rows(read_csv("games.csv"), [])


def expected_wishlist() -> list[dict]:
    return parse_wishlist_rows(read_csv("wishlist.csv"), [])


def session_names(open_only: bool) -> set[str]:
    """Game names that have at least one open (or closed) session in the CSV."""
    rows = read_csv("sessions.csv")
    if open_only:
        return {r["game"].strip() for r in rows if not (r.get("end_date") or "").strip()}
    return {r["game"].strip() for r in rows if (r.get("end_date") or "").strip()}


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


@requires_db
def test_games_returns_full_library_with_camel_case_keys(client: TestClient) -> None:
    response = client.get("/api/py/users/rgrassian/games")
    assert response.status_code == 200
    games = response.json()
    expected = expected_games()
    assert len(games) == len(expected)
    for game in games:
        assert set(game) == GAME_KEYS
    # Deterministic order (by id = insertion order = CSV order).
    assert games[0]["name"] == expected[0]["name"]


@requires_db
def test_open_session_games_are_currently_playing(client: TestClient) -> None:
    open_names = session_names(open_only=True)
    if not open_names:
        pytest.skip("sessions.csv currently has no open session")
    games = client.get("/api/py/users/rgrassian/games").json()
    by_name = {g["name"]: g for g in games}
    for name in open_names:
        game = by_name[name]
        assert game["currentlyPlaying"] is True, name
        assert game["playingSince"] != "", name
    # Everything else is not currently playing.
    for game in games:
        if game["name"] not in open_names:
            assert game["currentlyPlaying"] is False, game["name"]
            assert game["playingSince"] == "", game["name"]


@requires_db
def test_closed_session_games_have_last_played(client: TestClient) -> None:
    closed_names = session_names(open_only=False)
    if not closed_names:
        pytest.skip("sessions.csv currently has no closed session")
    games = client.get("/api/py/users/rgrassian/games").json()
    by_name = {g["name"]: g for g in games}
    for name in closed_names:
        assert by_name[name]["lastPlayed"] != "", name


@requires_db
def test_game_without_sessions_has_empty_play_state(client: TestClient) -> None:
    in_sessions = session_names(open_only=True) | session_names(open_only=False)
    expected = next(g for g in expected_games() if g["name"] not in in_sessions)
    games = client.get("/api/py/users/rgrassian/games").json()
    game = next(g for g in games if g["name"] == expected["name"])
    assert game["currentlyPlaying"] is False
    assert game["lastPlayed"] == ""
    assert game["playingSince"] == ""
    # Scalar fields round-trip from the CSV parse ("" for NULL on the wire).
    assert game["rating"] == (expected["rating"] or "")
    assert game["genres"] == expected["genres"]
    expected_date = expected["release_date"].isoformat() if expected["release_date"] else ""
    assert game["releaseDate"] == expected_date


@requires_db
def test_username_lookup_is_case_insensitive(client: TestClient) -> None:
    # citext username: /users/Rgrassian resolves to the same profile.
    response = client.get("/api/py/users/Rgrassian/games")
    assert response.status_code == 200
    assert len(response.json()) == len(expected_games())


@requires_db
def test_wishlist_returns_all_items_with_camel_case_keys(client: TestClient) -> None:
    response = client.get("/api/py/users/rgrassian/wishlist")
    assert response.status_code == 200
    items = response.json()
    expected = expected_wishlist()
    assert len(items) == len(expected)
    for item in items:
        assert set(item) == WISHLIST_KEYS
    first, expected_first = items[0], expected[0]
    assert first["name"] == expected_first["name"]
    assert first["starred"] is expected_first["starred"]
    assert first["dateAdded"] == expected_first["date_added"].isoformat()
    assert first["notes"] == expected_first["notes"]


@requires_db
def test_profile_returns_public_fields_and_counts(client: TestClient) -> None:
    response = client.get("/api/py/users/rgrassian")
    assert response.status_code == 200
    # Exact payload: public data only, no per-viewer fields (spec §7.2).
    assert response.json() == {
        "username": "rgrassian",
        "displayName": "Robert",
        "followerCount": 0,
        "followingCount": 0,
    }


@requires_db
@pytest.mark.parametrize(
    "path",
    [
        "/api/py/users/nobody",
        "/api/py/users/nobody/games",
        "/api/py/users/nobody/wishlist",
    ],
)
def test_unknown_username_returns_404(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 404
    # FastAPI's standard error shape, consistent across all three routes.
    assert response.json() == {"detail": "User 'nobody' not found"}


@requires_db
def test_health_includes_db_ok(client: TestClient) -> None:
    response = client.get("/api/py/health")
    assert response.status_code == 200
    assert response.json()["db"] == "ok"
