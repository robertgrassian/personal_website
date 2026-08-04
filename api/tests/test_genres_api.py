"""Integration tests for the genre lookup endpoint against the local database.

Auth is stubbed via dependency_overrides and the outbound ``_get`` seam in
services/genres.py is monkeypatched, so rate limiting runs for real against
actual Postgres while the network stays out of it. Same shape as
test_igdb_api.py.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
from app.services import genres as genre_service

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

LOOKUP_URL = "/api/py/genres/lookup"


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


def client_as(user_id: uuid.UUID) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=user_id, email="test@example.com"
    )
    return TestClient(app)


@pytest.fixture
def test_user():
    """A random authenticated caller. rate_limits has no FK to profiles, so no
    fixture rows are needed; counters are cleaned on teardown."""
    user_id = uuid.uuid4()
    yield user_id
    with get_sessionmaker()() as session:
        session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": user_id})
        session.commit()


@pytest.fixture
def stub_network(monkeypatch):
    """Wikipedia search finds the article; its infobox carries the genres."""
    article = (
        "{{Infobox video game\n| genre = [[Roguelike]], [[hack and slash]]\n"
        "| modes = Single-player\n}}"
    )

    def fake_get(url, params):
        if params.get("list") == "search":
            return FakeResponse({"query": {"search": [{"title": "Hades II"}]}})
        return FakeResponse(
            {
                "query": {
                    "pages": [
                        {
                            "title": "Hades II",
                            "revisions": [{"slots": {"main": {"content": article}}}],
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr(genre_service, "_get", fake_get)


@requires_db
def test_returns_normalized_genres(test_user, stub_network):
    res = client_as(test_user).get(LOOKUP_URL, params={"name": "Hades II"})
    assert res.status_code == 200
    body = res.json()
    # Read from the article infobox and Title Cased -- the same normalization
    # the backfill applies, so the add flow and the shelves share one vocabulary.
    assert body["genres"] == ["Roguelike", "Hack and Slash"]
    assert body["article"] == "Hades II"


@requires_db
def test_no_match_is_an_empty_200_not_an_error(test_user, monkeypatch):
    """An obscure or misspelled title is an ordinary outcome: the picker falls
    back to IGDB's genres rather than showing an error."""
    monkeypatch.setattr(
        genre_service, "_get", lambda url, params: FakeResponse({"query": {"search": []}})
    )
    res = client_as(test_user).get(LOOKUP_URL, params={"name": "Not A Real Game"})
    assert res.status_code == 200
    assert res.json() == {"genres": [], "article": ""}


@requires_db
def test_rate_limited_after_the_per_minute_budget(test_user, stub_network):
    client = client_as(test_user)
    for _ in range(genre_service.RATE_LIMIT_MAX):
        assert client.get(LOOKUP_URL, params={"name": "Hades II"}).status_code == 200
    res = client.get(LOOKUP_URL, params={"name": "Hades II"})
    assert res.status_code == 429
    assert "genre lookups" in res.json()["detail"]


@requires_db
def test_uses_its_own_rate_limit_bucket(test_user, stub_network):
    """Charged separately from igdb_search: the add flow calls both back to
    back, so sharing a bucket would halve each one's real budget."""
    client_as(test_user).get(LOOKUP_URL, params={"name": "Hades II"})
    with get_sessionmaker()() as session:
        buckets = session.execute(
            text("SELECT bucket FROM rate_limits WHERE user_id = :id"), {"id": test_user}
        ).scalars().all()
    assert buckets == ["genre_lookup"]


@requires_db
def test_rejects_a_blank_name(test_user):
    assert client_as(test_user).get(LOOKUP_URL, params={"name": ""}).status_code == 422


@requires_db
def test_rejects_an_overlong_name(test_user):
    res = client_as(test_user).get(LOOKUP_URL, params={"name": "x" * 201})
    assert res.status_code == 422


def test_requires_authentication():
    """No dependency override here, so the real JWT guard runs."""
    res = TestClient(create_app()).get(LOOKUP_URL, params={"name": "Hades II"})
    assert res.status_code == 401
