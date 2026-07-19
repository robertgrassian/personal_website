"""Integration tests for the public user read endpoints against the seeded
local database (same skip pattern as test_db_constraints.py: they run only
when DATABASE_URL is set).

Expectations are pinned to the seed data (scripts/seed.py over the repo-root
CSVs): 155 games, 29 wishlist items, open sessions for Persona 5 Royal and
Palworld, no follows.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app

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


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


@requires_db
def test_games_returns_full_library_with_camel_case_keys(client: TestClient) -> None:
    response = client.get("/api/py/users/robert/games")
    assert response.status_code == 200
    games = response.json()
    assert len(games) == 155
    for game in games:
        assert set(game) == GAME_KEYS
    # Deterministic order (by id = insertion order = CSV order).
    assert games[0]["name"] == "The Legend of Zelda: A Link Between Worlds"


@requires_db
def test_currently_playing_game_state(client: TestClient) -> None:
    games = client.get("/api/py/users/robert/games").json()
    persona = next(g for g in games if g["name"] == "Persona 5 Royal")
    assert persona["currentlyPlaying"] is True
    assert persona["playingSince"] == "2026-07-13"
    # Its only session is open, so lastPlayed stays "" — an open session
    # never counts as "last played".
    assert persona["lastPlayed"] == ""
    # Unrated in the CSV → "" on the wire, never null.
    assert persona["rating"] == ""


@requires_db
def test_closed_session_game_state(client: TestClient) -> None:
    games = client.get("/api/py/users/robert/games").json()
    mixtape = next(g for g in games if g["name"] == "Mixtape")
    assert mixtape["rating"] == "Great"
    assert mixtape["currentlyPlaying"] is False
    assert mixtape["playingSince"] == ""
    assert mixtape["lastPlayed"] == "2026-06-30"


@requires_db
def test_game_without_sessions_has_empty_play_state(client: TestClient) -> None:
    games = client.get("/api/py/users/robert/games").json()
    zelda = next(g for g in games if g["name"] == "The Legend of Zelda: A Link Between Worlds")
    assert zelda["currentlyPlaying"] is False
    assert zelda["lastPlayed"] == ""
    assert zelda["playingSince"] == ""
    assert zelda["rating"] == "Good"
    assert zelda["releaseDate"] == "2013-11-22"
    assert zelda["genres"] == ["Action-Adventure"]


@requires_db
def test_username_lookup_is_case_insensitive(client: TestClient) -> None:
    # citext username: /users/Robert resolves to the same profile.
    response = client.get("/api/py/users/Robert/games")
    assert response.status_code == 200
    assert len(response.json()) == 155


@requires_db
def test_wishlist_returns_all_items_with_camel_case_keys(client: TestClient) -> None:
    response = client.get("/api/py/users/robert/wishlist")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 29
    for item in items:
        assert set(item) == WISHLIST_KEYS
    first = items[0]
    assert first["name"] == "Disco Elysium"
    assert first["starred"] is False
    assert first["dateAdded"] == "2026-04-17"
    assert first["notes"] == ""


@requires_db
def test_profile_returns_public_fields_and_counts(client: TestClient) -> None:
    response = client.get("/api/py/users/robert")
    assert response.status_code == 200
    # Exact payload: public data only, no per-viewer fields (spec §7.2).
    assert response.json() == {
        "username": "robert",
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
