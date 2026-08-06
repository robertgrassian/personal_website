"""Response DTOs for the IGDB proxy.

Same wire conventions as schemas/users.py: camelCase keys, "" (never null)
for absent scalars, ISO YYYY-MM-DD dates. The shape feeds the add-game
picker: everything the confirm step pre-fills (system, genres, release date,
cover) plus ``igdb_id``, which POST /me/games will store on the created row.
"""

from app.schemas.users import CamelModel


class IgdbSearchResult(CamelModel):
    """One candidate game from an IGDB search."""

    igdb_id: int
    name: str
    release_date: str  # ISO date or "" if IGDB has none
    # IGDB's own platform/genre names ("Nintendo Entertainment System"), not
    # this site's shelf labels ("NES") — the add-game UI shows them as
    # editable suggestions, so no mapping table is needed server-side.
    platforms: list[str]
    genres: list[str]
    cover_url: str  # t_cover_big https URL, or "" = FE renders fallback art


class IgdbSearchResponse(CamelModel):
    """One page of candidates, plus whether asking for another is worth it.

    ``has_more`` is the server's answer rather than something the picker infers
    from the page length: only this side knows the page cap, and only this side
    knows when a page came from a fallback query that cannot be paged at all.
    """

    results: list[IgdbSearchResult]
    has_more: bool
