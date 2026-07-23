"""DTOs for the authenticated /me endpoints.

Same wire conventions as schemas/users.py (camelCase via CamelModel), but
these payloads are per-viewer by definition — they are never cached or shared,
which is exactly why they live on /me/* routes instead of the public /users/*
ones.
"""

from pydantic import Field, field_validator

from app.models.game import RATING_NAMES
from app.schemas.users import CamelModel

# Matches the client hint (OnboardingForm maxLength) and bounds what we store.
MAX_DISPLAY_NAME = 80


class MyProfileRead(CamelModel):
    """The caller's own profile. Existence of this payload == onboarding done."""

    username: str
    display_name: str


class ProfileCreate(CamelModel):
    """Onboarding payload: pick a username (and display name) to create the
    profile row. Username format/reserved/cap validation lives in the service
    (one error path, one style); length caps live here because the Server
    Action is directly invocable — the client's maxLength is only a hint, so
    the server must be the real bound. Over-length → FastAPI 422."""

    username: str = Field(max_length=64)  # generous; the service regex caps at 30
    display_name: str = Field(default="", max_length=MAX_DISPLAY_NAME)


class GameUpdate(CamelModel):
    """Partial edit of one game in the caller's library (PATCH semantics):
    only fields the client actually sent are applied — the service checks
    ``model_fields_set``, so an omitted field is "leave unchanged", never
    "reset". Currently rating-only; future metadata edits extend this model.
    """

    # "" (or null) clears the rating back to unrated; a name must be one of
    # the known ratings. Validated here rather than the service because it's
    # pure shape/vocabulary — no DB or business state involved.
    rating: str | None = None

    @field_validator("rating")
    @classmethod
    def _known_rating(cls, value: str | None) -> str | None:
        if value is None or value == "" or value in RATING_NAMES:
            return value
        allowed = ", ".join(RATING_NAMES)
        raise ValueError(f"rating must be one of: {allowed} — or empty to clear it")
