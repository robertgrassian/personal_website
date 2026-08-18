"""The prefix the whole API is mounted under, and its transitional alias.

Renamed from /api/py to /api/library on 2026-08-18: the old spelling named the
runtime, which is an implementation detail clients cannot be made to forget once
they have cached it. These tests pin the parts of that move that fail quietly.
"""

import re

import pytest
from fastapi.testclient import TestClient

from app.core.config import API_PREFIX, LEGACY_API_PREFIX, get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def _fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_every_route_is_reachable_under_the_legacy_prefix() -> None:
    """The alias is a whole second mount, not a hand-listed subset.

    It exists for the deploy window: a page loaded before the rename keeps
    calling the old prefix until its tab closes, and the build container
    prerenders against whichever API version is currently live.

    Probed by request rather than by reading app.routes, because FastAPI defers
    included routers and their paths are not populated on the app object.
    A 404 is the only failing answer here: unauthenticated calls stop at 401,
    which still proves the route is mounted.
    """
    app = create_app()
    # raise_server_exceptions=False so a handler that reaches the database and
    # fails (no DATABASE_URL in a bare checkout) comes back as a 500 instead of
    # propagating. Reaching the handler at all is what this test is asking about.
    client = TestClient(app, raise_server_exceptions=False)
    for path, operations in app.openapi()["paths"].items():
        legacy = path.replace(API_PREFIX, LEGACY_API_PREFIX, 1)
        # Path params are irrelevant to whether the route exists.
        legacy = re.sub(r"\{[^}]+\}", "placeholder", legacy)
        for method in operations:
            response = client.request(method.upper(), legacy)
            assert response.status_code != 404, f"{method.upper()} {legacy} is not mounted"


def test_legacy_prefix_is_absent_from_the_openapi_document() -> None:
    """It is a transitional alias, not a second supported surface. Publishing it
    would also break the Bruno collection check, which reads this document."""
    spec = create_app().openapi()
    assert not [p for p in spec["paths"] if p.startswith(LEGACY_API_PREFIX)]


def test_legacy_prefix_serves_the_same_response() -> None:
    client = TestClient(create_app())
    canonical = client.get(f"{API_PREFIX}/health")
    legacy = client.get(f"{LEGACY_API_PREFIX}/health")
    assert canonical.status_code == legacy.status_code == 200
    assert canonical.json() == legacy.json()


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
