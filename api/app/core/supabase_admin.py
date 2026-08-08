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


def _delete_auth_user(user_id: uuid.UUID) -> None:
    """Issue the Admin API delete, raising on any failure.

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
    # Already gone is the outcome both callers wanted, so treat it as success
    # rather than a failure. This is reachable for real: access tokens are
    # verified by signature and outlive the user they name, so a second delete
    # arriving on a still-valid token from an already-deleted account
    # authenticates fine and 404s here. Raising would tell that caller the
    # accounts service was unreachable, which is both wrong and alarming.
    if response.status_code == 404:
        logger.info("Auth user %s was already gone", user_id)
        return
    response.raise_for_status()


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
    except httpx.HTTPError:
        logger.exception("Failed to delete auth user %s via admin API", user_id)


def delete_auth_user_or_raise(user_id: uuid.UUID) -> None:
    """Delete an auth.users row via the Admin API, raising on failure.

    Raises ``AuthUserDeleteError`` (503) when the admin credentials are missing
    or the call fails. Missing config is a failure here rather than a no-op: an
    environment that cannot delete auth users cannot honor account deletion,
    and reporting success would be a lie."""
    try:
        _delete_auth_user(user_id)
    except RuntimeError:
        logger.error("Supabase admin API not configured; cannot delete account for %s", user_id)
        raise AuthUserDeleteError() from None
    except httpx.HTTPError as exc:
        logger.exception("Failed to delete auth user %s via admin API", user_id)
        raise AuthUserDeleteError() from exc
