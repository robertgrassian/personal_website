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
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
from app.models import Game, PlaySession
from scripts.seed import ROBERT_PROFILE_ID

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")


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
    Everything hangs off the auth user, so fresh_auth_user's teardown cascades
    it all away (auth.users → profiles → games → play_sessions)."""
    user_id, _ = fresh_auth_user
    username = f"gamer-{str(user_id)[:8]}"
    created = client_as(user_id).post("/api/py/me/profile", json={"username": username})
    assert created.status_code == 201

    sm = get_sessionmaker()
    with sm() as session:
        game = Game(
            user_id=user_id,
            name="Test Quest",
            system="SNES",
            rating="Good",
            genres=["RPG"],
            release_date=date(1995, 3, 9),
        )
        session.add(game)
        session.flush()
        session.add(
            PlaySession(game_id=game.id, start_date=date(2026, 1, 1), end_date=date(2026, 1, 15))
        )
        session.commit()
        game_id = game.id
    yield user_id, game_id


@requires_db
def test_get_my_profile_returns_seeded_owner() -> None:
    response = client_as(ROBERT_PROFILE_ID).get("/api/py/me/profile")
    assert response.status_code == 200
    assert response.json() == {"username": "rgrassian", "displayName": "Robert"}


@requires_db
def test_get_my_profile_404_when_not_onboarded() -> None:
    # A valid auth user with no profile row → the "complete onboarding" state.
    response = client_as(uuid.uuid4()).get("/api/py/me/profile")
    assert response.status_code == 404


@requires_db
def test_missing_token_is_401() -> None:
    # No dependency override here — the real auth dependency runs and rejects.
    response = TestClient(create_app()).get("/api/py/me/profile")
    assert response.status_code == 401


@requires_db
def test_create_profile_completes_onboarding(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    client = client_as(user_id)
    response = client.post(
        "/api/py/me/profile",
        json={"username": "NewPlayer", "displayName": "New Player"},
    )
    assert response.status_code == 201
    # Username is normalized to lowercase on the way in.
    assert response.json() == {"username": "newplayer", "displayName": "New Player"}
    # And now GET finds it.
    assert client.get("/api/py/me/profile").status_code == 200


@requires_db
def test_create_profile_defaults_display_name_to_username(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post("/api/py/me/profile", json={"username": "solohandle"})
    assert response.status_code == 201
    assert response.json() == {"username": "solohandle", "displayName": "solohandle"}


@requires_db
def test_create_profile_second_time_is_409(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    client = client_as(user_id)
    assert client.post("/api/py/me/profile", json={"username": "onceonly"}).status_code == 201
    again = client.post("/api/py/me/profile", json={"username": "oncemore"})
    assert again.status_code == 409


@requires_db
def test_create_profile_taken_username_is_409(fresh_auth_user) -> None:
    # First user claims a (non-reserved) handle; a second user can't reuse it.
    first_id, _ = fresh_auth_user
    created = client_as(first_id).post("/api/py/me/profile", json={"username": "sharedname"})
    assert created.status_code == 201
    second_id = _make_auth_user()
    try:
        response = client_as(second_id).post("/api/py/me/profile", json={"username": "SharedName"})
        # citext: case-insensitive collision is still a conflict.
        assert response.status_code == 409
    finally:
        _delete_auth_user(second_id)


@requires_db
def test_create_profile_reserved_username_is_422(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post("/api/py/me/profile", json={"username": "search"})
    assert response.status_code == 422


@requires_db
def test_create_profile_bad_format_is_422(fresh_auth_user) -> None:
    user_id, _ = fresh_auth_user
    response = client_as(user_id).post("/api/py/me/profile", json={"username": "no"})
    assert response.status_code == 422


@requires_db
def test_create_profile_over_cap_is_403(fresh_auth_user, monkeypatch: pytest.MonkeyPatch) -> None:
    # MAX_USERS=1 with the founder already seeded → cap reached.
    monkeypatch.setenv("MAX_USERS", "1")
    get_settings.cache_clear()
    try:
        user_id, _ = fresh_auth_user
        response = client_as(user_id).post("/api/py/me/profile", json={"username": "toolate"})
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
        response = client_as(user_id).post("/api/py/me/profile", json={"username": "previewuser"})
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
    created = client_as(first_id).post("/api/py/me/profile", json={"username": "raced"})
    assert created.status_code == 201

    second_id = _make_auth_user()
    monkeypatch.setattr("app.repositories.me.username_exists", lambda *a, **k: False)
    try:
        response = client_as(second_id).post("/api/py/me/profile", json={"username": "raced"})
        assert response.status_code == 409
    finally:
        _delete_auth_user(second_id)


# ── PATCH /me/games/{id} ──────────────────────────────────────────────────


@requires_db
def test_patch_game_requires_token() -> None:
    response = TestClient(create_app()).patch("/api/py/me/games/1", json={"rating": "Good"})
    assert response.status_code == 401


@requires_db
def test_patch_game_updates_rating(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/py/me/games/{game_id}", json={"rating": "Perfect"})
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
    assert client.patch(f"/api/py/me/games/{game_id}", json={"rating": "Bad"}).status_code == 200
    username = client.get("/api/py/me/profile").json()["username"]
    [game] = TestClient(create_app()).get(f"/api/py/users/{username}/games").json()
    assert game["rating"] == "Bad"


@requires_db
def test_patch_game_empty_string_clears_rating(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/py/me/games/{game_id}", json={"rating": ""})
    assert response.status_code == 200
    assert response.json()["rating"] == ""  # NULL in the DB, "" on the wire


@requires_db
def test_patch_game_omitted_rating_changes_nothing(fresh_user_with_game) -> None:
    # PATCH semantics: {} is a valid no-op — absent fields are left untouched,
    # not reset. The fixture's rating survives.
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/py/me/games/{game_id}", json={})
    assert response.status_code == 200
    assert response.json()["rating"] == "Good"


@requires_db
def test_patch_game_unknown_rating_is_422(fresh_user_with_game) -> None:
    user_id, game_id = fresh_user_with_game
    response = client_as(user_id).patch(f"/api/py/me/games/{game_id}", json={"rating": "Legendary"})
    assert response.status_code == 422


@requires_db
def test_patch_someone_elses_game_is_404(fresh_user_with_game) -> None:
    # The fixture user's game PATCHed by a different (seeded) account: the
    # ownership check must make it look nonexistent, and the row must be
    # untouched afterward.
    user_id, game_id = fresh_user_with_game
    response = client_as(ROBERT_PROFILE_ID).patch(
        f"/api/py/me/games/{game_id}", json={"rating": "Perfect"}
    )
    assert response.status_code == 404
    check = client_as(user_id).patch(f"/api/py/me/games/{game_id}", json={})
    assert check.json()["rating"] == "Good"


@requires_db
def test_patch_nonexistent_game_is_404(fresh_user_with_game) -> None:
    user_id, _ = fresh_user_with_game
    response = client_as(user_id).patch("/api/py/me/games/999999999", json={"rating": "Good"})
    assert response.status_code == 404


@requires_db
def test_patch_game_forbidden_in_preview(
    fresh_user_with_game, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        user_id, game_id = fresh_user_with_game
        response = client_as(user_id).patch(
            f"/api/py/me/games/{game_id}", json={"rating": "Perfect"}
        )
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()
