"""Minimal GoTrue Admin API client.

Only what auth needs so far: deleting an auth user. Two callers want opposite
things from a failure, so there are two entry points over one request:

- ``delete_auth_user`` cleans up the orphaned ``auth.users`` row when signup
  hits the MAX_USERS cap (OAuth mints the auth user *before* profile creation
  runs the cap check, so an over-cap signup would otherwise leave a phantom
  account consuming a monthly-active-user slot). That is cleanup on an error
  path, so it swallows failures.
- ``delete_auth_user_or_raise`` backs account deletion, where this call *is*
  the primary action — the profiles row and everything under it disappear via
  ON DELETE CASCADE from auth.users, so a swallowed failure would tell someone
  their account was deleted while it still exists.

Uses the service-role key — the credential that bypasses all authorization —
so this module must only ever run server-side with the key from env
(SUPABASE_SERVICE_ROLE_KEY, never NEXT_PUBLIC_).
"""

import logging
import uuid

import httpx
from fastapi import status

from app.core.config import get_settings
from app.core.errors import DomainError

logger = logging.getLogger(__name__)


class AuthUserDeleteError(DomainError):
    """The Admin API call failed or the admin credentials are missing.

    503 rather than 500: nothing about the request was wrong, a dependency is
    unavailable, and retrying later is the right advice."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    def __init__(self) -> None:
        super().__init__(
            "Could not reach the accounts service, so nothing was deleted. Please try again."
        )


def _delete_auth_user(user_id: uuid.UUID) -> bool:
    """Issue the Admin API delete, raising on any failure.

    Returns True when the API deleted a user, False when it answered 404. That
    distinction is the caller's to interpret and NOT a synonym for "already
    gone": this URL is built by string-concatenating an env var, so a
    SUPABASE_URL with a trailing slash or an extra ``/auth/v1`` produces a
    request the gateway 404s with every row still in place. A bare 404 cannot
    tell the two apart, so this function refuses to guess.

    Private because the failure modes it raises (RuntimeError for missing
    config, httpx.HTTPError for the call) are not what either caller wants to
    surface — they translate them.
    """
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_role_key):
        raise RuntimeError(
            "Supabase admin API not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
        )
    response = httpx.delete(
        f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
        },
        timeout=5.0,
    )
    if response.status_code == 404:
        logger.info("Admin API reported no such auth user %s", user_id)
        return False
    response.raise_for_status()
    return True


def delete_auth_user(user_id: uuid.UUID) -> None:
    """Delete an auth.users row via the Admin API, best-effort.

    Logs and returns instead of raising, because the caller uses this as
    cleanup on an error path and a failed cleanup must not mask the primary
    response. Every outcome is logged here, so there is nothing for that caller
    to branch on. When the outcome does matter, use
    ``delete_auth_user_or_raise``."""
    try:
        _delete_auth_user(user_id)
    except RuntimeError:
        logger.warning(
            "Supabase admin API not configured; skipping auth user cleanup for %s", user_id
        )
    # InvalidURL is listed separately because it is NOT an httpx.HTTPError
    # subclass, so a malformed SUPABASE_URL (spaces, no scheme) would otherwise
    # escape this handler as a 500 instead of the intended outcome.
    except (httpx.HTTPError, httpx.InvalidURL):
        logger.exception("Failed to delete auth user %s via admin API", user_id)


def delete_auth_user_or_raise(user_id: uuid.UUID) -> bool:
    """Delete an auth.users row via the Admin API, raising on failure.

    Returns True when a user was deleted and False when the API answered 404.
    A False is NOT proof the user is gone — see ``_delete_auth_user`` — so the
    caller must confirm that some other way before reporting success. The
    service layer does it by checking the profile row, which the cascade takes
    with a genuinely deleted auth user.

    Raises ``AuthUserDeleteError`` (503) when the admin credentials are missing
    or the call fails. Missing config is a failure here rather than a no-op: an
    environment that cannot delete auth users cannot honor account deletion,
    and reporting success would be a lie."""
    try:
        return _delete_auth_user(user_id)
    except RuntimeError:
        logger.error("Supabase admin API not configured; cannot delete account for %s", user_id)
        raise AuthUserDeleteError() from None
    # InvalidURL is not an httpx.HTTPError subclass, so without it a malformed
    # SUPABASE_URL escapes as a 500. Same true outcome (nothing deleted), worse
    # message.
    except (httpx.HTTPError, httpx.InvalidURL) as exc:
        logger.exception("Failed to delete auth user %s via admin API", user_id)
        raise AuthUserDeleteError() from exc
