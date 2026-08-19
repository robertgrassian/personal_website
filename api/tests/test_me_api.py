"""Integration tests for the authenticated /me endpoints against the seeded
local database (same requires_db skip as the other integration tests).

Auth is stubbed via FastAPI's dependency_overrides: get_current_user is
replaced with a fixed AuthenticatedUser, so these tests exercise
router→service→repository→DB without minting JWTs (token mechanics are covered
exhaustively by test_auth.py). Creating a profile needs a matching auth.users
row (the FK from migration f985740c0df9); the fresh_auth_user fixture inserts
one and cascades it away on teardown.
"""

import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core import guards
from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
from app.models import GameMetadata, PlayedGame, PlaySession
from app.services import genres as genre_service
from scripts.seed import ROBERT_PROFILE_ID

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

# Adding a game or a wishlist entry calls Wikipedia for any catalog row that
# does not exist yet, which is most rows these tests create. See conftest.
pytestmark = pytest.mark.usefixtures("stub_genre_lookup")

# Test igdb ids start well above anything IGDB actually issues (their ids are
# six digits at most). Since igdb_id became the catalog's identity key, a test
# id that collided with a seeded one would silently resolve to the seeded game
# instead of creating a row -- a failure that looks like a bug in the code.
#
# The same applies BETWEEN tests, and catalog rows outlive the per-test user:
# reusing an offset means the second test adopts the first's row, genres and
# all. Two branches picked +8 at once and that is exactly what happened, so
# take the next free offset rather than the next number after the test above.
TEST_IGDB_BASE = 90_000_000


def client_as(user_id: uuid.UUID, email: str = "test@example.com") -> TestClient:
    """A TestClient whose requests authenticate as the given user id."""
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(id=user_id, email=email)
    return TestClient(app)


_INSERT_AUTH_USER = text(
    """
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token,
        email_change_token_new, email_change
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', :id,
        'authenticated', 'authenticated', :email, '',
        now(), now(), now(), '{}', '{}', '', '', '', ''
    )
    """
)


def _make_auth_user() -> uuid.UUID:
    """Insert a throwaway auth.users row (no profile) and return its id."""
    user_id = uuid.uuid4()
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(_INSERT_AUTH_USER, {"id": user_id, "email": f"test-{user_id}@example.com"})
        session.commit()
    return user_id


def _delete_auth_user(user_id: uuid.UUID) -> None:
    # Cascade removes the profile if one was created.
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
        session.commit()


def add_game_directly(
    session,
    user_id,
    *,
    name,
    system,
    rating=None,
    genres=None,
    release_date=None,
    igdb_id=None,
) -> PlayedGame:
    """Insert a library entry straight into the DB, bypassing the API.

    Two rows now rather than one -- the catalog row for the game, the link row
    for this user's copy of it -- so the tests that set up state without going
    through POST /me/games say so in one place. Defaults to a PRIVATE catalog
    row, which is what a hand-entered game is; pass igdb_id for a shared one.
    """
    meta = GameMetadata(
        name=name,
        igdb_id=igdb_id,
        genres=genres or [],
        release_date=release_date,
        created_by_user_id=None if igdb_id is not None else user_id,
    )
    session.add(meta)
    session.flush()
    game = PlayedGame(user_id=user_id, metadata_id=meta.id, system=system, rating=rating)
    session.add(game)
    session.flush()
    return game


@pytest.fixture
def fresh_auth_user():
    """A throwaway auth user with no profile; cascades away on teardown."""
    user_id = _make_auth_user()
    try:
        yield user_id, f"test-{user_id}@example.com"
    finally:
        _delete_auth_user(user_id)


@pytest.fixture
def fresh_user_with_game(fresh_auth_user):
    """An onboarded throwaway user owning one game with one closed session.

    Everything the USER owns hangs off the auth user, so fresh_auth_user's
    teardown cascades it away (auth.users → profiles → played_games →
    play_sessions). The catalog row this game points at does not: game_metadata
    is the parent of that FK, not a child of the user. The session-scoped
    purge_suite_catalog_rows fixture in conftest collects it."""
    user_id, _ = fresh_auth_user
    username = f"gamer-{str(user_id)[:8]}"
    created = client_as(user_id).post("/api/library/me/profile", json={"username": username})
    assert created.status_code == 201

    sm = get_sessionmaker()
    with sm() as session:
        game = add_game_directly(
            session,
            user_id,
            name="Test Quest",
            system="SNES",
            rating="Good",
            genres=["RPG"],
            release_date=date(1995, 3, 9),
        )
        session.add(
            PlaySession(game_id=game.id, start_date=date(2026, 1, 1), end_date=date(2026, 1, 15))
        )
        session.commit()
        game_id = game.id
    yield user_id, game_id


@requires_db
def test_get_my_profile_returns_seeded_owner() -> None:
    response = client_as(ROBERT_PROFILE_ID).get("/api/library/me/profile")
    assert response.status_code == 200
    assert response.json() == {"username": "rgrassian", "displayName": "Robert"}


@requires_db
def test_get_my_profile_404_when_not_onboarded() -> None:
    # A valid auth user with no profile row → the "complete onboarding" state.
    response = client_as(uuid.uuid4()).get("/api/library/me/profile")
    assert response.status_code == 404


@requires_db
def test_missing_token_is_401() -> None:
    # No dependency override here — the real auth dependency runs and rejects.
    response = TestClient(create_app()).get("/api/library/me/profile")
    assert response.status_code == 401


