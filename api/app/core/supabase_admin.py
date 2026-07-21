"""Minimal GoTrue Admin API client.

Only what auth needs so far: deleting an auth user, used to clean up the
orphaned ``auth.users`` row when signup hits the MAX_USERS cap (OAuth mints the
auth user *before* profile creation runs the cap check, so an over-cap signup
would otherwise leave a phantom account consuming a monthly-active-user slot).

Uses the service-role key — the credential that bypasses all authorization —
so this module must only ever run server-side with the key from env
(SUPABASE_SERVICE_ROLE_KEY, never NEXT_PUBLIC_).
"""

import logging
import uuid

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def delete_auth_user(user_id: uuid.UUID) -> bool:
    """Delete an auth.users row via the Admin API. Best-effort: returns False
    (after logging) instead of raising, because callers use this as cleanup on
    an error path — failing the cleanup must not mask the primary response."""
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_role_key):
        logger.warning(
            "Supabase admin API not configured (SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY); skipping auth user cleanup for %s",
            user_id,
        )
        return False
    try:
        response = httpx.delete(
            f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
            },
            timeout=5.0,
        )
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.exception("Failed to delete auth user %s via admin API", user_id)
        return False
