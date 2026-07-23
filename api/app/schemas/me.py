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


def validate_igdb_image_url(value: str) -> str:
    """Covers are hotlinked into pages, so an open URL field would let any
    account use their library as free image hosting; only the IGDB CDN (or
    empty = fallback art) is accepted. Shared by every payload with a cover."""
    if value and not value.startswith("https://images.igdb.com/"):
        raise ValueError("imageUrl must be an https://images.igdb.com/ URL, or empty")
    return value


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


class GameCreate(CamelModel):
    """Add a game to the caller's library — typically from an IGDB search
    pick, but every IGDB-derived field is optional so manually entered games
    (titles IGDB doesn't know) work with just name + system.

    ``imageUrl`` only accepts IGDB CDN URLs (or empty): covers are hotlinked,
    and an open URL field would let any account use their library as free
    image hosting for arbitrary content.
    """

    model_config = FORBID_EXTRA

    name: str = Field(min_length=1, max_length=200)
    system: str = Field(min_length=1, max_length=100)
    genres: list[str] = Field(default_factory=list, max_length=10)
    release_date: date | None = None
    image_url: str = Field(default="", max_length=500)
    igdb_id: int | None = None
    # Optional up-front rating (back-filling games finished long ago);
    # omitted/"" = enters the library unrated.
    rating: str | None = None

    _known_rating = field_validator("rating")(validate_known_rating)

    @field_validator("name", "system")
    @classmethod
    def _strip_nonempty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("genres")
    @classmethod
    def _clean_genres(cls, value: list[str]) -> list[str]:
        cleaned = [g.strip() for g in value if g.strip()]
        if any(len(g) > 50 for g in cleaned):
            raise ValueError("each genre must be 50 characters or fewer")
        return cleaned

    _igdb_url_only = field_validator("image_url")(validate_igdb_image_url)


class WishlistCreate(CamelModel):
    """Add a wishlist entry — same IGDB-pick-or-manual shape as GameCreate,
    but only ``name`` is required: wishlist dedupes by name alone and
    ``system`` may stay empty until you decide which platform to buy.

    ``dateAdded`` defaults to the server's UTC clock; the web UI sends the
    browser-local date explicitly, same as session dates."""

    model_config = FORBID_EXTRA

    name: str = Field(min_length=1, max_length=200)
    system: str = Field(default="", max_length=100)
    genres: list[str] = Field(default_factory=list, max_length=10)
    release_date: date | None = None
    image_url: str = Field(default="", max_length=500)
    igdb_id: int | None = None
    starred: bool = False
    notes: str = Field(default="", max_length=1000)
    date_added: date = Field(default_factory=date.today)

    _igdb_url_only = field_validator("image_url")(validate_igdb_image_url)

    @field_validator("name")
    @classmethod
    def _strip_nonempty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("genres")
    @classmethod
    def _clean_genres(cls, value: list[str]) -> list[str]:
        cleaned = [g.strip() for g in value if g.strip()]
        if any(len(g) > 50 for g in cleaned):
            raise ValueError("each genre must be 50 characters or fewer")
        return cleaned


class WishlistUpdate(CamelModel):
    """Partial edit of a wishlist entry (PATCH semantics via
    ``model_fields_set``, like GameUpdate). ``system: ""`` clears back to
    undecided (stored NULL); starred and notes replace outright."""

    model_config = FORBID_EXTRA

    starred: bool | None = None
    notes: str | None = Field(default=None, max_length=1000)
    system: str | None = Field(default=None, max_length=100)


class WishlistPromote(CamelModel):
    """Promote a wishlist entry to the library ("I bought it"). ``system`` is
    required by the games table, so it must arrive here when the wishlist row
    never got one; when both exist, the payload wins (you might buy it on a
    different platform than you wishlisted)."""

    model_config = FORBID_EXTRA

    system: str = Field(default="", max_length=100)


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
