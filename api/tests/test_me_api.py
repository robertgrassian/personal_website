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

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
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
    # MAX_USERS=1 with Robert already seeded → cap reached (spec decision #13).
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
    # Spec §7.5: mutations are refused on preview deploys (cleanly, as 503 —
    # not an ugly read-only-role 500).
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
