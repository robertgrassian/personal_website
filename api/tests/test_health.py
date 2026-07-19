import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def _fresh_settings():
    # get_settings is lru_cached per process; clear it around each test so
    # env manipulation (monkeypatch) actually reaches Settings.
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_health_returns_ok() -> None:
    client = TestClient(create_app())
    response = client.get("/api/py/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "env": get_settings().app_env}


def test_docs_disabled_outside_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    # Spec decision #24: OpenAPI/docs routes must not exist unless APP_ENV=dev.
    monkeypatch.setenv("APP_ENV", "prod")
    get_settings.cache_clear()
    client = TestClient(create_app())
    assert client.get("/api/py/docs").status_code == 404
    assert client.get("/api/py/openapi.json").status_code == 404
