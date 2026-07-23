"""Response DTOs for the public user endpoints.

Mirroring contract (spec §6): ``GameRead`` and ``WishlistGameRead`` mirror the
frontend TypeScript types ``Game`` (src/lib/games.ts) and ``WishlistGame``
(src/lib/wishlist.ts) field-for-field so the FE types don't churn when the
data source moves from CSV to this API. That means:

- **camelCase keys on the wire** (``releaseDate``, ``imageUrl``, ...), produced
  by the ``to_camel`` alias generator; Python code still uses snake_case names.
- **Empty string, never null, for absent scalars**: ``rating``, ``releaseDate``,
  ``imageUrl``, ``lastPlayed``, ``playingSince``, ``system`` (wishlist) are
  ``""`` when the DB column is NULL, matching the FE's ``"" = unknown/unset``
  convention. Dates are ISO ``YYYY-MM-DD`` strings otherwise.
- ``currentlyPlaying`` is a boolean and ``genres`` a string array, as in TS.

The NULL→"" translation happens in the service layer (which owns building
these DTOs from ORM rows); these models just declare the shape.

``ProfileRead`` has no TS counterpart yet — it is the public profile payload
(spec §7.2): public data only, no per-viewer fields, because this response is
cacheable and shared across viewers.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for wire DTOs: serialize with camelCase aliases, construct with
    snake_case field names (populate_by_name)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class BaseGameRead(CamelModel):
    """Mirrors ``BaseGame`` (src/lib/baseGame.ts) — fields shared by library
    games and wishlist entries."""

    name: str
    system: str  # "" when NULL (wishlist entries may have no system yet)
    genres: list[str]
    release_date: str  # ISO date or "" if unknown
    image_url: str  # "" = FE renders its fallback art


class GameRead(BaseGameRead):
    """Mirrors ``Game`` (src/lib/games.ts): BaseGame + rating + derived play
    state — plus the row ``id``, which the TS type carries as optional (CSV
    rows never had one) and the owner write path targets (PATCH /me/games/{id}).

    Exposing ids on the public read is an accepted trade-off: anyone can
    enumerate a library's row ids, but ids grant nothing — every mutation
    re-checks ownership against the caller's token and 404s otherwise."""

    id: int
    rating: str  # one of RATINGS names, or "" = unrated
    last_played: str  # newest closed-session end date, "" if none
    currently_playing: bool  # true when the game has an open session
    playing_since: str  # newest open-session start date, "" if not playing
    # Id of the newest open session, null when not playing. Rides in the
    # public payload so the owner UI can close it (PATCH /me/sessions/{id})
    # without an extra fetch — same enumeration trade-off as ``id``: knowing a
    # session id grants nothing, mutations re-check ownership.
    open_session_id: int | None
    # Total sessions (open + closed) — the delete confirm says how much play
    # history goes with the game. Free to compute: play-state derivation
    # already loads every session.
    session_count: int


class WishlistGameRead(BaseGameRead):
    """Mirrors ``WishlistGame`` (src/lib/wishlist.ts)."""

    starred: bool
    date_added: str  # ISO date ("" if unknown; NOT NULL in the DB, so always set)
    notes: str


class ProfileRead(CamelModel):
    """Public profile: username, display name, follow counts. Deliberately no
    per-viewer state (am_i_following etc.) — spec §7.2, this payload is cached
    and shared across viewers."""

    username: str
    display_name: str
    follower_count: int
    following_count: int
