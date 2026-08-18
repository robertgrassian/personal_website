"""Wire-contract tests for GET /game-catalog/preview.

No database and no network: the DB dependency and the service function are both
overridden, because what is under test is the HTTP layer itself — which query
parameter names the route accepts and what it hands the service.

That is a narrow-looking target with a specific history. The route originally
declared `igdb_id` / `release_date` while the client sent `igdbId` /
`releaseDate`, and FastAPI IGNORES unrecognized query params rather than
rejecting them, so every request arrived with both set to None and 200 OK. The
service-level test asserting preview and write agree passed throughout, because
it called the service directly and never crossed the layer holding the bug.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.db import get_db
from app.main import create_app
from app.routers import me as me_router
from app.schemas.me import CatalogPreview

PREVIEW_URL = "/api/library/game-catalog/preview"


@pytest.fixture
def captured():
    return {}


@pytest.fixture
def client(monkeypatch, captured):
    """A TestClient authenticated as some user, with the service stubbed so the
    call it receives can be inspected."""
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=uuid.uuid4(), email="test@example.com"
    )
    app.dependency_overrides[get_db] = lambda: None

    def fake_preview(db, user, **kwargs):
        captured.update(kwargs)
        return CatalogPreview(genres=["Role-Playing"], release_date=None)

    monkeypatch.setattr(me_router.me_service, "preview_catalog_entry", fake_preview)
    return TestClient(app)


def test_camelcase_query_params_reach_the_service(client, captured):
    """The regression. These are the exact names src/lib/meApi.ts builds."""
    res = client.get(
        PREVIEW_URL,
        params={
            "name": "Hades II",
            "igdbId": 152391,
            "releaseDate": "2024-05-06",
            "genres": ["Adventure", "Indie"],
        },
    )
    assert res.status_code == 200
    assert captured["igdb_id"] == 152391
    assert str(captured["release_date"]) == "2024-05-06"
    assert captured["genres"] == ["Adventure", "Indie"]


def test_snake_case_names_are_not_accepted(client, captured):
    """The other half of the contract: one spelling, not two. Without this a
    later 'helpful' alias could reintroduce the ambiguity that caused the bug,
    and the test above would still pass."""
    res = client.get(PREVIEW_URL, params={"name": "Hades II", "igdb_id": 152391})
    assert res.status_code == 200
    assert captured["igdb_id"] is None


def test_optional_params_may_be_omitted(client, captured):
    """A hand-entered game sends a name and nothing else."""
    res = client.get(PREVIEW_URL, params={"name": "Some Obscure Game"})
    assert res.status_code == 200
    assert captured == {
        "name": "Some Obscure Game",
        "igdb_id": None,
        "genres": [],
        "release_date": None,
    }


def test_a_malformed_release_date_is_rejected(client):
    res = client.get(PREVIEW_URL, params={"name": "Hades II", "releaseDate": "not-a-date"})
    assert res.status_code == 422


def test_too_many_genres_are_rejected(client):
    """The list is bounded at the same MAX_GENRES the create schema uses, so an
    authenticated caller cannot push an unlimited query string through."""
    res = client.get(
        PREVIEW_URL, params={"name": "Hades II", "genres": [f"G{i}" for i in range(20)]}
    )
    assert res.status_code == 422


def test_a_blank_name_is_rejected(client):
    assert client.get(PREVIEW_URL, params={"name": ""}).status_code == 422
