"""The prefix the whole API is mounted under, and its transitional alias.

Renamed from /api/py to /api/library on 2026-08-18: the old spelling named the
runtime, which is an implementation detail clients cannot be made to forget once
they have cached it. These tests pin the parts of that move that fail quietly.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import API_PREFIX, get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def _fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_routers_do_not_hardcode_the_prefix() -> None:
    """The prefix is applied once in create_app(). A router that bakes it into
    its own APIRouter() would be mounted at /api/library/api/library/... under
    the canonical include and would skip the legacy alias entirely."""
    doubled = f"{API_PREFIX}{API_PREFIX}"
    assert not [p for p in create_app().openapi()["paths"] if doubled in p]


def test_following_is_a_put_not_a_post() -> None:
    """Following is idempotent, so it must not be a verb clients are entitled to
    refuse to retry. 405 rather than 401 proves POST is gone rather than merely
    unauthorized."""
    client = TestClient(create_app())
    path = f"{API_PREFIX}/me/following/somebody"
    assert client.post(path).status_code == 405
    # PUT and DELETE exist; without a token they stop at auth.
    assert client.put(path).status_code == 401
    assert client.delete(path).status_code == 401


def test_catalog_routes_do_not_name_the_vendor() -> None:
    """IGDB is the supplier behind the search, not the resource being served, so
    it must not appear in a path a client has to hardcode."""
    paths = create_app().openapi()["paths"]
    assert not [p for p in paths if "igdb" in p.lower()]
    assert f"{API_PREFIX}/game-catalog" in paths
    assert f"{API_PREFIX}/game-catalog/preview" in paths
