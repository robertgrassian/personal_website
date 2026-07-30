"""Create the founder follow edges for users who signed up before auto-follow.

Run from api/:  uv run python scripts/backfill_founder_follows.py

Auto-follow (services/me.py) only runs at profile creation, so every account
that onboarded before it shipped has no edges. This inserts the same pair of
edges those signups would have created: each existing user follows the founder
and the founder follows them back.

Safe to rerun: every insert is ON CONFLICT DO NOTHING against the follows
composite PK, so an account that already has an edge keeps exactly the one it
has. That also means this will NOT resurrect an edge somebody deliberately
unfollowed after a previous run — reinstating those would be worse than
leaving them alone, so a rerun is not a way to re-follow everyone.

Unlike seed.py this touches production by design (that is where the
pre-auto-follow accounts are), so it truncates nothing and has no APP_ENV
guard. It reads FOUNDER_PROFILE_ID and refuses to run without it.
"""

import sys
import uuid
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

# Make the app package importable when run as `python scripts/...`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.db import get_sessionmaker

# Both directions in one statement per user: the SELECT supplies the other
# party's id, so the founder's own row is excluded by the WHERE (which also
# keeps the no_self_follow check constraint satisfied).
_INSERT_EDGES = text(
    """
    INSERT INTO follows (follower_id, followee_id)
    SELECT p.id, :founder_id FROM profiles p WHERE p.id <> :founder_id
    UNION ALL
    SELECT :founder_id, p.id FROM profiles p WHERE p.id <> :founder_id
    ON CONFLICT DO NOTHING
    """
)


def backfill(db: Session, founder_id: uuid.UUID) -> int:
    """Insert the missing edges; returns how many rows were actually created."""
    if db.execute(
        text("SELECT 1 FROM profiles WHERE id = :id"), {"id": founder_id}
    ).scalar_one_or_none() is None:
        print(f"No profile with id {founder_id} — check FOUNDER_PROFILE_ID.", file=sys.stderr)
        sys.exit(1)

    others = db.execute(
        text("SELECT count(*) FROM profiles WHERE id <> :id"), {"id": founder_id}
    ).scalar_one()
    result = db.execute(_INSERT_EDGES, {"founder_id": founder_id})
    db.commit()
    created = result.rowcount
    print(f"{others} other profile(s); created {created} edge(s) (skipped {others * 2 - created}).")
    return created


def main() -> None:
    founder_id = get_settings().founder_profile_id
    if founder_id is None:
        print("FOUNDER_PROFILE_ID is not set — nothing to backfill against.", file=sys.stderr)
        sys.exit(1)
    with get_sessionmaker()() as session:
        backfill(session, founder_id)


if __name__ == "__main__":
    main()
