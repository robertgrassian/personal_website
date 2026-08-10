"""Queries backing the authenticated /me endpoints. SQLAlchemy only — no
business rules, no HTTP (same layering as repositories/users.py).
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Follow, GameMetadata, PlayedGame, PlaySession, Profile, WishlistGame


def get_profile_by_id(db: Session, user_id: uuid.UUID) -> Profile | None:
    return db.get(Profile, user_id)


def profile_exists(db: Session, user_id: uuid.UUID) -> bool:
    """Whether a profile row is still there, read straight from the DB.

    Not ``get_profile_by_id(...) is not None``: that is ``db.get``, which
    answers from the session's identity map when the row has already been
    loaded. Account deletion asks this question precisely to find out whether
    something OUTSIDE this session (the ON DELETE CASCADE from auth.users)
    removed the row, so a cached answer is the wrong answer. A scalar count
    keeps the ORM out of it entirely.
    """
    count = db.execute(
        select(func.count()).select_from(Profile).where(Profile.id == user_id)
    ).scalar_one()
    return count > 0


def find_or_create_metadata(
    db: Session,
    *,
    user_id: uuid.UUID,
    igdb_id: int | None,
    name: str,
    genres: list[str],
    release_date: date | None,
    image_url: str | None,
    platforms: list[str] | None = None,
) -> GameMetadata:
    """The catalog row for a game, creating it if this is the first time anyone
    has added it.

    Two lookup keys, because there are two kinds of row (see models/game_metadata):
    a game with an igdb_id resolves to the one SHARED row for that IGDB id, no
    matter who is adding it; a hand-entered game resolves only among the caller's
    own PRIVATE rows, since a typed name is not a canonical key.

    Flushes rather than commits: the caller inserts the link row next, and the
    two must land together or a failed add would leave an orphan catalog row.
    """
    if igdb_id is not None:
        existing = db.execute(
            select(GameMetadata).where(GameMetadata.igdb_id == igdb_id)
        ).scalar_one_or_none()
    else:
        existing = db.execute(
            select(GameMetadata).where(
                GameMetadata.igdb_id.is_(None),
                GameMetadata.created_by_user_id == user_id,
                GameMetadata.name == name,
            )
        ).scalar_one_or_none()
    if existing is not None:
        return existing

    meta = GameMetadata(
        igdb_id=igdb_id,
        name=name,
        genres=genres,
        release_date=release_date,
        image_url=image_url,
        platforms=platforms or [],
        # Only private rows have an owner. Stamping a creator on a shared row
        # would make whoever happened to add it first look like its author.
        created_by_user_id=None if igdb_id is not None else user_id,
    )
    db.add(meta)
    # Assigns the id the link row's FK needs, without ending the transaction.
    db.flush()
    return meta


def get_game_for_owner(
    db: Session, game_id: int, user_id: uuid.UUID
) -> tuple[PlayedGame, GameMetadata] | None:
    # Ownership lives in the WHERE clause: someone else's game id comes back
    # None, indistinguishable from a nonexistent one — both surface as 404.
    #
    # The catalog row rides along because every caller needs it: to build the
    # response DTO, or to put the game's name in an error message.
    row = db.execute(
        select(PlayedGame, GameMetadata)
        .join(GameMetadata, GameMetadata.id == PlayedGame.metadata_id)
        .where(PlayedGame.id == game_id, PlayedGame.user_id == user_id)
    ).one_or_none()
    return None if row is None else (row[0], row[1])


def find_game_by_metadata(db: Session, user_id: uuid.UUID, metadata_id: int) -> PlayedGame | None:
    # Backs the friendly duplicate check before an insert, matching the
    # uq_played_games_user_id_metadata_id constraint that backstops it. Note
    # this is now "do I have this game?" rather than the old "do I have this
    # game on this console?" — one entry per game per user.
    return db.execute(
        select(PlayedGame).where(
            PlayedGame.user_id == user_id, PlayedGame.metadata_id == metadata_id
        )
    ).scalar_one_or_none()


def create_game(
    db: Session,
    *,
    user_id: uuid.UUID,
    metadata_id: int,
    system: str,
    rating: str | None,
) -> PlayedGame:
    game = PlayedGame(
        user_id=user_id,
        metadata_id=metadata_id,
        system=system,
        rating=rating,
    )
    db.add(game)
    # Commits any catalog row flushed earlier in this transaction along with it.
    db.commit()
    db.refresh(game)
    return game


def delete_game(db: Session, game: PlayedGame) -> None:
    # ON DELETE CASCADE takes the play sessions with it; the UI confirms with
    # the session count first. The catalog row is left alone — other users may
    # hold the same game, and a private row costs nothing to keep.
    db.delete(game)
    db.commit()


def update_game_rating(db: Session, game: PlayedGame, rating: str | None) -> PlayedGame:
    game.rating = rating
    db.commit()
    # No refresh: the sessionmaker sets expire_on_commit=False, so the row stays
    # readable after the commit, and an UPDATE of one column we already know the
    # value of has nothing to read back (no trigger, no server default). Under
    # NullPool the commit releases the connection, so a refresh here would cost
    # a fresh connect and TLS handshake on top of the round trip — on the most
    # common write in the app. The refreshes after INSERTs stay: those rows have
    # server-generated columns.
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


def get_session_for_owner(
    db: Session, session_id: int, user_id: uuid.UUID
) -> tuple[PlaySession, PlayedGame, GameMetadata] | None:
    # Ownership hops through the game row (sessions have no user_id column):
    # a foreign or nonexistent session comes back None → 404, same policy as
    # get_game_for_owner.
    #
    # Returns the game and its catalog row as well as the session. The join is
    # required for the ownership check either way, so the database is already
    # reading those rows — selecting them costs nothing and saves the caller a
    # second lookup by id for the row it just proved ownership through.
    row = db.execute(
        select(PlaySession, PlayedGame, GameMetadata)
        .join(PlayedGame, PlayedGame.id == PlaySession.game_id)
        .join(GameMetadata, GameMetadata.id == PlayedGame.metadata_id)
        .where(PlaySession.id == session_id, PlayedGame.user_id == user_id)
    ).one_or_none()
    if row is None:
        return None
    return row[0], row[1], row[2]


def finish_session(
    db: Session,
    play_session: PlaySession,
    end_date: date,
    *,
    rated_game: PlayedGame | None = None,
    rating: str | None = None,
) -> None:
    # Single commit on purpose: when a rate-on-stop passes rated_game, the
    # close and the rating land atomically — never one without the other.
    play_session.end_date = end_date
    if rated_game is not None:
        rated_game.rating = rating
    db.commit()


def find_wishlist_item_by_metadata(
    db: Session, user_id: uuid.UUID, metadata_id: int
) -> WishlistGame | None:
    # One wishlist entry per game per user, matching
    # uq_wishlist_games_user_id_metadata_id.
    return db.execute(
        select(WishlistGame).where(
            WishlistGame.user_id == user_id, WishlistGame.metadata_id == metadata_id
        )
    ).scalar_one_or_none()


def get_wishlist_item_for_owner(
    db: Session, item_id: int, user_id: uuid.UUID
) -> tuple[WishlistGame, GameMetadata] | None:
    # Ownership in the WHERE clause: foreign == nonexistent == None → 404.
    row = db.execute(
        select(WishlistGame, GameMetadata)
        .join(GameMetadata, GameMetadata.id == WishlistGame.metadata_id)
        .where(WishlistGame.id == item_id, WishlistGame.user_id == user_id)
    ).one_or_none()
    return None if row is None else (row[0], row[1])


def create_wishlist_item(
    db: Session,
    *,
    user_id: uuid.UUID,
    metadata_id: int,
    system: str | None,
    starred: bool,
    notes: str,
    date_added: date,
) -> WishlistGame:
    item = WishlistGame(
        user_id=user_id,
        metadata_id=metadata_id,
        system=system,
        starred=starred,
        notes=notes,
        date_added=date_added,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_wishlist_item(db: Session, item: WishlistGame) -> WishlistGame:
    # The service mutates the ORM row's fields directly; this just commits.
    # No refresh, for the same reason as update_game_rating above.
    db.commit()
    return item


def delete_wishlist_item(db: Session, item: WishlistGame) -> None:
    db.delete(item)
    db.commit()


def promote_wishlist_item(db: Session, item: WishlistGame, *, system: str) -> PlayedGame:
    # Single commit on purpose (like finish_session): the game insert and the
    # wishlist delete land together — a promote can never duplicate the entry
    # into both lists or drop it from both.
    #
    # The catalog row carries straight across, so a promote is now lossless:
    # before normalization this rebuilt the game from the wishlist row's own
    # copy of the metadata, and anything the copy lacked stayed lacking.
    game = PlayedGame(
        user_id=item.user_id,
        metadata_id=item.metadata_id,
        system=system,
        rating=None,
    )
    db.add(game)
    db.delete(item)
    db.commit()
    db.refresh(game)
    return game


def username_exists(db: Session, username: str) -> bool:
    # citext equality: case-insensitive, matching the unique index.
    return (
        db.execute(select(Profile.id).where(Profile.username == username)).scalar_one_or_none()
        is not None
    )


def count_profiles(db: Session) -> int:
    return db.execute(select(func.count()).select_from(Profile)).scalar_one()


def count_games(db: Session, user_id: uuid.UUID) -> int:
    return db.execute(
        select(func.count()).select_from(PlayedGame).where(PlayedGame.user_id == user_id)
    ).scalar_one()


def create_profile_with_follows(
    db: Session,
    *,
    user_id: uuid.UUID,
    username: str,
    display_name: str,
    founder_id: uuid.UUID | None,
) -> Profile:
    """Create the profile and, when a founder is configured, the two follow
    edges between it and the new account — in a single transaction.

    One commit for all three rows is the point: a partial success would leave a
    profile whose follow state depends on which insert failed, and signup has
    no retry path to repair it. ``founder_id`` of None (unconfigured) or equal
    to ``user_id`` (the founder onboarding their own account, which the
    no_self_follow constraint would reject) creates the profile alone.
    """
    profile = Profile(id=user_id, username=username, display_name=display_name)
    db.add(profile)
    if founder_id is not None and founder_id != user_id:
        # flush() before adding the edges, not for its own sake but for
        # ordering: Follow declares no ORM relationship to Profile, so the unit
        # of work has no mapper dependency between them and is free to emit the
        # follows INSERT first — which violates the follower_id foreign key.
        # Flushing pins the profile row down first. Still one transaction, so
        # the commit below remains all-or-nothing.
        db.flush()
        db.add(Follow(follower_id=user_id, followee_id=founder_id))
        db.add(Follow(follower_id=founder_id, followee_id=user_id))
    db.commit()
    db.refresh(profile)
    return profile
