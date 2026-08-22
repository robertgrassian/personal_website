"""Integration tests for the public user read endpoints against the seeded
local database (same skip pattern as test_db_constraints.py: they run only
when DATABASE_URL is set).

Expectations are DERIVED from the database at test time, never pinned as
literals, so they survive a reseed. Play-state *semantics* are owned by
test_play_state.py with hand-built cases; these tests assert liveness and
wiring against whatever the library currently holds.

They used to derive from scripts/fixtures/*.csv instead. That premise died
when the API became the sole data source: writes land in the DB and never go
back to the CSVs, so the fixtures are a frozen snapshot the library drifts
away from with every add, rename or session. Any assertion comparing the two
fails on a developer's machine for no reason a code change caused.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

# The fixtures below build their users through the real write path, so adding
# their games reaches the genre lookup the same way /me/games does. See conftest.
pytestmark = pytest.mark.usefixtures("stub_genre_lookup", "stub_platform_lookup")

# The exact wire keys of the TS types being mirrored (src/lib/games.ts,
# src/lib/wishlist.ts) — camelCase, via the schema alias generator.
GAME_KEYS = {
    "id",
    "name",
    "system",
    "genres",
    "platforms",
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
SESSION_KEYS = {"id", "gameId", "startDate", "endDate"}
WISHLIST_KEYS = {
    "id",
    "name",
    "system",
    "genres",
    "platforms",
    "releaseDate",
    "imageUrl",
    "igdbId",
    "starred",
    "dateAdded",
    "notes",
}


def _rows(sql: str, **params) -> list[tuple]:
    with get_sessionmaker()() as session:
        return session.execute(text(sql), params).all()


def library_names(username: str) -> list[str]:
    """Game names in the order the read endpoint returns them (played_games.id)."""
    return [
        r[0]
        for r in _rows(
            """SELECT m.name FROM played_games p
                 JOIN game_metadata m ON m.id = p.metadata_id
                 JOIN profiles pr ON pr.id = p.user_id
                WHERE pr.username = :username ORDER BY p.id""",
            username=username,
        )
    ]


def wishlist_names(username: str) -> list[str]:
    return [
        r[0]
        for r in _rows(
            """SELECT m.name FROM wishlist_games w
                 JOIN game_metadata m ON m.id = w.metadata_id
                 JOIN profiles pr ON pr.id = w.user_id
                WHERE pr.username = :username ORDER BY w.id""",
            username=username,
        )
    ]


def session_rows(username: str) -> list[tuple]:
    """(id, start_date, end_date) for every session in the user's library, in
    the order the endpoint promises: newest first, id breaking a same-day tie."""
    return _rows(
        """SELECT s.id, s.start_date, s.end_date FROM play_sessions s
             JOIN played_games p ON p.id = s.game_id
             JOIN profiles pr ON pr.id = p.user_id
            WHERE pr.username = :username
            ORDER BY s.start_date DESC, s.id DESC""",
        username=username,
    )


def session_names(username: str, *, open_only: bool) -> set[str]:
    """Game names with at least one open (or closed) play session."""
    end_date = "IS NULL" if open_only else "IS NOT NULL"
    return {
        r[0]
        for r in _rows(
            f"""SELECT m.name FROM play_sessions s
                  JOIN played_games p ON p.id = s.game_id
                  JOIN game_metadata m ON m.id = p.metadata_id
                  JOIN profiles pr ON pr.id = p.user_id
                 WHERE pr.username = :username AND s.end_date {end_date}""",
            username=username,
        )
    }


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


@requires_db
def test_games_returns_full_library_with_camel_case_keys(client: TestClient) -> None:
    response = client.get("/api/library/users/rgrassian/games")
    assert response.status_code == 200
    games = response.json()
    assert games, "seeded library is empty; the assertions below would be vacuous"
    for game in games:
        assert set(game) == GAME_KEYS
    # Whole library, in played_games.id order — count and ordering in one.
    assert [g["name"] for g in games] == library_names("rgrassian")


@requires_db
def test_open_session_games_are_currently_playing(client: TestClient) -> None:
    open_names = session_names("rgrassian", open_only=True)
    if not open_names:
        pytest.skip("no open session in the library")
    games = client.get("/api/library/users/rgrassian/games").json()
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
    closed_names = session_names("rgrassian", open_only=False)
    if not closed_names:
        pytest.skip("no closed session in the library")
    games = client.get("/api/library/users/rgrassian/games").json()
    by_name = {g["name"]: g for g in games}
    for name in closed_names:
        assert by_name[name]["lastPlayed"] != "", name


@requires_db
def test_game_without_sessions_has_empty_play_state(client: TestClient) -> None:
    row = _rows(
        """SELECT m.name, p.rating, m.genres, m.release_date
             FROM played_games p
             JOIN game_metadata m ON m.id = p.metadata_id
             JOIN profiles pr ON pr.id = p.user_id
            WHERE pr.username = 'rgrassian'
              AND NOT EXISTS (SELECT 1 FROM play_sessions s WHERE s.game_id = p.id)
            ORDER BY p.id LIMIT 1"""
    )
    if not row:
        pytest.skip("every game in the library has a session")
    name, rating, genres, release_date = row[0]

    games = client.get("/api/library/users/rgrassian/games").json()
    game = next(g for g in games if g["name"] == name)
    assert game["currentlyPlaying"] is False
    assert game["lastPlayed"] == ""
    assert game["playingSince"] == ""
    # Scalars reach the wire unchanged ("" for NULL).
    assert game["rating"] == (rating or "")
    assert game["genres"] == (genres or [])
    assert game["releaseDate"] == (release_date.isoformat() if release_date else "")


@requires_db
def test_sessions_returns_whole_history_newest_first(client: TestClient) -> None:
    response = client.get("/api/library/users/rgrassian/sessions")
    assert response.status_code == 200
    sessions = response.json()
    assert sessions, "seeded library has no sessions; the assertions below would be vacuous"
    for session in sessions:
        assert set(session) == SESSION_KEYS
    # Count and ordering in one, derived rather than pinned.
    expected = session_rows("rgrassian")
    assert [s["id"] for s in sessions] == [row[0] for row in expected]
    assert [s["startDate"] for s in sessions] == [row[1].isoformat() for row in expected]


@requires_db
def test_open_sessions_have_a_null_end_date(client: TestClient) -> None:
    # The one place this payload breaks the module's ""-for-absent convention,
    # and the distinction the UI branches on: null end date == still playing.
    sessions = client.get("/api/library/users/rgrassian/sessions").json()
    games = client.get("/api/library/users/rgrassian/games").json()
    open_game_ids = {g["id"] for g in games if g["currentlyPlaying"]}
    assert {s["gameId"] for s in sessions if s["endDate"] is None} == open_game_ids
    for session in sessions:
        assert session["endDate"] is None or session["endDate"] >= session["startDate"]


@requires_db
def test_session_game_ids_all_belong_to_the_library(client: TestClient) -> None:
    # A dropped user_id filter would show up here as a session pointing at a
    # game the library read never returned.
    sessions = client.get("/api/library/users/rgrassian/sessions").json()
    library_ids = {g["id"] for g in client.get("/api/library/users/rgrassian/games").json()}
    assert {s["gameId"] for s in sessions} <= library_ids


@requires_db
def test_username_lookup_is_case_insensitive(client: TestClient) -> None:
    # citext username: /users/Rgrassian resolves to the same profile, so it
    # must return the same library the lowercase spelling does.
    response = client.get("/api/library/users/Rgrassian/games")
    assert response.status_code == 200
    # Pinned to the library itself, not just to the lowercase response, so this
    # still bites if both spellings resolve to the same WRONG profile.
    assert [g["name"] for g in response.json()] == library_names("rgrassian")
    assert response.json() == client.get("/api/library/users/rgrassian/games").json()


@requires_db
def test_wishlist_returns_all_items_with_camel_case_keys(client: TestClient) -> None:
    response = client.get("/api/library/users/rgrassian/wishlist")
    assert response.status_code == 200
    items = response.json()
    assert items, "seeded wishlist is empty; the assertions below would be vacuous"
    for item in items:
        assert set(item) == WISHLIST_KEYS
    assert [i["name"] for i in items] == wishlist_names("rgrassian")

    first = items[0]
    stored = _rows(
        """SELECT w.starred, w.date_added, w.notes
             FROM wishlist_games w
             JOIN profiles pr ON pr.id = w.user_id
            WHERE pr.username = 'rgrassian' ORDER BY w.id LIMIT 1"""
    )[0]
    starred, date_added, notes = stored
    assert first["starred"] is starred
    assert first["dateAdded"] == date_added.isoformat()
    assert first["notes"] == notes


@requires_db
def test_profile_returns_public_fields_and_counts(client: TestClient) -> None:
    response = client.get("/api/library/users/rgrassian")
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
        "/api/library/users/nobody",
        "/api/library/users/nobody/games",
        "/api/library/users/nobody/wishlist",
        "/api/library/users/nobody/sessions",
        "/api/library/users/nobody/followers",
        "/api/library/users/nobody/following",
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
            "/api/library/me/profile", json={"username": username, "displayName": "Other Person"}
        )
        assert created.status_code == 201, created.text
        game = api.post("/api/library/me/games", json={"name": "Solo Quest", "system": "Dreamcast"})
        assert game.status_code == 201, game.text
        wish = api.post("/api/library/me/wishlist", json={"name": "Solo Wish"})
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
    created = TestClient(app).post("/api/library/me/profile", json={"username": username})
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
    assert client.get(f"/api/library/users/{username}").status_code == 200
    games = client.get(f"/api/library/users/{username}/games")
    wishlist = client.get(f"/api/library/users/{username}/wishlist")
    sessions = client.get(f"/api/library/users/{username}/sessions")
    assert games.status_code == 200
    assert wishlist.status_code == 200
    assert sessions.status_code == 200
    assert games.json() == []
    assert wishlist.json() == []
    assert sessions.json() == []


@requires_db
def test_second_users_games_are_their_own(client: TestClient, other_user: str) -> None:
    games = client.get(f"/api/library/users/{other_user}/games").json()
    assert [g["name"] for g in games] == ["Solo Quest"]


@requires_db
def test_second_users_wishlist_is_their_own(client: TestClient, other_user: str) -> None:
    items = client.get(f"/api/library/users/{other_user}/wishlist").json()
    assert [i["name"] for i in items] == ["Solo Wish"]


@requires_db
def test_second_users_sessions_are_their_own(client: TestClient, other_user: str) -> None:
    # other_user's game is created without a session, so their history must be
    # empty even though the seeded library next door is full of them.
    assert client.get(f"/api/library/users/{other_user}/sessions").json() == []


@requires_db
def test_second_users_profile_is_their_own(client: TestClient, other_user: str) -> None:
    profile = client.get(f"/api/library/users/{other_user}").json()
    assert profile["username"] == other_user
    assert profile["displayName"] == "Other Person"


@requires_db
def test_one_users_rows_never_appear_in_anothers_library(
    client: TestClient, other_user: str
) -> None:
    # The failure this guards against is a dropped user_id filter, which would
    # show up as each library containing the other's rows.
    robert_games = client.get("/api/library/users/rgrassian/games").json()
    robert_wishlist = client.get("/api/library/users/rgrassian/wishlist").json()
    assert "Solo Quest" not in {g["name"] for g in robert_games}
    assert "Solo Wish" not in {i["name"] for i in robert_wishlist}
    # And Robert's library is entirely absent from theirs.
    other_games = client.get(f"/api/library/users/{other_user}/games").json()
    assert len(other_games) == 1
    assert len(robert_games) == len(library_names("rgrassian"))


@requires_db
def test_second_users_username_lookup_is_case_insensitive(
    client: TestClient, other_user: str
) -> None:
    # citext applies to every user, not just the seeded one — /u/Other… and
    # /u/other… must resolve to the same library.
    response = client.get(f"/api/library/users/{other_user.upper()}/games")
    assert response.status_code == 200
    assert [g["name"] for g in response.json()] == ["Solo Quest"]


@requires_db
def test_health_includes_db_ok(client: TestClient) -> None:
    response = client.get("/api/library/health")
    assert response.status_code == 200
    assert response.json()["db"] == "ok"


@requires_db
def test_platforms_ride_on_the_read_from_the_catalog_row(client: TestClient) -> None:
    """platforms is what the owner forms suggest systems from, so it has to
    survive the trip rather than merely appear in the key set. Compared against
    the catalog rows themselves: the seed populates the column, so pinning
    literals here would break on the next backfill."""
    stored = dict(
        _rows(
            """SELECT m.name, m.platforms FROM played_games p
                 JOIN game_metadata m ON m.id = p.metadata_id
                 JOIN profiles pr ON pr.id = p.user_id
                WHERE pr.username = 'rgrassian'"""
        )
    )
    populated = [n for n, p in stored.items() if p]
    assert populated, "seed has no platforms; this test would prove nothing"

    for game in client.get("/api/library/users/rgrassian/games").json():
        assert game["platforms"] == stored[game["name"]], game["name"]
