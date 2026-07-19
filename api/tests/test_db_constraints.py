"""Integration tests against a real, migrated database.

Run only when DATABASE_URL is set (locally that's the Supabase CLI stack via
the repo-root .env; CI without a DB skips them). They verify the baseline
migration actually created the CHECK constraints — everything runs inside a
rolled-back transaction, so the database is left untouched.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings

requires_db = pytest.mark.skipif(
    not get_settings().database_url, reason="DATABASE_URL not set"
)

PROFILE_ID = uuid.uuid4()


@pytest.fixture
def conn():
    from app.core.db import get_engine

    with get_engine().connect() as connection:
        transaction = connection.begin()
        # Throwaway profile to hang test rows off; random username to avoid
        # colliding with seeded data.
        connection.execute(
            text(
                "INSERT INTO profiles (id, username, display_name) "
                "VALUES (:id, :username, 'Constraint Test')"
            ),
            {"id": PROFILE_ID, "username": f"test{uuid.uuid4().hex[:20]}"},
        )
        yield connection
        transaction.rollback()


@requires_db
def test_bad_rating_rejected(conn):
    with pytest.raises(IntegrityError, match="ck_games_rating"), conn.begin_nested():
        conn.execute(
            text(
                "INSERT INTO games (user_id, name, system, rating) "
                "VALUES (:uid, 'Test Game', 'Test System', 'Amazing')"
            ),
            {"uid": PROFILE_ID},
        )


@requires_db
def test_null_rating_accepted(conn):
    # NULL means unrated and must pass the CHECK.
    with conn.begin_nested():
        conn.execute(
            text(
                "INSERT INTO games (user_id, name, system, rating) "
                "VALUES (:uid, 'Test Game', 'Test System', NULL)"
            ),
            {"uid": PROFILE_ID},
        )


@requires_db
def test_self_follow_rejected(conn):
    with pytest.raises(IntegrityError, match="ck_follows_no_self_follow"), conn.begin_nested():
        conn.execute(
            text("INSERT INTO follows (follower_id, followee_id) VALUES (:uid, :uid)"),
            {"uid": PROFILE_ID},
        )
