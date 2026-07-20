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


def test_unconfigured_dependency_propagates_not_401(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Through the full dependency path: a misconfigured server must surface as
    # a server error (RuntimeError → 500 in a real deploy), NEVER be swallowed
    # into a 401. A 401 here would be an auth bypass waiting to happen — the
    # request would look "merely unauthenticated" instead of "server broken".
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "")
    get_settings.cache_clear()
    # TestClient re-raises unhandled server exceptions into the test, so a
    # propagating RuntimeError (not a 401 response) is the assertion.
    with pytest.raises(RuntimeError, match="Auth is not configured"):
        get(client, mint())


def _es256_token(private_key, *, sub: str = TEST_SUB, iss: str | None = TEST_ISSUER) -> str:
    now = int(time.time())
    claims: dict = {
        "sub": sub,
        "aud": "authenticated",
        "iat": now,
        "exp": now + 3600,
        "email": "es256@example.com",
    }
    if iss is not None:
        claims["iss"] = iss
    return jwt.encode(claims, private_key, algorithm="ES256")


def test_jwks_es256_path_verifies(monkeypatch: pytest.MonkeyPatch) -> None:
    # The PRODUCTION verification path: hosted Supabase (and the local CLI
    # stack) sign access tokens with ES256 and publish JWKS. Stub only the
    # network key-fetch; the ES256 signature check itself is real crypto.
    from cryptography.hazmat.primitives.asymmetric import ec

    import app.core.auth as auth_mod

    private_key = ec.generate_private_key(ec.SECP256R1())
    token = _es256_token(private_key)

    class _StubKey:
        key = private_key.public_key()

    class _StubClient:
        def get_signing_key_from_jwt(self, _token: str) -> "_StubKey":
            return _StubKey()

    monkeypatch.setattr(auth_mod, "_jwks_client", lambda _url: _StubClient())
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://example.test/.well-known/jwks.json")
    monkeypatch.setenv("SUPABASE_AUTH_ISSUER", TEST_ISSUER)
    get_settings.cache_clear()

    claims = decode_token(token)
    assert claims["sub"] == TEST_SUB
    assert claims["email"] == "es256@example.com"


def test_jwks_es256_rejects_token_signed_by_other_key(monkeypatch: pytest.MonkeyPatch) -> None:
    # An ES256 token signed by a key the JWKS doesn't serve must fail — proves
    # the signature is actually verified, not just decoded.
    from cryptography.hazmat.primitives.asymmetric import ec

    import app.core.auth as auth_mod

    served_key = ec.generate_private_key(ec.SECP256R1())
    attacker_key = ec.generate_private_key(ec.SECP256R1())
    token = _es256_token(attacker_key)

    class _StubClient:
        def get_signing_key_from_jwt(self, _token: str):
            return type("K", (), {"key": served_key.public_key()})()

    monkeypatch.setattr(auth_mod, "_jwks_client", lambda _url: _StubClient())
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://example.test/.well-known/jwks.json")
    monkeypatch.setenv("SUPABASE_AUTH_ISSUER", TEST_ISSUER)
    get_settings.cache_clear()

    with pytest.raises(jwt.InvalidTokenError):
        decode_token(token)


def test_jwks_path_rejects_hs256_token(monkeypatch: pytest.MonkeyPatch) -> None:
    # Alg-confusion defense: on the asymmetric (JWKS) path, an HS256 token must
    # be rejected outright because `algorithms` is pinned to ES256/RS256. The
    # classic attack forges an HS256 token using the *public* key bytes as the
    # HMAC secret; pinning the algorithms defeats it before verification.
    from cryptography.hazmat.primitives.asymmetric import ec

    import app.core.auth as auth_mod

    served = ec.generate_private_key(ec.SECP256R1())

    class _StubClient:
        def get_signing_key_from_jwt(self, _token: str):
            return type("K", (), {"key": served.public_key()})()

    monkeypatch.setattr(auth_mod, "_jwks_client", lambda _url: _StubClient())
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://example.test/.well-known/jwks.json")
    monkeypatch.setenv("SUPABASE_AUTH_ISSUER", TEST_ISSUER)
    get_settings.cache_clear()

    # mint() produces an HS256 token; it must not verify on the JWKS path.
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(mint())
