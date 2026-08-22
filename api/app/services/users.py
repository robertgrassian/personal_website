"""Business logic for the public user reads: resolve a profile, compose the
repository queries, derive play state (spec §4.3), and build the wire DTOs.

Not-found style: services raise ``UserNotFoundError`` (a domain exception with
no HTTP knowledge) and routers map it to a 404. Chosen over returning None so
call sites can't silently forget the check and the error carries the username
for the response body.

Play-state semantics, defined here and nowhere else: an open session (NULL
end_date) means "currently playing"; the newest open start_date is "playing
since"; the newest closed end_date is "last played" ("" when there are no closed
sessions).
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.models import GameMetadata, PlayedGame, PlaySession, WishlistGame
from app.repositories import users as users_repo
from app.schemas.users import GameRead, PlaySessionRead, ProfileRead, WishlistGameRead


class UserNotFoundError(DomainError):
    """No profile exists for the requested username."""

    status_code = status.HTTP_404_NOT_FOUND

    def __init__(self, username: str) -> None:
        super().__init__(f"User '{username}' not found")
        self.username = username


@dataclass(frozen=True)
class PlayState:
    currently_playing: bool
    last_played: str  # ISO date or ""
    playing_since: str  # ISO date or ""
    open_session_id: int | None  # newest open session, None when not playing
    session_count: int  # all sessions, open and closed


def derive_play_state(sessions: Iterable[PlaySession]) -> PlayState:
    """Pure function over one game's sessions — see module docstring for the
    ported semantics. Dates compare as date objects here (the TS version
    compares ISO strings lexically — equivalent for valid dates)."""
    sessions = list(sessions)
    open_sessions = [s for s in sessions if s.end_date is None]
    closed_ends = [s.end_date for s in sessions if s.end_date is not None]
    # Newest open session wins both fields; id breaks a same-day tie (higher
    # id = inserted later). Keeps playing_since and open_session_id pointing
    # at the same session.
    newest_open = max(open_sessions, key=lambda s: (s.start_date, s.id), default=None)
    return PlayState(
        currently_playing=newest_open is not None,
        last_played=max(closed_ends).isoformat() if closed_ends else "",
        playing_since=newest_open.start_date.isoformat() if newest_open else "",
        open_session_id=newest_open.id if newest_open else None,
        session_count=len(sessions),
    )


def _iso_or_empty(d: date | None) -> str:
    return d.isoformat() if d is not None else ""


def _require_profile(db: Session, username: str):
    profile = users_repo.get_profile_by_username(db, username)
    if profile is None:
        raise UserNotFoundError(username)
    return profile


def to_game_read(game: PlayedGame, meta: GameMetadata, play_state: PlayState) -> GameRead:
    """Library entry + catalog row + derived play state → wire DTO. Public
    because the /me write path (services/me.py) returns the same shape after a
    mutation.

    The entry contributes only what is the user's own (system, rating, play
    state); everything describing the game itself comes off the catalog row.
    Flattening the two back into one object here is what keeps normalization
    invisible to the frontend.

    NULL→"" translation: the FE types use "" (never null) for absent
    scalars — see the schemas.users module docstring."""
    return GameRead(
        id=game.id,
        name=meta.name,
        system=game.system,
        rating=game.rating or "",
        genres=list(meta.genres),
        platforms=list(meta.platforms),
        release_date=_iso_or_empty(meta.release_date),
        image_url=meta.image_url or "",
        igdb_id=meta.igdb_id,
        last_played=play_state.last_played,
        currently_playing=play_state.currently_playing,
        playing_since=play_state.playing_since,
        open_session_id=play_state.open_session_id,
        session_count=play_state.session_count,
    )


def to_wishlist_read(item: WishlistGame, meta: GameMetadata) -> WishlistGameRead:
    """Wishlist entry + catalog row → wire DTO. Public because the /me wishlist
    writes (services/me.py) return the same shape after a mutation."""
    return WishlistGameRead(
        id=item.id,
        name=meta.name,
        system=item.system or "",
        genres=list(meta.genres),
        platforms=list(meta.platforms),
        release_date=_iso_or_empty(meta.release_date),
        image_url=meta.image_url or "",
        igdb_id=meta.igdb_id,
        starred=item.starred,
        date_added=_iso_or_empty(item.date_added),
        notes=item.notes,
    )


def get_user_games(db: Session, username: str) -> list[GameRead]:
    """The user's library with play state pre-derived (spec §4.3, §6).

    Three queries total regardless of library size: profile, games (joined to
    their catalog rows), and all sessions for those games — grouped per game in
    Python.
    """
    profile = _require_profile(db, username)
    entries = users_repo.list_games(db, profile.id)
    sessions_by_game: dict[int, list[PlaySession]] = defaultdict(list)
    for session in users_repo.list_play_sessions(db, [g.id for g, _ in entries]):
        sessions_by_game[session.game_id].append(session)
    return [
        to_game_read(game, meta, derive_play_state(sessions_by_game.get(game.id, [])))
        for game, meta in entries
    ]


def get_user_sessions(db: Session, username: str) -> list[PlaySessionRead]:
    """The user's whole play history, newest first.

    Public because GameRead's derived play state already comes from these rows,
    so the raw list adds when and how often, not which games. Kept out of
    get_user_games because that payload is the cached library page, and most
    viewers never open this detail.
    """
    profile = _require_profile(db, username)
    return [
        PlaySessionRead(
            id=session.id,
            game_id=session.game_id,
            start_date=session.start_date.isoformat(),
            # None, not "": an open session is a state. See PlaySessionRead.
            end_date=session.end_date.isoformat() if session.end_date is not None else None,
        )
        for session in users_repo.list_sessions_for_user(db, profile.id)
    ]


def get_user_wishlist(db: Session, username: str) -> list[WishlistGameRead]:
    profile = _require_profile(db, username)
    return [
        to_wishlist_read(item, meta)
        for item, meta in users_repo.list_wishlist_items(db, profile.id)
    ]


def get_user_profile(db: Session, username: str) -> ProfileRead:
    """Public profile payload — public data only, no per-viewer fields
    (spec §7.2: this response is cacheable and shared across viewers)."""
    found = users_repo.get_profile_with_counts(db, username)
    if found is None:
        raise UserNotFoundError(username)
    profile, follower_count, following_count = found
    return ProfileRead(
        username=profile.username,
        display_name=profile.display_name,
        follower_count=follower_count,
        following_count=following_count,
    )
