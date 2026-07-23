"""Queries backing the authenticated /me endpoints. SQLAlchemy only — no
business rules, no HTTP (same layering as repositories/users.py).
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Game, PlaySession, Profile


def get_profile_by_id(db: Session, user_id: uuid.UUID) -> Profile | None:
    return db.get(Profile, user_id)


def get_game_for_owner(db: Session, game_id: int, user_id: uuid.UUID) -> Game | None:
    # Ownership lives in the WHERE clause: someone else's game id comes back
    # None, indistinguishable from a nonexistent one — both surface as 404.
    return db.execute(
        select(Game).where(Game.id == game_id, Game.user_id == user_id)
    ).scalar_one_or_none()


def find_game_by_name_and_system(
    db: Session, user_id: uuid.UUID, name: str, system: str
) -> Game | None:
    # Backs the friendly duplicate check before an insert. Exact match, same
    # as the uq_games_user_id_name_system constraint that backstops it.
    return db.execute(
        select(Game).where(Game.user_id == user_id, Game.name == name, Game.system == system)
    ).scalar_one_or_none()


def create_game(
    db: Session,
    *,
    user_id: uuid.UUID,
    name: str,
    system: str,
    genres: list[str],
    release_date: date | None,
    image_url: str | None,
    igdb_id: int | None,
    rating: str | None,
) -> Game:
    game = Game(
        user_id=user_id,
        name=name,
        system=system,
        genres=genres,
        release_date=release_date,
        image_url=image_url,
        igdb_id=igdb_id,
        rating=rating,
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    return game


def delete_game(db: Session, game: Game) -> None:
    # ON DELETE CASCADE takes the play sessions with it; the UI confirms with
    # the session count first.
    db.delete(game)
    db.commit()


def update_game_rating(db: Session, game: Game, rating: str | None) -> Game:
    game.rating = rating
    db.commit()
    db.refresh(game)
    return game


def get_open_session_for_game(db: Session, game_id: int) -> PlaySession | None:
    # Callers establish ownership of the game first; this only asks "is it
    # already being played?". At most one open session per game is enforced at
    # the service layer, so scalar_one_or_none is safe in practice — but take
    # the newest open one defensively if legacy data ever holds several.
    return db.execute(
        select(PlaySession)
        .where(PlaySession.game_id == game_id, PlaySession.end_date.is_(None))
        .order_by(PlaySession.start_date.desc(), PlaySession.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def create_session(
    db: Session, game_id: int, start_date: date, end_date: date | None
) -> PlaySession:
    play_session = PlaySession(game_id=game_id, start_date=start_date, end_date=end_date)
    db.add(play_session)
    db.commit()
    db.refresh(play_session)
    return play_session


def get_session_for_owner(db: Session, session_id: int, user_id: uuid.UUID) -> PlaySession | None:
    # Ownership hops through the game row (sessions have no user_id column):
    # a foreign or nonexistent session comes back None → 404, same policy as
    # get_game_for_owner.
    return db.execute(
        select(PlaySession)
        .join(Game, Game.id == PlaySession.game_id)
        .where(PlaySession.id == session_id, Game.user_id == user_id)
    ).scalar_one_or_none()


def finish_session(
    db: Session,
    play_session: PlaySession,
    end_date: date,
    *,
    rated_game: Game | None = None,
    rating: str | None = None,
) -> None:
    # Single commit on purpose: when a rate-on-stop passes rated_game, the
    # close and the rating land atomically — never one without the other.
    play_session.end_date = end_date
    if rated_game is not None:
        rated_game.rating = rating
    db.commit()


def username_exists(db: Session, username: str) -> bool:
    # citext equality: case-insensitive, matching the unique index.
    return (
        db.execute(select(Profile.id).where(Profile.username == username)).scalar_one_or_none()
        is not None
    )


def count_profiles(db: Session) -> int:
    return db.execute(select(func.count()).select_from(Profile)).scalar_one()


def create_profile(db: Session, *, user_id: uuid.UUID, username: str, display_name: str) -> Profile:
    profile = Profile(id=user_id, username=username, display_name=display_name)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
