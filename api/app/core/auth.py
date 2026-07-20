"""JWT verification for authenticated endpoints (spec §5).

FastAPI plays the OAuth2 *resource server* role here (the Spring analogy is
``spring-boot-starter-oauth2-resource-server`` pointed at an issuer): Supabase
Auth (GoTrue) issues the tokens, this module only verifies them. No session
state, no DB lookup — a valid signature plus the standard claim checks is the
whole authentication story, which is what makes it serverless-safe.

Verification mode is env-driven. The current Supabase CLI stack and hosted
Supabase both sign access tokens with asymmetric keys (ES256) and publish a
JWKS endpoint, so the JWKS path is the norm in every environment:
- ``SUPABASE_JWKS_URL`` set → asymmetric verification (ES256/RS256) against the
  project's JWKS endpoint. Keys are fetched lazily and cached for the lifetime
  of the warm serverless instance.
- ``SUPABASE_JWT_SECRET`` set → HS256 shared-secret verification, kept for a
  legacy project that still signs symmetrically. Takes precedence if both are
  set, so configure exactly one.
"""

import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

# Supabase access tokens carry aud="authenticated" for logged-in users;
# pinning the audience rejects anon-role tokens outright.
EXPECTED_AUDIENCE = "authenticated"

# auto_error=False: HTTPBearer's built-in error is a 403 without a
# WWW-Authenticate header; handling the missing-credentials case ourselves
# yields the correct 401 challenge instead.
_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    """Verified identity extracted from the JWT.

    ``id`` is the auth.users UUID (the ``sub`` claim). Whether a profiles row
    exists for it is a separate question — the "authenticated but no profile
    yet" state (spec §5.2) — answered by the service layer, not here.
    """

    id: uuid.UUID
    email: str | None


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    # One client (and one key fetch) per warm instance; PyJWKClient also
    # caches individual signing keys internally.
    return jwt.PyJWKClient(url)


def decode_token(token: str) -> dict[str, Any]:
    """Verify signature + standard claims (exp, aud, iss when configured)
    and return the claim set. Raises jwt.InvalidTokenError on any failure."""
    settings = get_settings()
    # PyJWT skips the issuer check when issuer=None — enforced whenever
    # SUPABASE_AUTH_ISSUER is configured, skipped otherwise.
    claim_args: dict[str, Any] = {
        "audience": EXPECTED_AUDIENCE,
        "issuer": settings.supabase_auth_issuer,
    }
    if settings.supabase_jwt_secret:
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], **claim_args)
    if settings.supabase_jwks_url:
        key = _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token).key
        # Hosted Supabase JWT signing keys are ECC (ES256) by default with RSA
        # (RS256) as the alternative; HS256 is deliberately absent here so a
        # symmetric token can never satisfy the asymmetric path.
        return jwt.decode(token, key, algorithms=["ES256", "RS256"], **claim_args)
    # Misconfiguration, not a bad request: fail loudly as a 500, never as a
    # silent auth bypass or a misleading 401.
    raise RuntimeError(
        "Auth is not configured: set SUPABASE_JWT_SECRET (local stack) or "
        "SUPABASE_JWKS_URL (hosted Supabase)."
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> AuthenticatedUser:
    """FastAPI dependency guarding authenticated routes.

    Declaring a parameter of type ``CurrentUser`` on a route both enforces
    authentication and hands the handler the verified identity.
    """
    if credentials is None:
        raise _unauthorized("Missing bearer token")
    try:
        claims = decode_token(credentials.credentials)
    except jwt.InvalidTokenError as exc:
        # PyJWT's messages ("Signature has expired", "Audience doesn't match")
        # reveal nothing secret and make client-side debugging tractable.
        raise _unauthorized(f"Invalid token: {exc}") from exc
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise _unauthorized("Token has no valid subject claim") from exc
    email = claims.get("email")
    return AuthenticatedUser(id=user_id, email=email if isinstance(email, str) else None)


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