@requires_db
def test_create_profile_completes_onboarding(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    client = client_as(user_id)
    response = client.post(
        "/api/library/me/profile",
        json={"username": "NewPlayer", "displayName": "New Player"},
    )
    assert response.status_code == 201
    # Username is normalized to lowercase on the way in.
    assert response.json() == {"username": "newplayer", "displayName": "New Player"}
    # And now GET finds it.
    assert client.get("/api/library/me/profile").status_code == 200


@requires_db
def test_create_profile_defaults_display_name_to_username(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post("/api/library/me/profile", json={"username": "solohandle"})
    assert response.status_code == 201
    assert response.json() == {"username": "solohandle", "displayName": "solohandle"}


@requires_db
def test_create_profile_second_time_is_409(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    client = client_as(user_id)
    assert client.post("/api/library/me/profile", json={"username": "onceonly"}).status_code == 201
    again = client.post("/api/library/me/profile", json={"username": "oncemore"})
    assert again.status_code == 409


@requires_db
def test_create_profile_taken_username_is_409(fresh_auth_user) -> None:
    # First user claims a (non-reserved) handle; a second user can't reuse it.
    first_id, _ = fresh_auth_user
    created = client_as(first_id).post("/api/library/me/profile", json={"username": "sharedname"})
    assert created.status_code == 201
    second_id = _make_auth_user()
    try:
        response = client_as(second_id).post(
            "/api/library/me/profile", json={"username": "SharedName"}
        )
        # citext: case-insensitive collision is still a conflict.
        assert response.status_code == 409
    finally:
        _delete_auth_user(second_id)


@requires_db
def test_create_profile_reserved_username_is_422(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post("/api/library/me/profile", json={"username": "search"})
    assert response.status_code == 422


@requires_db
def test_create_profile_bad_format_is_422(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post("/api/library/me/profile", json={"username": "no"})
    assert response.status_code == 422


@requires_db
def test_create_profile_over_cap_is_403(fresh_auth_user, monkeypatch: pytest.MonkeyPatch) -> None:
    # MAX_USERS=1 with the founder already seeded → cap reached.
    monkeypatch.setenv("MAX_USERS", "1")
    get_settings.cache_clear()
    try:
        user_id, _ = fresh_auth_user
        response = client_as(user_id).post("/api/library/me/profile", json={"username": "toolate"})
        assert response.status_code == 403
        assert "capacity" in response.json()["detail"].lower()
    finally:
        get_settings.cache_clear()


@requires_db
def test_create_profile_forbidden_in_preview(
    fresh_auth_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Mutations are refused on preview deploys (cleanly, as 503 — not an ugly
    # read-only-role 500).
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        user_id, _ = fresh_auth_user
        response = client_as(user_id).post(
            "/api/library/me/profile", json={"username": "previewuser"}
        )
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


@requires_db
def test_username_race_returns_409_not_500(
    fresh_auth_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A handle claimed between the service's username_exists() check and its
    # commit must surface as a clean 409, not a 500 from the unhandled
    # IntegrityError. Simulate the race by forcing the pre-check to miss, so
    # the DB unique index is what rejects the insert.
    first_id, _ = fresh_auth_user
    created = client_as(first_id).post("/api/library/me/profile", json={"username": "raced"})
    assert created.status_code == 201

    second_id = _make_auth_user()
    monkeypatch.setattr("app.repositories.me.username_exists", lambda *a, **k: False)
    try:
        response = client_as(second_id).post("/api/library/me/profile", json={"username": "raced"})
        assert response.status_code == 409
    finally:
        _delete_auth_user(second_id)


# ── PATCH /me/games/{id} ──────────────────────────────────────────────────


@requires_db
def test_patch_game_requires_token() -> None:
    response = TestClient(create_app()).patch("/api/library/me/games/1", json={"rating": "Good"})
    assert response.status_code == 401


@requires_db
def test_patch_game_updates_rating(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(
        f"/api/library/me/games/{game_id}", json={"rating": "Perfect"}
    )
    assert response.status_code == 200
    body = response.json()
    # Full game payload back, same wire shape as the public reads — including
    # play state derived from the fixture's closed session.
    assert body["id"] == game_id
    assert body["rating"] == "Perfect"
    assert body["name"] == "Test Quest"
    assert body["currentlyPlaying"] is False
    assert body["lastPlayed"] == "2026-01-15"


@requires_db
def test_patch_game_persists_to_public_read(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    client = client_as(user_id)
    assert (
        client.patch(f"/api/library/me/games/{game_id}", json={"rating": "Bad"}).status_code == 200
    )
    username = client.get("/api/library/me/profile").json()["username"]
    [game] = TestClient(create_app()).get(f"/api/library/users/{username}/games").json()
    assert game["rating"] == "Bad"


@requires_db
def test_patch_game_empty_string_clears_rating(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={"rating": ""})
    assert response.status_code == 200
    assert response.json()["rating"] == ""  # NULL in the DB, "" on the wire


@requires_db
def test_patch_game_null_clears_rating(fresh_user_with_game) -> None:
    # JSON null is the other documented clear spelling (the FE sends "").
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={"rating": None})
    assert response.status_code == 200
    assert response.json()["rating"] == ""


@requires_db
def test_patch_game_unknown_field_is_422(fresh_user_with_game) -> None:
    # extra="forbid": a typo'd key must fail loudly, not read as a no-op —
    # under PATCH semantics a silently-dropped field is indistinguishable
    # from a deliberate "leave unchanged".
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(
        f"/api/library/me/games/{game_id}", json={"ratings": "Perfect"}
    )
    assert response.status_code == 422


@requires_db
def test_patch_game_omitted_rating_changes_nothing(fresh_user_with_game) -> None:
    # PATCH semantics: {} is a valid no-op — absent fields are left untouched,
    # not reset. The fixture's rating survives.
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={})
    assert response.status_code == 200
    assert response.json()["rating"] == "Good"


@requires_db
def test_patch_game_unknown_rating_is_422(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(
        f"/api/library/me/games/{game_id}", json={"rating": "Legendary"}
    )
    assert response.status_code == 422


@requires_db
def test_patch_game_updates_system(fresh_user_with_game) -> None:
    # The escape hatch for the duplicate-add 409: one entry per game per user
    # means a second console has to be an edit, not a second add.
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(
        f"/api/library/me/games/{game_id}", json={"system": "Switch"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["system"] == "Switch"
    # The rating and the fixture's session survive the move: system lives on
    # the user's own row, so nothing else is touched.
    assert body["rating"] == "Good"
    assert body["lastPlayed"] == "2026-01-15"


@requires_db
def test_patch_game_system_persists_to_public_read(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    client = client_as(user_id)
    assert (
        client.patch(f"/api/library/me/games/{game_id}", json={"system": "PS5"}).status_code == 200
    )
    username = client.get("/api/library/me/profile").json()["username"]
    [game] = TestClient(create_app()).get(f"/api/library/users/{username}/games").json()
    assert game["system"] == "PS5"


@requires_db
def test_patch_game_system_is_trimmed(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(
        f"/api/library/me/games/{game_id}", json={"system": "  PS5  "}
    )
    assert response.status_code == 200
    assert response.json()["system"] == "PS5"


@requires_db
@pytest.mark.parametrize("system", ["", "   ", None])
def test_patch_game_blank_system_is_422(fresh_user_with_game, system) -> None:
    # Unlike rating there is no cleared state: played_games.system is NOT NULL,
    # so neither a blank string nor null may be read as "unset it". Omitting
    # the key is the only way to leave it alone.
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={"system": system})
    assert response.status_code == 422
    assert client_as(user_id).get("/api/library/me/profile").status_code == 200


@requires_db
def test_patch_game_over_long_system_is_422(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(
        f"/api/library/me/games/{game_id}", json={"system": "x" * 101}
    )
    assert response.status_code == 422


@requires_db
def test_patch_game_rating_and_system_together(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(
        f"/api/library/me/games/{game_id}", json={"rating": "Perfect", "system": "PC"}
    )
    assert response.status_code == 200
    body = response.json()
    assert (body["rating"], body["system"]) == ("Perfect", "PC")


@requires_db
def test_patch_someone_elses_game_is_404(fresh_user_with_game) -> None:
    # The fixture user's game PATCHed by a different (seeded) account: the
    # ownership check must make it look nonexistent, and the row must be
    # untouched afterward.
    user_id, game_id = fresh_user_with_game
    response = client_as(ROBERT_PROFILE_ID).patch(
        f"/api/library/me/games/{game_id}", json={"rating": "Perfect"}
    )
    assert response.status_code == 404
    check = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={})
    assert check.json()["rating"] == "Good"


@requires_db
def test_patch_nonexistent_game_is_404(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).patch("/api/library/me/games/999999999", json={"rating": "Good"})
    assert response.status_code == 404


def test_create_session_requires_token() -> None:
    response = TestClient(create_app()).post("/api/library/me/games/1/sessions", json={})
    assert response.status_code == 401


def test_close_session_requires_token() -> None:
    response = TestClient(create_app()).patch("/api/library/me/sessions/1", json={})
    assert response.status_code == 401


@requires_db
def test_start_playing_opens_session(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).post(
        f"/api/library/me/games/{game_id}/sessions", json={"startDate": "2026-07-20"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["currentlyPlaying"] is True
    assert body["playingSince"] == "2026-07-20"
    assert isinstance(body["openSessionId"], int)
    # The fixture's closed session is untouched by starting a new one.
    assert body["lastPlayed"] == "2026-01-15"


@requires_db
def test_start_playing_defaults_to_today(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).post(f"/api/library/me/games/{game_id}/sessions", json={})
    assert response.status_code == 201
    assert response.json()["playingSince"] == date.today().isoformat()


@requires_db
def test_start_playing_shows_on_public_read(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    client = client_as(user_id)
    assert client.post(f"/api/library/me/games/{game_id}/sessions", json={}).status_code == 201
    username = client.get("/api/library/me/profile").json()["username"]
    [game] = TestClient(create_app()).get(f"/api/library/users/{username}/games").json()
    assert game["currentlyPlaying"] is True
    assert isinstance(game["openSessionId"], int)


@requires_db
def test_second_open_session_is_409(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    client = client_as(user_id)
    assert client.post(f"/api/library/me/games/{game_id}/sessions", json={}).status_code == 201
    response = client.post(f"/api/library/me/games/{game_id}/sessions", json={})
    assert response.status_code == 409
    assert "already being played" in response.json()["detail"]


@requires_db
def test_log_past_session_updates_last_played(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).post(
        f"/api/library/me/games/{game_id}/sessions",
        json={"startDate": "2026-06-01", "endDate": "2026-06-10"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["currentlyPlaying"] is False
    assert body["openSessionId"] is None
    assert body["lastPlayed"] == "2026-06-10"


@requires_db
def test_log_past_session_allowed_while_playing(fresh_user_with_game) -> None:
    # A finished past playthrough never conflicts with the open session —
    # only opening a second one does.
    user_id, game_id = fresh_user_with_game
    client = client_as(user_id)
    assert client.post(f"/api/library/me/games/{game_id}/sessions", json={}).status_code == 201
    response = client.post(
        f"/api/library/me/games/{game_id}/sessions",
        json={"startDate": "2026-02-01", "endDate": "2026-02-10"},
    )
    assert response.status_code == 201
    assert response.json()["currentlyPlaying"] is True


@requires_db
def test_create_session_end_before_start_is_422(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).post(
        f"/api/library/me/games/{game_id}/sessions",
        json={"startDate": "2026-06-10", "endDate": "2026-06-01"},
    )
    assert response.status_code == 422


@requires_db
def test_create_session_unknown_field_is_422(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).post(
        f"/api/library/me/games/{game_id}/sessions", json={"start": "2026-06-01"}
    )
    assert response.status_code == 422


@requires_db
def test_create_session_foreign_game_is_404(fresh_user_with_game) -> None:
    _, game_id = fresh_user_with_game
    response = client_as(ROBERT_PROFILE_ID).post(
        f"/api/library/me/games/{game_id}/sessions", json={}
    )
    assert response.status_code == 404


@requires_db
def test_create_session_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        user_id, game_id = fresh_user_with_game
        response = client_as(user_id).post(f"/api/library/me/games/{game_id}/sessions", json={})
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


def _start_playing(user_id: uuid.UUID, game_id: int, start: str = "2026-07-01") -> int:
    """Open a session via the API and return its id."""
    response = client_as(user_id).post(
        f"/api/library/me/games/{game_id}/sessions", json={"startDate": start}
    )
    assert response.status_code == 201
    return response.json()["openSessionId"]


@requires_db
def test_stop_playing_closes_session(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    response = client_as(user_id).patch(
        f"/api/library/me/sessions/{session_id}", json={"endDate": "2026-07-15"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["currentlyPlaying"] is False
    assert body["openSessionId"] is None
    assert body["lastPlayed"] == "2026-07-15"
    assert body["rating"] == "Good"  # no rating in the payload → untouched


@requires_db
def test_stop_playing_defaults_to_today(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    response = client_as(user_id).patch(f"/api/library/me/sessions/{session_id}", json={})
    assert response.status_code == 200
    assert response.json()["lastPlayed"] == date.today().isoformat()


@requires_db
def test_rate_on_stop_applies_both(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    response = client_as(user_id).patch(
        f"/api/library/me/sessions/{session_id}",
        json={"endDate": "2026-07-15", "rating": "Perfect"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["currentlyPlaying"] is False
    assert body["lastPlayed"] == "2026-07-15"
    assert body["rating"] == "Perfect"


@requires_db
def test_rate_on_stop_can_clear_rating(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    response = client_as(user_id).patch(
        f"/api/library/me/sessions/{session_id}", json={"rating": ""}
    )
    assert response.status_code == 200
    assert response.json()["rating"] == ""  # fixture's "Good" cleared


@requires_db
def test_rate_on_stop_null_clears_rating(fresh_user_with_game) -> None:
    # null is the other documented clear spelling, same as PATCH /me/games.
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    response = client_as(user_id).patch(
        f"/api/library/me/sessions/{session_id}", json={"rating": None}
    )
    assert response.status_code == 200
    assert response.json()["rating"] == ""


@requires_db
def test_open_sessions_on_different_games_coexist(fresh_user_with_game) -> None:
    # "One open session per game" is per game — playing several different
    # games at once is a supported state (the CRT shows the first one).
    user_id, game_id = fresh_user_with_game
    sm = get_sessionmaker()
    with sm() as session:
        other = add_game_directly(session, user_id, name="Second Quest", system="NES")
        session.commit()
        other_id = other.id
    client = client_as(user_id)
    assert client.post(f"/api/library/me/games/{game_id}/sessions", json={}).status_code == 201
    response = client.post(f"/api/library/me/games/{other_id}/sessions", json={})
    assert response.status_code == 201
    assert response.json()["currentlyPlaying"] is True


@requires_db
def test_db_enforces_single_open_session(fresh_user_with_game) -> None:
    # The service's 409 is a check-then-insert that can race; the partial
    # unique index is the real referee. Bypass the service and verify the DB
    # itself rejects a second open session.
    _, game_id = fresh_user_with_game
    sm = get_sessionmaker()
    with sm() as session:
        session.add(PlaySession(game_id=game_id, start_date=date(2026, 7, 1)))
        session.commit()
        session.add(PlaySession(game_id=game_id, start_date=date(2026, 7, 2)))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


@requires_db
def test_same_day_session_boundaries_are_valid(fresh_user_with_game) -> None:
    # endDate == startDate is a legitimate same-day playthrough; only an
    # earlier end date is rejected — on create and on close alike.
    user_id, game_id = fresh_user_with_game
    client = client_as(user_id)
    logged = client.post(
        f"/api/library/me/games/{game_id}/sessions",
        json={"startDate": "2026-05-05", "endDate": "2026-05-05"},
    )
    assert logged.status_code == 201
    session_id = _start_playing(user_id, game_id, start="2026-07-10")
    closed = client.patch(f"/api/library/me/sessions/{session_id}", json={"endDate": "2026-07-10"})
    assert closed.status_code == 200
    assert closed.json()["lastPlayed"] == "2026-07-10"


@requires_db
def test_stop_with_unknown_rating_is_422_and_stays_open(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    response = client_as(user_id).patch(
        f"/api/library/me/sessions/{session_id}", json={"rating": "Legendary"}
    )
    assert response.status_code == 422
    check = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={})
    assert check.json()["currentlyPlaying"] is True


@requires_db
def test_close_already_closed_session_is_409(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    client = client_as(user_id)
    assert client.patch(f"/api/library/me/sessions/{session_id}", json={}).status_code == 200
    response = client.patch(f"/api/library/me/sessions/{session_id}", json={})
    assert response.status_code == 409


@requires_db
def test_close_end_before_session_start_is_422(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id, start="2026-07-10")
    response = client_as(user_id).patch(
        f"/api/library/me/sessions/{session_id}", json={"endDate": "2026-07-01"}
    )
    assert response.status_code == 422
    check = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={})
    assert check.json()["currentlyPlaying"] is True


@requires_db
def test_close_foreign_session_is_404(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    response = client_as(ROBERT_PROFILE_ID).patch(f"/api/library/me/sessions/{session_id}", json={})
    assert response.status_code == 404
    check = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={})
    assert check.json()["currentlyPlaying"] is True


@requires_db
def test_close_nonexistent_session_is_404(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).patch("/api/library/me/sessions/999999999", json={})
    assert response.status_code == 404


@requires_db
def test_close_session_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, game_id = fresh_user_with_game
    session_id = _start_playing(user_id, game_id)
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        response = client_as(user_id).patch(f"/api/library/me/sessions/{session_id}", json={})
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


@requires_db
def test_patch_game_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        user_id, game_id = fresh_user_with_game
        response = client_as(user_id).patch(
            f"/api/library/me/games/{game_id}", json={"rating": "Perfect"}
        )
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# DELETE /me/account
# ---------------------------------------------------------------------------
#
# The endpoint's real cascade root is the GoTrue Admin API call, which CI has no
# credentials for. These tests stub app.services.me.delete_auth_user_or_raise
# with the equivalent raw SQL so the DB half (what actually cascades, and the
# rate_limits rows that do not) is exercised for real. The HTTP half is covered
# by test_delete_account_unconfigured_admin_is_503, which asserts the endpoint
# refuses rather than lying when the credentials are absent.


def _stub_admin_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stand in for the Admin API with the equivalent raw SQL, reporting the
    deletion as real (True) the way a 2xx from GoTrue would."""

    def fake(user_id: uuid.UUID) -> bool:
        _delete_auth_user(user_id)
        return True

    monkeypatch.setattr("app.services.me.delete_auth_user_or_raise", fake)


def _stub_admin_404(monkeypatch: pytest.MonkeyPatch) -> None:
    """A 404 from the Admin API with nothing actually deleted, which is what a
    misconfigured SUPABASE_URL produces."""
    monkeypatch.setattr("app.services.me.delete_auth_user_or_raise", lambda _user_id: False)


def _count(sql: str, user_id: uuid.UUID) -> int:
    sm = get_sessionmaker()
    with sm() as session:
        return session.execute(text(sql), {"id": user_id}).scalar_one()


@requires_db
def test_delete_account_removes_everything_owned(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, game_id = fresh_user_with_game
    _stub_admin_delete(monkeypatch)
    client = client_as(user_id)
    _add_wishlist(user_id, {"name": "Someday Quest"})
    # Onboarding auto-follows the founder both ways, so follow edges already
    # exist without creating any here.
    assert _count("SELECT count(*) FROM follows WHERE follower_id = :id", user_id) > 0
    # The write guard has charged this user's "writes" bucket by now, which is
    # the row that has no FK and would survive the cascade.
    assert _count("SELECT count(*) FROM rate_limits WHERE user_id = :id", user_id) > 0

    assert client.delete("/api/library/me/account").status_code == 204

    assert _count("SELECT count(*) FROM auth.users WHERE id = :id", user_id) == 0
    assert _count("SELECT count(*) FROM profiles WHERE id = :id", user_id) == 0
    assert _count("SELECT count(*) FROM played_games WHERE user_id = :id", user_id) == 0
    assert _count("SELECT count(*) FROM wishlist_games WHERE user_id = :id", user_id) == 0
    assert _count("SELECT count(*) FROM rate_limits WHERE user_id = :id", user_id) == 0
    assert (
        _count(
            "SELECT count(*) FROM follows WHERE follower_id = :id OR followee_id = :id",
            user_id,
        )
        == 0
    )
    sm = get_sessionmaker()
    with sm() as session:
        assert session.query(PlaySession).filter(PlaySession.game_id == game_id).count() == 0


@requires_db
def test_delete_account_without_profile_succeeds(
    fresh_auth_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Signing in mints the auth user before onboarding runs, so "authenticated
    # with no profile" is a real account. It must be deletable, not a 403.
    user_id, _ = fresh_auth_user
    _stub_admin_delete(monkeypatch)
    assert client_as(user_id).delete("/api/library/me/account").status_code == 204
    assert _count("SELECT count(*) FROM auth.users WHERE id = :id", user_id) == 0


@requires_db
def test_delete_account_is_idempotent(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Access tokens are verified by signature, so one outlives the user it
    # names: a repeat delete authenticates fine and finds nothing to delete.
    # That is the outcome the caller wanted, so it is a 204, not an error.
    user_id, _ = fresh_user_with_game
    _stub_admin_delete(monkeypatch)
    assert client_as(user_id).delete("/api/library/me/account").status_code == 204
    assert client_as(user_id).delete("/api/library/me/account").status_code == 204


@requires_db
def test_delete_account_unconfigured_admin_is_503(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Nothing stubbed: without admin credentials the endpoint must refuse and
    # leave the account whole, rather than reporting a deletion it cannot do.
    user_id, _ = fresh_user_with_game
    # setenv to "" rather than delenv: Settings has env_file=<repo>/.env, so
    # removing the process env var would just fall through to whatever the
    # developer has in that file. An empty string is falsy and overrides it.
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    get_settings.cache_clear()
    try:
        response = client_as(user_id).delete("/api/library/me/account")
        assert response.status_code == 503
        assert "nothing was deleted" in response.json()["detail"]
        assert _count("SELECT count(*) FROM profiles WHERE id = :id", user_id) == 1
        assert _count("SELECT count(*) FROM played_games WHERE user_id = :id", user_id) == 1
        # The one that pins the ordering the docstring argues for. Without it,
        # swapping the two statements in delete_my_account keeps every other
        # test green while a failed delete quietly clears the counters.
        assert _count("SELECT count(*) FROM rate_limits WHERE user_id = :id", user_id) == 1
    finally:
        get_settings.cache_clear()


@requires_db
def test_delete_account_bogus_404_does_not_report_success(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A 404 from the Admin API with every row still in place, which is what a
    # SUPABASE_URL with a trailing slash or a stray /auth/v1 produces. The
    # endpoint must NOT report a deletion it did not perform.
    user_id, _ = fresh_user_with_game
    _stub_admin_404(monkeypatch)

    response = client_as(user_id).delete("/api/library/me/account")

    assert response.status_code == 503
    assert _count("SELECT count(*) FROM profiles WHERE id = :id", user_id) == 1
    assert _count("SELECT count(*) FROM played_games WHERE user_id = :id", user_id) == 1
    assert _count("SELECT count(*) FROM rate_limits WHERE user_id = :id", user_id) == 1


@requires_db
def test_delete_account_genuine_404_still_succeeds(
    fresh_auth_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The other side of the same check: a 404 for a user whose profile really
    # is gone is the idempotent repeat, and stays a 204.
    user_id, _ = fresh_auth_user
    _delete_auth_user(user_id)  # really remove it, so no profile row survives
    _stub_admin_404(monkeypatch)
    assert client_as(user_id).delete("/api/library/me/account").status_code == 204


@requires_db
def test_delete_account_refuses_for_the_founder(monkeypatch: pytest.MonkeyPatch) -> None:
    # Deleting the founder is unrecoverable: the handle is reserved so signup
    # cannot reclaim it, /video-games would 404 forever, and the next
    # production build would fail prerendering its OG image.
    _stub_admin_delete(monkeypatch)

    response = client_as(ROBERT_PROFILE_ID).delete("/api/library/me/account")

    assert response.status_code == 403
    assert "cannot be deleted" in response.json()["detail"]
    assert _count("SELECT count(*) FROM profiles WHERE id = :id", ROBERT_PROFILE_ID) == 1


@requires_db
def test_delete_account_survives_a_rate_limit_cleanup_failure(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Once the auth user is gone the account is unrecoverable, so no later
    # failure may be reported as one: a 500 here would tell someone their
    # deletion failed while every row of theirs was already destroyed, and the
    # frontend would then skip both the sign-out and the cache purge.
    user_id, _ = fresh_user_with_game
    _stub_admin_delete(monkeypatch)

    def boom(_db: object, _user_id: uuid.UUID) -> None:
        raise OperationalError("DELETE FROM rate_limits", {}, Exception("connection lost"))

    monkeypatch.setattr("app.services.me.rate_limit_repo.delete_for_user", boom)

    assert client_as(user_id).delete("/api/library/me/account").status_code == 204
    assert _count("SELECT count(*) FROM profiles WHERE id = :id", user_id) == 0


@requires_db
def test_delete_account_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, _ = fresh_user_with_game
    _stub_admin_delete(monkeypatch)
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        assert client_as(user_id).delete("/api/library/me/account").status_code == 503
        assert _count("SELECT count(*) FROM profiles WHERE id = :id", user_id) == 1
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# POST /me/games (add a game)
# ---------------------------------------------------------------------------


@requires_db
def test_add_game_minimal_manual_entry(fresh_user_with_game) -> None:
    # Only name + system — the manual-add path for games IGDB doesn't know.
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).post(
        "/api/library/me/games", json={"name": "Homebrew Quest", "system": "NES"}
    )
    assert response.status_code == 201
    game = response.json()
    assert game["name"] == "Homebrew Quest"
    assert game["system"] == "NES"
    assert game["rating"] == ""
    assert game["genres"] == []
    assert game["releaseDate"] == ""
    assert game["imageUrl"] == ""
    assert game["currentlyPlaying"] is False
    assert game["sessionCount"] == 0
    assert isinstance(game["id"], int)


@requires_db
def test_add_game_full_igdb_payload(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).post(
        "/api/library/me/games",
        json={
            "name": "Chrono Trigger",
            "system": "SNES",
            "genres": ["RPG", "Adventure"],
            "releaseDate": "1995-03-11",
            "imageUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2mkh.jpg",
            "igdbId": TEST_IGDB_BASE + 1,
            "rating": "Perfect",
        },
    )
    assert response.status_code == 201
    game = response.json()
    assert game["rating"] == "Perfect"
    # The client's genres, because stub_genre_lookup makes Wikipedia a miss.
    assert game["genres"] == ["RPG", "Adventure"]
    assert game["releaseDate"] == "1995-03-11"
    assert game["imageUrl"].endswith("co2mkh.jpg")


@requires_db
def test_add_game_stores_wikipedias_genres_over_the_clients(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The one test here that lets the lookup answer, overriding the module's
    # autouse miss. IGDB's genres lose to the infobox's: that is the whole
    # point of sourcing on the write path.
    user_id, _ = fresh_user_with_game
    monkeypatch.setattr(genre_service, "lookup_one", lambda name: ["Roguelike", "Action RPG"])
    response = client_as(user_id).post(
        "/api/library/me/games",
        json={
            "name": "Hades II",
            "system": "PC",
            "genres": ["Adventure"],
            "igdbId": TEST_IGDB_BASE + 8,
        },
    )
    assert response.status_code == 201
    assert response.json()["genres"] == ["Roguelike", "Action RPG"]


@requires_db
def test_add_game_shows_on_public_read(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    username = f"gamer-{str(user_id)[:8]}"
    created = client_as(user_id).post(
        "/api/library/me/games", json={"name": "Public Test", "system": "PS5"}
    )
    assert created.status_code == 201
    games = client_as(user_id).get(f"/api/library/users/{username}/games").json()
    names = {g["name"] for g in games}
    assert "Public Test" in names
    # The fixture's original game carries its one closed session in the count.
    fixture_game = next(g for g in games if g["name"] == "Test Quest")
    assert fixture_game["sessionCount"] == 1


@requires_db
def test_add_duplicate_game_is_409(fresh_user_with_game) -> None:
    # The fixture user already owns Test Quest on SNES.
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).post(
        "/api/library/me/games", json={"name": "Test Quest", "system": "SNES"}
    )
    assert response.status_code == 409
    assert "already in your library" in response.json()["detail"]


@requires_db
def test_add_same_name_other_system_is_a_conflict(fresh_user_with_game) -> None:
    # Uniqueness used to be per (name, system), so the same game on a second
    # console was a second row. Since normalization it is one entry per game
    # per user, and the console is a field on that entry rather than part of
    # its identity — so this is the same 409 as re-adding it on SNES.
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).post(
        "/api/library/me/games", json={"name": "Test Quest", "system": "Switch"}
    )
    assert response.status_code == 409
    assert "already in your library" in response.json()["detail"]


@requires_db
def test_two_users_adding_the_same_igdb_game_share_one_catalog_row(fresh_auth_user) -> None:
    # The point of the catalog: one row for the game, N link rows for the
    # people who have it — while ratings and consoles stay independent.
    first_id, _ = fresh_auth_user
    assert (
        client_as(first_id)
        .post("/api/library/me/profile", json={"username": f"cat-{str(first_id)[:8]}"})
        .status_code
        == 201
    )
    payload = {"name": "Shared Quest", "igdbId": TEST_IGDB_BASE + 2}
    first = client_as(first_id).post(
        "/api/library/me/games", json={**payload, "system": "SNES", "rating": "Good"}
    )
    assert first.status_code == 201

    second_id = _make_auth_user()
    try:
        client_as(second_id).post(
            "/api/library/me/profile", json={"username": f"cat-{str(second_id)[:8]}"}
        )
        second = client_as(second_id).post(
            "/api/library/me/games", json={**payload, "system": "Switch", "rating": "Bad"}
        )
        assert second.status_code == 201
        # Same game, different entries.
        assert second.json()["id"] != first.json()["id"]
        assert (second.json()["system"], second.json()["rating"]) == ("Switch", "Bad")

        sm = get_sessionmaker()
        with sm() as session:
            assert (
                session.execute(
                    text("SELECT count(*) FROM game_metadata WHERE igdb_id = :g"),
                    {"g": payload["igdbId"]},
                ).scalar_one()
                == 1
            )
    finally:
        _delete_auth_user(second_id)


@requires_db
def test_same_title_via_search_then_by_hand_is_a_conflict(fresh_user_with_game) -> None:
    """The gap the (user_id, metadata_id) key cannot close on its own.

    A title added through IGDB search resolves to the SHARED catalog row; the
    same title typed in by hand resolves to a new PRIVATE one. Different
    metadata_ids, so the unique constraint permits both, and the shelf would
    show two identical cases — which the old (user_id, name, system) key
    prevented. find_game_by_name is what closes it.
    """
    user_id, _ = fresh_user_with_game
    client = client_as(user_id)
    first = client.post(
        "/api/library/me/games",
        json={"name": "Hollow Knight", "system": "Switch", "igdbId": TEST_IGDB_BASE + 6},
    )
    assert first.status_code == 201
    again = client.post("/api/library/me/games", json={"name": "Hollow Knight", "system": "Switch"})
    assert again.status_code == 409
    assert "already in your library" in again.json()["detail"]


@requires_db
def test_by_hand_then_the_same_title_via_search_is_a_conflict(fresh_user_with_game) -> None:
    """The same gap approached from the other side, where the incoming game HAS
    an id and the narrowing is doing the work.

    This is what stops the Star Fox fix from going too far: make the title
    check skip entirely when an id is present and every other test here still
    passes, because narrowing to id-less rows is what keeps a hand-entered
    entry in scope. Verified by making that mutation."""
    user_id, _ = fresh_user_with_game
    client = client_as(user_id)
    first = client.post("/api/library/me/games", json={"name": "Celeste", "system": "PC"})
    assert first.status_code == 201
    again = client.post(
        "/api/library/me/games",
        json={"name": "Celeste", "system": "Switch", "igdbId": TEST_IGDB_BASE + 10},
    )
    assert again.status_code == 409
    assert "already in your library" in again.json()["detail"]


@requires_db
def test_two_igdb_games_sharing_a_title_are_both_addable(fresh_user_with_game) -> None:
    """The other side of the title check: a shared title is NOT a duplicate.

    IGDB titles are not unique -- searching "Star Fox" returns the SNES
    original, the 2017 remaster and three more, all under that one name. Each
    is a different game with a different igdb_id, so owning one must not lock
    the rest out, which is what a title-only check did.
    """
    user_id, _ = fresh_user_with_game
    client = client_as(user_id)
    original = client.post(
        "/api/library/me/games",
        json={"name": "Star Fox", "system": "SNES", "igdbId": TEST_IGDB_BASE + 20},
    )
    assert original.status_code == 201
    remaster = client.post(
        "/api/library/me/games",
        json={"name": "Star Fox", "system": "Nintendo Switch", "igdbId": TEST_IGDB_BASE + 21},
    )
    assert remaster.status_code == 201
    assert remaster.json()["id"] != original.json()["id"]
    # ...but the SAME igdb_id still is a duplicate, whatever console it names.
    dupe = client.post(
        "/api/library/me/games",
        json={"name": "Star Fox", "system": "Wii", "igdbId": TEST_IGDB_BASE + 20},
    )
    assert dupe.status_code == 409


@requires_db
def test_losing_the_race_to_create_a_shared_row_still_succeeds(
    fresh_auth_user, monkeypatch
) -> None:
    """Two users adding the same new IGDB game at once.

    Both miss the catalog lookup, so the loser's INSERT violates
    uq_game_metadata_igdb_id. That is a lost race on a row neither of them
    owns, not a problem with either request: the loser must adopt the winner's
    row, not be told the game is already in a library it is not in.

    Simulated by making the first lookup miss, which is exactly what the racing
    request sees.
    """
    from app.repositories import me as me_repo

    owner_id, _ = fresh_auth_user
    client_as(owner_id).post(
        "/api/library/me/profile", json={"username": f"race-{str(owner_id)[:8]}"}
    )
    payload = {"name": "Race Quest", "igdbId": TEST_IGDB_BASE + 7}
    assert (
        client_as(owner_id).post("/api/library/me/games", json={**payload, "system": "PC"})
    ).status_code == 201

    loser_id = _make_auth_user()
    try:
        client_as(loser_id).post(
            "/api/library/me/profile", json={"username": f"race-{str(loser_id)[:8]}"}
        )
        real = me_repo._select_metadata
        calls = {"n": 0}

        def missing_first_time(db, **kwargs):
            calls["n"] += 1
            return None if calls["n"] == 1 else real(db, **kwargs)

        monkeypatch.setattr(me_repo, "_select_metadata", missing_first_time)
        response = client_as(loser_id).post(
            "/api/library/me/games", json={**payload, "system": "Switch"}
        )
        # Revert this one stub, not monkeypatch.undo(): the same function-scoped
        # instance also carries the autouse network guard and the genre stub, and
        # undo() would drop those too, leaving the rest of the test unguarded.
        monkeypatch.setattr(me_repo, "_select_metadata", real)

        assert response.status_code == 201, response.json()
        assert response.json()["system"] == "Switch"
        sm = get_sessionmaker()
        with sm() as session:
            assert (
                session.execute(
                    text("SELECT count(*) FROM game_metadata WHERE igdb_id = :g"),
                    {"g": payload["igdbId"]},
                ).scalar_one()
                == 1
            )
    finally:
        _delete_auth_user(loser_id)


@requires_db
def test_two_users_hand_entering_the_same_name_get_private_rows(fresh_auth_user) -> None:
    # The other half of catalog identity: with no igdb_id there is no honest
    # way to say two people mean the same game, so neither one's metadata can
    # overwrite the other's.
    first_id, _ = fresh_auth_user
    client_as(first_id).post(
        "/api/library/me/profile", json={"username": f"priv-{str(first_id)[:8]}"}
    )
    name = f"Handmade {str(first_id)[:8]}"
    assert (
        client_as(first_id).post("/api/library/me/games", json={"name": name, "system": "PC"})
    ).status_code == 201

    second_id = _make_auth_user()
    try:
        client_as(second_id).post(
            "/api/library/me/profile", json={"username": f"priv-{str(second_id)[:8]}"}
        )
        assert (
            client_as(second_id).post("/api/library/me/games", json={"name": name, "system": "PC"})
        ).status_code == 201

        sm = get_sessionmaker()
        with sm() as session:
            rows = session.execute(
                text(
                    "SELECT created_by_user_id FROM game_metadata "
                    "WHERE name = :n AND igdb_id IS NULL"
                ),
                {"n": name},
            ).scalars()
            assert sorted(str(r) for r in rows) == sorted([str(first_id), str(second_id)])
    finally:
        _delete_auth_user(second_id)


@requires_db
def test_add_game_blank_fields_are_422(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    client = client_as(user_id)
    assert (
        client.post("/api/library/me/games", json={"name": "  ", "system": "NES"}).status_code
        == 422
    )
    assert (
        client.post("/api/library/me/games", json={"name": "Game", "system": ""}).status_code == 422
    )
    assert client.post("/api/library/me/games", json={"system": "NES"}).status_code == 422


@requires_db
def test_add_game_rejects_non_igdb_image_url(fresh_user_with_game) -> None:
    # Guardrail: covers are hotlinked, so an open URL field would make the
    # library free image hosting for arbitrary content.
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).post(
        "/api/library/me/games",
        json={"name": "Sneaky", "system": "PC", "imageUrl": "https://evil.example.com/x.jpg"},
    )
    assert response.status_code == 422


@requires_db
def test_add_game_unknown_rating_is_422(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).post(
        "/api/library/me/games", json={"name": "Rated", "system": "PC", "rating": "Amazing"}
    )
    assert response.status_code == 422


@requires_db
def test_add_game_unknown_field_is_422(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).post(
        "/api/library/me/games", json={"name": "Typo", "system": "PC", "systm": "oops"}
    )
    assert response.status_code == 422


@requires_db
def test_add_game_before_onboarding_is_403(fresh_auth_user) -> None:
    # Authenticated but no profile row yet: a clear 403, not an FK 500.
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post(
        "/api/library/me/games", json={"name": "Too Soon", "system": "PC"}
    )
    assert response.status_code == 403


@requires_db
def test_add_game_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        user_id, _ = fresh_user_with_game
        response = client_as(user_id).post(
            "/api/library/me/games", json={"name": "Preview", "system": "PC"}
        )
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# DELETE /me/games/{game_id}
# ---------------------------------------------------------------------------


@requires_db
def test_delete_game_cascades_sessions(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    username = f"gamer-{str(user_id)[:8]}"
    response = client_as(user_id).delete(f"/api/library/me/games/{game_id}")
    assert response.status_code == 204

    games = client_as(user_id).get(f"/api/library/users/{username}/games").json()
    assert games == []
    sm = get_sessionmaker()
    with sm() as session:
        remaining = session.query(PlaySession).filter(PlaySession.game_id == game_id).count()
    assert remaining == 0


@requires_db
def test_delete_foreign_game_is_404(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(ROBERT_PROFILE_ID).delete(f"/api/library/me/games/{game_id}")
    assert response.status_code == 404
    # Still there for its real owner.
    check = client_as(user_id).patch(f"/api/library/me/games/{game_id}", json={})
    assert check.status_code == 200


@requires_db
def test_delete_nonexistent_game_is_404(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    assert client_as(user_id).delete("/api/library/me/games/999999999").status_code == 404


@requires_db
def test_delete_game_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        user_id, game_id = fresh_user_with_game
        response = client_as(user_id).delete(f"/api/library/me/games/{game_id}")
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Wishlist: POST/PATCH/DELETE /me/wishlist, POST /me/wishlist/{id}/promote
# ---------------------------------------------------------------------------


def _add_wishlist(user_id: uuid.UUID, body: dict) -> dict:
    response = client_as(user_id).post("/api/library/me/wishlist", json=body)
    assert response.status_code == 201, response.text
    return response.json()


@requires_db
def test_add_wishlist_minimal(fresh_user_with_game) -> None:
    # Name only — system stays undecided ("" on the wire, NULL in the DB).
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Wish Quest"})
    assert item["system"] == ""
    assert item["starred"] is False
    assert item["notes"] == ""
    assert item["dateAdded"] != ""
    assert isinstance(item["id"], int)


@requires_db
def test_add_wishlist_full(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(
        user_id,
        {
            "name": "Wish Quest Deluxe",
            "system": "PS5",
            "genres": ["RPG"],
            "releaseDate": "2024-06-01",
            "igdbId": TEST_IGDB_BASE + 3,
            "starred": True,
            "notes": "Wait for a sale",
            "dateAdded": "2026-07-01",
            "imageUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/wq.jpg",
        },
    )
    assert item["starred"] is True
    assert item["notes"] == "Wait for a sale"
    assert item["dateAdded"] == "2026-07-01"
    assert item["system"] == "PS5"


@requires_db
def test_add_wishlist_duplicate_name_is_409(fresh_user_with_game) -> None:
    # Both hand-entered, so both resolve to the same private catalog row: the
    # console is not part of the identity either way.
    user_id, _ = fresh_user_with_game
    _add_wishlist(user_id, {"name": "Wish Once", "system": "PS5"})
    response = client_as(user_id).post(
        "/api/library/me/wishlist", json={"name": "Wish Once", "system": "Switch"}
    )
    assert response.status_code == 409


@requires_db
def test_add_wishlist_before_onboarding_is_403(fresh_auth_user) -> None:
    # Same explicit profile check as POST /me/games: a clear 403 rather than
    # letting the wishlist_items → profiles FK surface as a 500 (or get
    # misread as a duplicate by the IntegrityError backstop).
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post("/api/library/me/wishlist", json={"name": "Too Soon"})
    assert response.status_code == 403


@requires_db
def test_add_wishlist_shows_on_public_read(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    username = f"gamer-{str(user_id)[:8]}"
    _add_wishlist(user_id, {"name": "Public Wish"})
    wishlist = client_as(user_id).get(f"/api/library/users/{username}/wishlist").json()
    assert [w["name"] for w in wishlist] == ["Public Wish"]


@requires_db
def test_update_wishlist_star_notes_system(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Editable Wish", "system": "PS5"})
    response = client_as(user_id).patch(
        f"/api/library/me/wishlist/{item['id']}",
        json={"starred": True, "notes": "hyped", "system": ""},
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["starred"] is True
    assert updated["notes"] == "hyped"
    assert updated["system"] == ""  # "" cleared the system back to undecided


@requires_db
def test_update_wishlist_partial_leaves_rest(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Sticky Wish", "starred": True, "notes": "keep me"})
    response = client_as(user_id).patch(
        f"/api/library/me/wishlist/{item['id']}", json={"starred": False}
    )
    updated = response.json()
    assert updated["starred"] is False
    assert updated["notes"] == "keep me"  # untouched by the partial PATCH


@requires_db
def test_update_wishlist_unknown_field_is_422(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Typo Wish"})
    response = client_as(user_id).patch(
        f"/api/library/me/wishlist/{item['id']}", json={"stared": True}
    )
    assert response.status_code == 422


@requires_db
def test_delete_wishlist_item(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    username = f"gamer-{str(user_id)[:8]}"
    item = _add_wishlist(user_id, {"name": "Doomed Wish"})
    assert client_as(user_id).delete(f"/api/library/me/wishlist/{item['id']}").status_code == 204
    wishlist = client_as(user_id).get(f"/api/library/users/{username}/wishlist").json()
    assert wishlist == []


@requires_db
def test_wishlist_foreign_and_nonexistent_are_404(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Foreign Wish"})
    assert (
        client_as(ROBERT_PROFILE_ID).delete(f"/api/library/me/wishlist/{item['id']}").status_code
        == 404
    )
    assert (
        client_as(user_id).patch("/api/library/me/wishlist/999999999", json={}).status_code == 404
    )


@requires_db
def test_two_igdb_games_sharing_a_title_are_both_wishlistable(fresh_user_with_game) -> None:
    # The wishlist twin of the library test: same rule, same narrowing in
    # find_wishlist_item_by_name.
    user_id, _ = fresh_user_with_game
    _add_wishlist(user_id, {"name": "Star Fox", "igdbId": TEST_IGDB_BASE + 11})
    _add_wishlist(user_id, {"name": "Star Fox", "igdbId": TEST_IGDB_BASE + 12})
    dupe = client_as(user_id).post(
        "/api/library/me/wishlist", json={"name": "Star Fox", "igdbId": TEST_IGDB_BASE + 11}
    )
    assert dupe.status_code == 409


@requires_db
def test_promoting_a_title_you_own_a_different_edition_of_succeeds(fresh_user_with_game) -> None:
    # Promote runs its own copy of the two checks, against the item's existing
    # catalog row rather than a freshly resolved one — so it needs the same
    # igdb_id, or buying the remaster of a game you own would be a dead end.
    user_id, _ = fresh_user_with_game
    client = client_as(user_id)
    owned = client.post(
        "/api/library/me/games",
        json={"name": "Star Fox", "system": "SNES", "igdbId": TEST_IGDB_BASE + 13},
    )
    assert owned.status_code == 201
    item = _add_wishlist(user_id, {"name": "Star Fox", "igdbId": TEST_IGDB_BASE + 14})
    response = client.post(
        f"/api/library/me/wishlist/{item['id']}/promote", json={"system": "Nintendo Switch"}
    )
    assert response.status_code == 201
    assert response.json()["id"] != owned.json()["id"]


@requires_db
def test_promote_wishlist_item(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    username = f"gamer-{str(user_id)[:8]}"
    item = _add_wishlist(
        user_id,
        {
            "name": "Promoted Quest",
            "system": "PS5",
            "genres": ["RPG"],
            "igdbId": TEST_IGDB_BASE + 4,
        },
    )
    response = client_as(user_id).post(f"/api/library/me/wishlist/{item['id']}/promote", json={})
    assert response.status_code == 201
    game = response.json()
    assert game["name"] == "Promoted Quest"
    assert game["system"] == "PS5"
    assert game["rating"] == ""  # enters the library unrated
    assert game["sessionCount"] == 0

    # Atomic move: in the library, gone from the wishlist.
    games = client_as(user_id).get(f"/api/library/users/{username}/games").json()
    assert "Promoted Quest" in {g["name"] for g in games}
    wishlist = client_as(user_id).get(f"/api/library/users/{username}/wishlist").json()
    assert wishlist == []


@requires_db
def test_promote_keeps_the_games_metadata(fresh_user_with_game) -> None:
    # Promote used to rebuild the library row from the wishlist row's own copy
    # of the metadata. Now the catalog row carries straight across, so nothing
    # can be dropped on the way.
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(
        user_id,
        {
            "name": "Detailed Quest",
            "system": "PS5",
            "genres": ["RPG", "Roguelike"],
            "releaseDate": "2021-06-01",
            "imageUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co9zzz.jpg",
            "igdbId": TEST_IGDB_BASE + 5,
        },
    )
    game = client_as(user_id).post(f"/api/library/me/wishlist/{item['id']}/promote", json={}).json()
    for field in ("name", "genres", "releaseDate", "imageUrl"):
        assert game[field] == item[field], field


@requires_db
def test_promote_payload_system_wins(fresh_user_with_game) -> None:
    # Wishlisted for PS5, bought on Switch: the request's system wins.
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Switched Quest", "system": "PS5"})
    response = client_as(user_id).post(
        f"/api/library/me/wishlist/{item['id']}/promote", json={"system": "Switch"}
    )
    assert response.status_code == 201
    assert response.json()["system"] == "Switch"


@requires_db
def test_promote_without_any_system_is_422(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Systemless Wish"})
    response = client_as(user_id).post(f"/api/library/me/wishlist/{item['id']}/promote", json={})
    assert response.status_code == 422
    # Still on the wishlist — nothing half-happened.
    username = f"gamer-{str(user_id)[:8]}"
    wishlist = client_as(user_id).get(f"/api/library/users/{username}/wishlist").json()
    assert [w["name"] for w in wishlist] == ["Systemless Wish"]


@requires_db
def test_promote_into_existing_library_slot_is_409(fresh_user_with_game) -> None:
    # The fixture user already owns Test Quest on SNES.
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Test Quest", "system": "SNES"})
    response = client_as(user_id).post(f"/api/library/me/wishlist/{item['id']}/promote", json={})
    assert response.status_code == 409
    # The wishlist row survives the refused promote.
    username = f"gamer-{str(user_id)[:8]}"
    wishlist = client_as(user_id).get(f"/api/library/users/{username}/wishlist").json()
    assert [w["name"] for w in wishlist] == ["Test Quest"]


@requires_db
def test_wishlist_writes_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Preview Wish"})
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        client = client_as(user_id)
        assert client.post("/api/library/me/wishlist", json={"name": "Nope"}).status_code == 503
        assert client.patch(f"/api/library/me/wishlist/{item['id']}", json={}).status_code == 503
        assert client.delete(f"/api/library/me/wishlist/{item['id']}").status_code == 503
        assert (
            client.post(f"/api/library/me/wishlist/{item['id']}/promote", json={}).status_code
            == 503
        )
    finally:
        get_settings.cache_clear()


# --- Abuse guardrails ------------------------------------------------------
#
# Two limits, both aimed at scripts rather than people: a per-user write budget
# and a per-library row cap. Neither is an invariant — both are count-then-act
# and can overshoot slightly under concurrency — so these test the behaviour at
# the boundary, not exactness under race.


def _reset_write_budget(user_id: uuid.UUID) -> None:
    """Zero the caller's write counter.

    Needed because the fixtures reach the API through the real write path —
    creating a profile is itself a charged write — so a test that lowers the
    limit afterwards would start already in debt. rate_limits deliberately has
    no FK to profiles, so these rows also outlive the fixture teardown.
    """
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": user_id})
        session.commit()


@requires_db
def test_write_rate_limit_returns_429_at_the_boundary(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, _ = fresh_user_with_game
    _reset_write_budget(user_id)
    # One write per window, so the second is over budget.
    monkeypatch.setattr(guards, "WRITE_RATE_LIMIT_MAX", 1)
    client = client_as(user_id)

    first = client.post("/api/library/me/wishlist", json={"name": "Within budget"})
    assert first.status_code == 201

    second = client.post("/api/library/me/wishlist", json={"name": "Over budget"})
    assert second.status_code == 429
    # Retry-After tells the caller when it's worth trying again.
    assert second.headers["Retry-After"] == str(int(guards.WRITE_RATE_LIMIT_WINDOW.total_seconds()))
    # A plain-string detail, not a validation array: mutateGame() in
    # src/lib/meApi.ts only forwards the former to the UI, so anything else
    # would reach the user as a generic "Couldn't ... (HTTP 429)".
    assert isinstance(second.json()["detail"], str)
    assert "too many" in second.json()["detail"].lower()
    # Refused before the write, not after it: the second item does not exist.
    username = f"gamer-{str(user_id)[:8]}"
    names = {w["name"] for w in client.get(f"/api/library/users/{username}/wishlist").json()}
    assert names == {"Within budget"}


@requires_db
def test_write_rate_limit_window_resets(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, _ = fresh_user_with_game
    _reset_write_budget(user_id)
    # A zero-length window is always already expired, so each request resets it.
    monkeypatch.setattr(guards, "WRITE_RATE_LIMIT_MAX", 1)
    monkeypatch.setattr(guards, "WRITE_RATE_LIMIT_WINDOW", timedelta(seconds=0))
    client = client_as(user_id)
    assert client.post("/api/library/me/wishlist", json={"name": "One"}).status_code == 201
    assert client.post("/api/library/me/wishlist", json={"name": "Two"}).status_code == 201


@requires_db
def test_write_rate_limit_is_per_user(fresh_user_with_game, monkeypatch) -> None:
    # One user exhausting their budget must not spend anyone else's.
    #
    # The second user is built by hand rather than by also requesting the
    # fresh_auth_user fixture: fresh_user_with_game depends on that fixture, so
    # pytest would hand back the SAME user and the test would prove nothing.
    spender_id, _ = fresh_user_with_game
    _reset_write_budget(spender_id)
    monkeypatch.setattr(guards, "WRITE_RATE_LIMIT_MAX", 1)
    assert (
        client_as(spender_id).post("/api/library/me/wishlist", json={"name": "A"}).status_code
        == 201
    )
    assert (
        client_as(spender_id).post("/api/library/me/wishlist", json={"name": "B"}).status_code
        == 429
    )

    other_id = _make_auth_user()
    try:
        other = client_as(other_id)
        # Onboarding is itself a charged write, and it succeeds: proof the
        # budget is keyed per user, not global.
        username = f"other-{str(other_id)[:8]}"
        assert other.post("/api/library/me/profile", json={"username": username}).status_code == 201
        # ...and their own next write is the one that exceeds their own budget.
        assert other.post("/api/library/me/wishlist", json={"name": "C"}).status_code == 429
    finally:
        _delete_auth_user(other_id)
        _reset_write_budget(other_id)


@requires_db
def test_add_game_refused_when_library_is_full(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, _ = fresh_user_with_game  # already owns exactly one game
    monkeypatch.setenv("MAX_GAMES", "1")
    get_settings.cache_clear()
    try:
        response = client_as(user_id).post(
            "/api/library/me/games", json={"name": "One Too Many", "system": "PC"}
        )
        assert response.status_code == 403
        assert "full" in response.json()["detail"].lower()
    finally:
        get_settings.cache_clear()


@requires_db
def test_add_game_allowed_below_the_cap(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    user_id, _ = fresh_user_with_game  # owns one game, cap of two leaves room
    monkeypatch.setenv("MAX_GAMES", "2")
    get_settings.cache_clear()
    try:
        response = client_as(user_id).post(
            "/api/library/me/games", json={"name": "Room For One More", "system": "PC"}
        )
        assert response.status_code == 201
    finally:
        get_settings.cache_clear()


@requires_db
def test_promote_refused_when_library_is_full(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Promote is the other door into the games table; capping only create_my_game
    # would let a full library grow by wishlisting first and promoting after.
    user_id, _ = fresh_user_with_game
    item = _add_wishlist(user_id, {"name": "Promote Me", "system": "PC"})
    monkeypatch.setenv("MAX_GAMES", "1")
    get_settings.cache_clear()
    try:
        response = client_as(user_id).post(
            f"/api/library/me/wishlist/{item['id']}/promote", json={}
        )
        assert response.status_code == 403
        assert "full" in response.json()["detail"].lower()
    finally:
        get_settings.cache_clear()
