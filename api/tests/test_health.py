import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.db import get_engine
from app.main import create_app


@pytest.fixture(autouse=True)
def _fresh_settings():
    # get_settings is lru_cached per process; clear it around each test so
    # env manipulation (monkeypatch) actually reaches Settings.
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def _fresh_engine():
    # get_engine is lru_cached too; clear it so a monkeypatched DATABASE_URL
    # produces a new engine, and clear again afterwards so later tests don't
    # inherit an engine bound to the manipulated URL.
    get_engine.cache_clear()
    yield
    get_engine.cache_clear()


def test_health_without_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    # Env vars beat the .env file in pydantic-settings, so an empty value
    # simulates the no-DB environment even on a machine with a local stack.
    monkeypatch.setenv("DATABASE_URL", "")
    get_settings.cache_clear()
    client = TestClient(create_app())
    response = client.get("/api/py/health")
    assert response.status_code == 200
    # The db field is omitted entirely — the endpoint must keep working
    # without a configured database.
    assert response.json() == {"status": "ok", "env": get_settings().app_env}


@pytest.mark.usefixtures("_fresh_engine")
def test_health_unreachable_database_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    # Port 9 (discard) is closed; the connection is refused immediately.
    monkeypatch.setenv("DATABASE_URL", "postgresql://nobody:nope@127.0.0.1:9/nope")
    get_settings.cache_clear()
    client = TestClient(create_app())
    response = client.get("/api/py/health")
    assert response.status_code == 503
    assert "Database health check failed" in response.json()["detail"]


def test_docs_disabled_outside_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    # Spec decision #24: OpenAPI/docs routes must not exist unless APP_ENV=dev.
    monkeypatch.setenv("APP_ENV", "prod")
    get_settings.cache_clear()
    client = TestClient(create_app())
    assert client.get("/api/py/docs").status_code == 404
    assert client.get("/api/py/openapi.json").status_code == 404
