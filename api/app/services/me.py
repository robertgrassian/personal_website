"""Business logic for the authenticated /me endpoints (spec §5, §6).

Onboarding is the "authenticated but no profile yet" transition (spec §5.2):
OAuth/magic-link creates the auth.users row, then the user picks a username
and this service creates the matching profiles row (id == auth id, §4.2).

Domain exceptions (no HTTP knowledge) that the router maps to status codes:
``ProfileExistsError`` (already onboarded), ``UsernameError`` (format /
reserved / taken), ``SignupCapReachedError`` (MAX_USERS). Same not-found-as-
exception style as services/users.py.
"""

import re

from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser
from app.core.config import get_settings
from app.core.supabase_admin import delete_auth_user
from app.models import Profile
from app.repositories import me as me_repo
from app.schemas.me import MyProfileRead, ProfileCreate

# Mirrors the DB CHECK on profiles.username (app/models/profile.py): starts
# with a lowercase letter or digit, then [a-z0-9_-], 3-30 chars total. Kept in
# sync deliberately — the app validates for a friendly message, the DB
# backstops. Input is lowercased before this runs, so the class is safe.
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,29}$")

# Reserved handles rejected regardless of format. Two categories:
#   1. API-colliding tokens — /users/{username} shares its namespace with
#      /users/search and the /me alias, so those MUST be reserved (spec §4.2).
#   2. Route/branding/abuse names that shouldn't become public library URLs.
RESERVED_USERNAMES = frozenset(
    {
        # API/route collisions
        "me",
        "search",
        "users",
        "user",
        "api",
        "library",
        "login",
        "logout",
        "signup",
        "signin",
        "auth",
        "onboarding",
        "u",
        # site sections (would shadow real routes / confuse)
        "about",
        "resume",
        "video_games",
        "admin",
        "settings",
        "account",
        # branding / impersonation
        "robert",  # the founder handle is seeded; keep it un-claimable
        "grassian",
        "official",
        "support",
        "help",
        "root",
        "null",
        "undefined",
    }
)


class ProfileExistsError(Exception):
    """The caller already has a profile — onboarding is a one-time action."""


class UsernameError(Exception):
    """Username rejected: bad format, reserved, or already taken. Carries a
    machine-readable ``reason`` so the router/FE can branch without parsing
    the message."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason  # "format" | "reserved" | "taken"


class SignupCapReachedError(Exception):
    """MAX_USERS reached (spec decision #13) — signup is closed."""


def get_my_profile(db: Session, user: AuthenticatedUser) -> MyProfileRead | None:
    """The caller's profile, or None when onboarding isn't complete. The
    router turns None into a 404 the FE reads as "go to onboarding"."""
    profile = me_repo.get_profile_by_id(db, user.id)
    if profile is None:
        return None
    return MyProfileRead(username=profile.username, display_name=profile.display_name)


def _validate_username(username: str) -> str:
    """Normalize and validate, or raise UsernameError. Returns the canonical
    (lowercased, trimmed) username to store."""
    normalized = username.strip().lower()
    if not USERNAME_RE.match(normalized):
        raise UsernameError(
            "format",
            "Username must be 3-30 characters, start with a letter or number, "
            "and use only lowercase letters, numbers, hyphens, and underscores.",
        )
    if normalized in RESERVED_USERNAMES:
        raise UsernameError("reserved", f"The username '{normalized}' is reserved.")
    return normalized


def create_my_profile(
    db: Session, user: AuthenticatedUser, payload: ProfileCreate
) -> MyProfileRead:
    """Complete onboarding: create the caller's profile row.

    Order of checks is deliberate:
    1. Already onboarded → ProfileExistsError (idempotency guard; never a
       second profile for one auth user).
    2. Username format / reserved → UsernameError before touching the DB.
    3. Signup cap → SignupCapReachedError. Because OAuth already minted this
       auth user, an over-cap signup leaves an orphan consuming a MAU (spec
       §6); we delete it via the Admin API before raising so counts stay
       honest.
    4. Taken → UsernameError("taken"). Checked explicitly for a clean 409, and
       the DB unique index backstops the race.
    """
    if me_repo.get_profile_by_id(db, user.id) is not None:
        raise ProfileExistsError("Profile already exists for this account.")

    username = _validate_username(payload.username)

    settings = get_settings()
    if me_repo.count_profiles(db) >= settings.max_users:
        # Clean up the orphaned auth user before refusing (best-effort; the
        # admin client logs and returns False if unconfigured).
        delete_auth_user(user.id)
        raise SignupCapReachedError(
            "Signups are currently at capacity. Please check back later."
        )

    if me_repo.username_exists(db, username):
        raise UsernameError("taken", f"The username '{username}' is already taken.")

    display_name = payload.display_name.strip() or username
    profile: Profile = me_repo.create_profile(
        db, user_id=user.id, username=username, display_name=display_name
    )
    return MyProfileRead(username=profile.username, display_name=profile.display_name)
