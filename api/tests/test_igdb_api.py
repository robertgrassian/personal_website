"""Integration tests for the IGDB proxy against the local database.

Auth is stubbed via dependency_overrides (same pattern as test_me_api.py).
The two outbound-HTTP seams — ``_fetch_twitch_token`` and ``_query_igdb`` in
services/igdb.py — are monkeypatched, so rate limiting, token caching, and
result parsing all run for real: counters and the token row live in actual
Postgres tables.
"""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
from app.repositories import igdb as igdb_repo
from app.services import igdb as igdb_service

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

SEARCH_URL = "/api/py/igdb/search"

# A fully populated IGDB row and the DTO it should become.
FULL_IGDB_ROW = {
    "id": 1022,
    "name": "The Legend of Zelda: A Link Between Worlds",
    "first_release_date": 1385078400,  # 2013-11-22 UTC
    "platforms": [{"id": 37, "name": "Nintendo 3DS"}],
    "genres": [{"id": 31, "name": "Adventure"}, {"id": 9, "name": "Puzzle"}],
    "cover": {"id": 1, "url": "//images.igdb.com/igdb/image/upload/t_thumb/co3p0j.jpg"},
}


def client_as(user_id: uuid.UUID) -> TestClient:
    """A TestClient whose requests authenticate as the given user id."""
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=user_id, email="test@example.com"
    )
    return TestClient(app)


@pytest.fixture
def test_user() -> uuid.UUID:
    """A random authenticated caller. No auth.users/profiles rows needed:
    rate_limits deliberately has no FK. Counters cleaned on teardown."""
    user_id = uuid.uuid4()
    yield user_id
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": user_id})
        session.commit()


@pytest.fixture
def igdb_env(monkeypatch: pytest.MonkeyPatch):
    """Configured credentials + stubbed network, with the token row wiped so
    every test starts cold. Yields a dict of call counters and the last
    Apicalypse body sent upstream."""
    settings = get_settings()
    monkeypatch.setattr(settings, "twitch_client_id", "test-client-id")
    monkeypatch.setattr(settings, "twitch_client_secret", "test-secret")

    calls = {"twitch": 0, "igdb": 0, "last_body": "", "igdb_responses": []}

    def fake_fetch_twitch_token(_settings):
        calls["twitch"] += 1
        return f"token-{calls['twitch']}", datetime.now(UTC) + timedelta(days=60)

    def fake_query_igdb(_settings, _token, body):
        calls["igdb"] += 1
        calls["last_body"] = body
        if calls["igdb_responses"]:
            return calls["igdb_responses"].pop(0)
        return httpx.Response(200, json=[FULL_IGDB_ROW])

    monkeypatch.setattr(igdb_service, "_fetch_twitch_token", fake_fetch_twitch_token)
    monkeypatch.setattr(igdb_service, "_query_igdb", fake_query_igdb)

    _delete_token_row()
    yield calls
    _delete_token_row()


def _delete_token_row() -> None:
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(text("DELETE FROM igdb_tokens"))
        session.commit()


# ---------------------------------------------------------------------------
# Auth / validation / configuration
# ---------------------------------------------------------------------------


def test_search_requires_auth() -> None:
    response = TestClient(create_app()).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 401


@requires_db
def test_search_empty_q_is_422(test_user, igdb_env) -> None:
    assert client_as(test_user).get(SEARCH_URL, params={"q": ""}).status_code == 422
    assert client_as(test_user).get(SEARCH_URL).status_code == 422


@requires_db
def test_search_unconfigured_is_503(test_user, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "twitch_client_id", None)
    monkeypatch.setattr(settings, "twitch_client_secret", None)
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 503


@requires_db
def test_search_forbidden_in_preview(test_user, monkeypatch: pytest.MonkeyPatch) -> None:
    # The proxy writes (token cache, counters) and preview holds a read-only
    # DB role, so the guard refuses before anything runs.
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Result parsing
# ---------------------------------------------------------------------------


@requires_db
def test_search_returns_parsed_results(test_user, igdb_env) -> None:
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 200
    (result,) = response.json()
    assert result == {
        "igdbId": 1022,
        "name": "The Legend of Zelda: A Link Between Worlds",
        "releaseDate": "2013-11-22",
        "platforms": ["Nintendo 3DS"],
        "genres": ["Adventure", "Puzzle"],
        "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co3p0j.jpg",
    }


