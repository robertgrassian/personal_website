"""Business logic for the public user reads: resolve a profile, compose the
repository queries, derive play state (spec §4.3), and build the wire DTOs.

Not-found style: services raise ``UserNotFoundError`` (a domain exception with
no HTTP knowledge) and routers map it to a 404. Chosen over returning None so
call sites can't silently forget the check and the error carries the username
for the response body.

Play-state derivation is a direct port of ``derivePlayState()`` in
src/lib/gamesServer.ts: an open session (NULL end_date) means "currently
playing"; the newest open start_date is "playing since"; the newest closed
end_date is "last played" ("" when there are no closed sessions).
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models import Game, PlaySession, WishlistItem
from app.repositories import users as users_repo
from app.schemas.users import GameRead, ProfileRead, WishlistGameRead


class UserNotFoundError(Exception):
    """No profile exists for the requested username."""

    def __init__(self, username: str) -> None:
        super().__init__(f"User '{username}' not found")
        self.username = username


@dataclass(frozen=True)
class PlayState:
    currently_playing: bool
    last_played: str  # ISO date or ""
    playing_since: str  # ISO date or ""


def derive_play_state(sessions: Iterable[PlaySession]) -> PlayState:
    """Pure function over one game's sessions — see module docstring for the
    ported semantics. Dates compare as date objects here (the TS version
    compares ISO strings lexically — equivalent for valid dates)."""
    open_starts = [s.start_date for s in sessions if s.end_date is None]
    closed_ends = [s.end_date for s in sessions if s.end_date is not None]
    return PlayState(
        currently_playing=bool(open_starts),
        last_played=max(closed_ends).isoformat() if closed_ends else "",
        playing_since=max(open_starts).isoformat() if open_starts else "",
    )


def _iso_or_empty(d: date | None) -> str:
    return d.isoformat() if d is not None else ""


def _require_profile(db: Session, username: str):
    profile = users_repo.get_profile_by_username(db, username)
    if profile is None:
        raise UserNotFoundError(username)
    return profile


def _to_game_read(game: Game, play_state: PlayState) -> GameRead:
    # NULL→"" translation: the FE types use "" (never null) for absent
    # scalars — see the schemas.users module docstring.
    return GameRead(
        name=game.name,
        system=game.system,
        rating=game.rating or "",
        genres=list(game.genres),
        release_date=_iso_or_empty(game.release_date),
        image_url=game.image_url or "",
        last_played=play_state.last_played,
        currently_playing=play_state.currently_playing,
        playing_since=play_state.playing_since,
    )


def _to_wishlist_read(item: WishlistItem) -> WishlistGameRead:
    return WishlistGameRead(
        name=item.name,
        system=item.system or "",
        genres=list(item.genres),
        release_date=_iso_or_empty(item.release_date),
        image_url=item.image_url or "",
        starred=item.starred,
        date_added=_iso_or_empty(item.date_added),
        notes=item.notes,
    )


def get_user_games(db: Session, username: str) -> list[GameRead]:
    """The user's library with play state pre-derived (spec §4.3, §6).

    Three queries total regardless of library size: profile, games, and all
    sessions for those games — grouped per game in Python.
    """
    profile = _require_profile(db, username)
    games = users_repo.list_games(db, profile.id)
    sessions_by_game: dict[int, list[PlaySession]] = defaultdict(list)
    for session in users_repo.list_play_sessions(db, [g.id for g in games]):
        sessions_by_game[session.game_id].append(session)
    return [_to_game_read(g, derive_play_state(sessions_by_game.get(g.id, []))) for g in games]


def get_user_wishlist(db: Session, username: str) -> list[WishlistGameRead]:
    profile = _require_profile(db, username)
    return [_to_wishlist_read(item) for item in users_repo.list_wishlist_items(db, profile.id)]


def get_user_profile(db: Session, username: str) -> ProfileRead:
    """Public profile payload — public data only, no per-viewer fields
    (spec §7.2: this response is cacheable and shared across viewers)."""
    profile = _require_profile(db, username)
    return ProfileRead(
        username=profile.username,
        display_name=profile.display_name,
        follower_count=users_repo.count_followers(db, profile.id),
        following_count=users_repo.count_following(db, profile.id),
    )
