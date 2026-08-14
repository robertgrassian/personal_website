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

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
from scripts.seed import parse_game_rows, parse_wishlist_rows, read_csv

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

# The fixtures below build their users through the real write path, so adding
# their games reaches the genre lookup the same way /me/games does. See conftest.
pytestmark = pytest.mark.usefixtures("stub_genre_lookup")

# The exact wire keys of the TS types being mirrored (src/lib/games.ts,
# src/lib/wishlist.ts) — camelCase, via the schema alias generator.
GAME_KEYS = {
    "id",
    "name",
    "system",
    "genres",
    "releaseDate",
    "imageUrl",
    "igdbId",
    "rating",
    "lastPlayed",
    "currentlyPlaying",
    "playingSince",
    "openSessionId",
    "sessionCount",
}
WISHLIST_KEYS = {
    "id",
    "name",
    "system",
    "genres",
    "releaseDate",
    "imageUrl",
    "igdbId",
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
        assert isinstance(game["openSessionId"], int), name
    # Everything else is not currently playing.
    for game in games:
        if game["name"] not in open_names:
            assert game["currentlyPlaying"] is False, game["name"]
            assert game["playingSince"] == "", game["name"]
            assert game["openSessionId"] is None, game["name"]


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
    body = response.json()
    # Exact key set, which is the actual contract here: public data only, no
    # per-viewer fields (amIFollowing and friends live on /me/relationship).
    assert set(body) == {"username", "displayName", "followerCount", "followingCount"}
    assert body["username"] == "rgrassian"
    assert body["displayName"] == "Robert"
    # The counts are live COUNT(*)s over the follow graph, so pinning them to 0
    # would make this test depend on which other tests have signed users up
    # (each signup auto-follows the founder). Assert the type, not a number;
    # test_follows_api.py covers the counts moving.
    assert isinstance(body["followerCount"], int)
    assert isinstance(body["followingCount"], int)


@requires_db
@pytest.mark.parametrize(
    "path",
    [
        "/api/py/users/nobody",
        "/api/py/users/nobody/games",
        "/api/py/users/nobody/wishlist",
        "/api/py/users/nobody/followers",
        "/api/py/users/nobody/following",
    ],
)
def test_unknown_username_returns_404(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 404
    # FastAPI's standard error shape, consistent across every public read.
    assert response.json() == {"detail": "User 'nobody' not found"}


# --- Multi-user isolation ------------------------------------------------
#
# Everything above reads the one seeded library. These build a SECOND user and
# assert the two libraries never bleed into each other — the property
# /u/[username] depends on, and the one that silently breaks if a query ever
# loses its user_id filter. Local auth/DB helpers rather than a shared
# conftest, matching how test_me_api.py and test_db_constraints.py each stand
# up their own throwaway users.

_INSERT_AUTH_USER = text(
    """
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, created_at, updated_at
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', :id,
        'authenticated', 'authenticated', :email, now(), now()
    )
    """
)


@pytest.fixture
def other_user():
    """A second onboarded user owning one game and one wishlist item, created
    through the real write path. Deleting the auth user cascades the profile,
    game, and wishlist row away (migration f985740c0df9)."""
    user_id = uuid.uuid4()
    username = f"other{str(user_id)[:8]}"
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(_INSERT_AUTH_USER, {"id": user_id, "email": f"{username}@example.com"})
        session.commit()

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=user_id, email=f"{username}@example.com"
    )
    api = TestClient(app)
    try:
        created = api.post(
            "/api/py/me/profile", json={"username": username, "displayName": "Other Person"}
        )
        assert created.status_code == 201, created.text
        game = api.post("/api/py/me/games", json={"name": "Solo Quest", "system": "Dreamcast"})
        assert game.status_code == 201, game.text
        wish = api.post("/api/py/me/wishlist", json={"name": "Solo Wish"})
        assert wish.status_code == 201, wish.text
        yield username
    finally:
        with sm() as session:
            session.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
            session.commit()


@pytest.fixture
def onboarded_user_with_nothing():
    """A user who has completed onboarding but added nothing at all — the
    brand-new-signup state the library's empty states render for."""
    user_id = uuid.uuid4()
    username = f"empty{str(user_id)[:8]}"
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(_INSERT_AUTH_USER, {"id": user_id, "email": f"{username}@example.com"})
        session.commit()

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=user_id, email=f"{username}@example.com"
    )
    created = TestClient(app).post("/api/py/me/profile", json={"username": username})
    assert created.status_code == 201, created.text
    try:
        yield username
    finally:
        with sm() as session:
            session.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
            session.commit()


@requires_db
def test_empty_library_is_empty_lists_not_404(
    client: TestClient, onboarded_user_with_nothing: str
) -> None:
    # The distinction the UI depends on: an onboarded user with no rows is a
    # real, empty library (render "add your first game"), not a missing one
    # (render a 404 page). Only an unknown username 404s.
    username = onboarded_user_with_nothing
    assert client.get(f"/api/py/users/{username}").status_code == 200
    games = client.get(f"/api/py/users/{username}/games")
    wishlist = client.get(f"/api/py/users/{username}/wishlist")
    assert games.status_code == 200
    assert wishlist.status_code == 200
    assert games.json() == []
    assert wishlist.json() == []


@requires_db
def test_second_users_games_are_their_own(client: TestClient, other_user: str) -> None:
    games = client.get(f"/api/py/users/{other_user}/games").json()
    assert [g["name"] for g in games] == ["Solo Quest"]


@requires_db
def test_second_users_wishlist_is_their_own(client: TestClient, other_user: str) -> None:
    items = client.get(f"/api/py/users/{other_user}/wishlist").json()
    assert [i["name"] for i in items] == ["Solo Wish"]


@requires_db
def test_second_users_profile_is_their_own(client: TestClient, other_user: str) -> None:
    profile = client.get(f"/api/py/users/{other_user}").json()
    assert profile["username"] == other_user
    assert profile["displayName"] == "Other Person"


@requires_db
def test_one_users_rows_never_appear_in_anothers_library(
    client: TestClient, other_user: str
) -> None:
    # The failure this guards against is a dropped user_id filter, which would
    # show up as each library containing the other's rows.
    robert_games = client.get("/api/py/users/rgrassian/games").json()
    robert_wishlist = client.get("/api/py/users/rgrassian/wishlist").json()
    assert "Solo Quest" not in {g["name"] for g in robert_games}
    assert "Solo Wish" not in {i["name"] for i in robert_wishlist}
    # And Robert's library is entirely absent from theirs.
    other_games = client.get(f"/api/py/users/{other_user}/games").json()
    assert len(other_games) == 1
    assert len(robert_games) == len(expected_games())


@requires_db
def test_second_users_username_lookup_is_case_insensitive(
    client: TestClient, other_user: str
) -> None:
    # citext applies to every user, not just the seeded one — /u/Other… and
    # /u/other… must resolve to the same library.
    response = client.get(f"/api/py/users/{other_user.upper()}/games")
    assert response.status_code == 200
    assert [g["name"] for g in response.json()] == ["Solo Quest"]


@requires_db
def test_health_includes_db_ok(client: TestClient) -> None:
    response = client.get("/api/py/health")
    assert response.status_code == 200
    assert response.json()["db"] == "ok"