@requires_db
def test_sparse_igdb_rows_become_empty_fields(test_user, igdb_env) -> None:
    # Games without cover art are deliberately included — the FE has fallback
    # art, and filtering would make obscure games un-addable.
    igdb_env["igdb_responses"].append(httpx.Response(200, json=[{"id": 7, "name": "Obscurity"}]))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "obscurity"})
    assert response.status_code == 200
    (result,) = response.json()
    assert result == {
        "igdbId": 7,
        "name": "Obscurity",
        "releaseDate": "",
        "platforms": [],
        "genres": [],
        "coverUrl": "",
    }


@requires_db
def test_already_absolute_cover_url_is_not_double_prefixed(test_user, igdb_env) -> None:
    # If IGDB ever returns an already-absolute https:// cover, the scheme must
    # not be doubled (https:https://...) — that would fail validate_igdb_image_url
    # on a later POST /me/games.
    igdb_env["igdb_responses"].append(
        httpx.Response(
            200,
            json=[
                {
                    "id": 9,
                    "name": "Absolute",
                    "cover": {"url": "https://images.igdb.com/igdb/image/upload/t_thumb/x.jpg"},
                }
            ],
        )
    )
    response = client_as(test_user).get(SEARCH_URL, params={"q": "absolute"})
    (result,) = response.json()
    assert result["coverUrl"] == "https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg"


@requires_db
def test_query_term_is_escaped(test_user, igdb_env) -> None:
    client_as(test_user).get(SEARCH_URL, params={"q": 'say "hi" \\ bye'})
    assert 'search "say \\"hi\\" \\\\ bye";' in igdb_env["last_body"]


# ---------------------------------------------------------------------------
# Token caching
# ---------------------------------------------------------------------------


@requires_db
def test_twitch_token_is_cached_across_requests(test_user, igdb_env) -> None:
    client = client_as(test_user)
    assert client.get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    assert client.get(SEARCH_URL, params={"q": "mario"}).status_code == 200
    # One mint, two searches: the second request read the token row.
    assert igdb_env["twitch"] == 1
    assert igdb_env["igdb"] == 2


@requires_db
def test_near_expiry_token_is_refreshed(test_user, igdb_env) -> None:
    # A token inside the 1-day safety margin is treated as dead.
    sm = get_sessionmaker()
    with sm() as session:
        igdb_repo.upsert_token(session, "stale-token", datetime.now(UTC) + timedelta(hours=2))
    assert client_as(test_user).get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    assert igdb_env["twitch"] == 1


@requires_db
def test_igdb_401_refreshes_token_and_retries_once(test_user, igdb_env) -> None:
    igdb_env["igdb_responses"].append(httpx.Response(401, json={"message": "expired"}))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 200
    # First mint + forced re-mint after the 401; two IGDB calls total.
    assert igdb_env["twitch"] == 2
    assert igdb_env["igdb"] == 2


@requires_db
def test_persistent_upstream_failure_is_502(test_user, igdb_env) -> None:
    igdb_env["igdb_responses"].append(httpx.Response(500))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 502


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


@requires_db
def test_rate_limit_returns_429_over_budget(test_user, igdb_env, monkeypatch) -> None:
    monkeypatch.setattr(igdb_service, "RATE_LIMIT_MAX", 3)
    client = client_as(test_user)
    for _ in range(3):
        assert client.get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    response = client.get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 429
    # The 429 was decided before any upstream call was spent on it.
    assert igdb_env["igdb"] == 3


@requires_db
def test_rate_limit_window_resets(test_user, igdb_env, monkeypatch) -> None:
    # A zero-length window means every request sees the previous window as
    # expired — the counter resets instead of accumulating toward the max.
    monkeypatch.setattr(igdb_service, "RATE_LIMIT_MAX", 1)
    monkeypatch.setattr(igdb_service, "RATE_LIMIT_WINDOW", timedelta(seconds=0))
    client = client_as(test_user)
    assert client.get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    assert client.get(SEARCH_URL, params={"q": "mario"}).status_code == 200


@requires_db
def test_rate_limits_are_per_user(igdb_env, test_user) -> None:
    other_user = uuid.uuid4()
    sm = get_sessionmaker()
    try:
        with sm() as session:
            for expected in (1, 2, 3):
                count = igdb_repo.increment_rate_limit(
                    session, test_user, "igdb_search", timedelta(seconds=60)
                )
                assert count == expected
            assert (
                igdb_repo.increment_rate_limit(
                    session, other_user, "igdb_search", timedelta(seconds=60)
                )
                == 1
            )
    finally:
        with sm() as session:
            session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": other_user})
            session.commit()
