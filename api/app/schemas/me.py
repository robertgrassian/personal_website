"""DTOs for the authenticated /me endpoints.

Same wire conventions as schemas/users.py (camelCase via CamelModel), but
these payloads are per-viewer by definition — they are never cached or shared,
which is exactly why they live on /me/* routes instead of the public /users/*
ones.
"""

from datetime import date

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.models.game import RATING_NAMES
from app.schemas.users import CamelModel

# Request bodies reject unknown keys ("extra": a typo like {"ratings": ...}
# must be a loud 422, not a silent no-op — especially under PATCH semantics
# where "field absent" legitimately means "leave unchanged"). Pydantic merges
# this with the inherited CamelModel config rather than replacing it.
FORBID_EXTRA = ConfigDict(extra="forbid")

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

    model_config = FORBID_EXTRA

    username: str = Field(max_length=64)  # generous; the service regex caps at 30
    display_name: str = Field(default="", max_length=MAX_DISPLAY_NAME)


def validate_known_rating(value: str | None) -> str | None:
    """Shared rating vocabulary check: None/"" clear, otherwise must be one of
    the known rating names. Used by every payload that can carry a rating."""
    if value is None or value == "" or value in RATING_NAMES:
        return value
    allowed = ", ".join(RATING_NAMES)
    raise ValueError(f"rating must be one of: {allowed} — or empty to clear it")


class GameUpdate(CamelModel):
    """Partial edit of one game in the caller's library (PATCH semantics):
    only fields the client actually sent are applied — the service checks
    ``model_fields_set``, so an omitted field is "leave unchanged", never
    "reset". Currently rating-only; future metadata edits extend this model.
    """

    model_config = FORBID_EXTRA

    # "" (or null) clears the rating back to unrated; a name must be one of
    # the known ratings. Validated here rather than the service because it's
    # pure shape/vocabulary — no DB or business state involved.
    rating: str | None = None

    _known_rating = field_validator("rating")(validate_known_rating)


class SessionCreate(CamelModel):
    """Start playing now, or log a past playthrough, on one of the caller's
    games. ``endDate`` omitted/null creates an OPEN session ("start playing" —
    the game becomes currently playing); both dates present logs a finished
    past session.

    The date defaults use the server's clock, which is UTC in production — an
    evening write in a western timezone would land on the "wrong" day. The web
    UI therefore always sends explicit browser-local dates; the defaults exist
    for tests and hand-rolled API calls."""

    model_config = FORBID_EXTRA

    start_date: date = Field(default_factory=date.today)
    end_date: date | None = None

    @model_validator(mode="after")
    def _dates_ordered(self) -> "SessionCreate":
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("endDate must not be before startDate")
        return self


class SessionClose(CamelModel):
    """Close an open session ("stop playing"), optionally rating the game in
    the same request — applied atomically so a rate-on-stop can never half-
    land. ``rating`` follows the same PATCH semantics as GameUpdate: omitted =
    leave unchanged, ""/null = clear to unrated.

    ``endDate >= the session's startDate`` is enforced in the service (it
    needs the stored row); same UTC-default caveat as SessionCreate."""

    model_config = FORBID_EXTRA

    end_date: date = Field(default_factory=date.today)
    rating: str | None = None

    _known_rating = field_validator("rating")(validate_known_rating)
