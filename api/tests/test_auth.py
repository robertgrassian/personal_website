"""Unit tests for the JWT verification dependency (app/core/auth.py).

Tokens are minted in-test with PyJWT against a throwaway secret — no Supabase
stack needed. The dependency is exercised through a minimal FastAPI app so the
full request path (header extraction → decode → claims → 401 mapping) is what
gets tested, not decode_token in isolation.
"""

import time

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, decode_token
from app.core.config import get_settings

TEST_SECRET = "unit-test-secret-not-a-real-credential-0123456789"
TEST_ISSUER = "http://127.0.0.1:54321/auth/v1"
TEST_SUB = "11111111-2222-4333-8444-555555555555"


def mint(
    secret: str = TEST_SECRET,
    *,
    sub: str = TEST_SUB,
    aud: str = "authenticated",
    iss: str | None = TEST_ISSUER,
    expires_in: int = 3600,
) -> str:
    now = int(time.time())
    claims: dict = {
        "sub": sub,
        "aud": aud,
        "iat": now,
        "exp": now + expires_in,
        "email": "test@example.com",
    }
    if iss is not None:
        claims["iss"] = iss
    return jwt.encode(claims, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def _auth_env(monkeypatch: pytest.MonkeyPatch):
    # Deterministic auth config regardless of what the local .env contains.
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setenv("SUPABASE_AUTH_ISSUER", TEST_ISSUER)
    monkeypatch.setenv("SUPABASE_JWKS_URL", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(scope="module")
def client() -> TestClient:
    # A minimal app isolates the dependency from the real routers.
    app = FastAPI()

    @app.get("/whoami")
    def whoami(user: CurrentUser) -> dict:
        return {"id": str(user.id), "email": user.email}

    return TestClient(app)


def get(client: TestClient, token: str | None):
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    return client.get("/whoami", headers=headers)


def test_valid_token_yields_authenticated_user(client: TestClient) -> None:
    response = get(client, mint())
    assert response.status_code == 200
    assert response.json() == {"id": TEST_SUB, "email": "test@example.com"}


def test_missing_token_is_401_with_challenge(client: TestClient) -> None:
    response = get(client, None)
    assert response.status_code == 401
    # RFC 6750: a 401 must advertise the Bearer scheme.
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_expired_token_is_401(client: TestClient) -> None:
    response = get(client, mint(expires_in=-10))
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


def test_wrong_signature_is_401(client: TestClient) -> None:
    assert get(client, mint("some-other-secret-of-sufficient-length!!")).status_code == 401


def test_anon_audience_is_401(client: TestClient) -> None:
    # Supabase anon tokens carry aud="anon" — they must not authenticate.
    assert get(client, mint(aud="anon")).status_code == 401


def test_wrong_issuer_is_401(client: TestClient) -> None:
    assert get(client, mint(iss="https://evil.example.com/auth/v1")).status_code == 401


def test_non_uuid_sub_is_401(client: TestClient) -> None:
    assert get(client, mint(sub="not-a-uuid")).status_code == 401


def test_garbage_token_is_401(client: TestClient) -> None:
    assert get(client, "not.a.jwt").status_code == 401


def test_unconfigured_auth_raises_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    # Neither secret nor JWKS URL: a server misconfiguration, never a 401.
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="Auth is not configured"):
        decode_token(mint())
