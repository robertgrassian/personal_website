"""One-time PRODUCTION bootstrap: claim Robert's founder profile and load his
library from the CSVs, parented to his REAL auth.users id.

How this differs from scripts/seed.py (which is dev-only):
- **Never truncates.** seed.py wipes every table; this only inserts, and only
  what's missing. Safe to run against prod, and safe to re-run.
- **No fake auth user.** seed.py forges a local auth.users row with a fixed
  UUID; here Robert must have already signed in via real OAuth (GitHub/Google),
  so his auth.users row — and his real id — already exist. You pass that id in.
- **Bypasses the reserved-username guard on purpose.** "robert" is in
  RESERVED_USERNAMES (services/me.py), so the normal onboarding flow refuses it.
  The founder handle is claimed here instead.

Usage (from api/, with the prod DB URL and Robert's real auth id in env):

    ROBERT_AUTH_ID=<uuid from Supabase Studio → Authentication → Users> \
    DATABASE_URL=<prod direct connection string> \
    uv run python scripts/bootstrap_robert.py

Idempotent: creating the profile is skipped if it already exists, and the
library load is skipped if Robert already has games. Re-running is a no-op that
just reports the current counts.
"""

import os
import sys
import uuid
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

# Make the app package importable when run as `python scripts/bootstrap_robert.py`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import get_sessionmaker
from app.models import Game, PlaySession, Profile, WishlistItem

# Reuse the seed's pure, unit-tested parsers so the two paths can't drift.
from scripts.seed import (
    ROBERT_DISPLAY_NAME,
    ROBERT_USERNAME,
    parse_game_rows,
    parse_wishlist_rows,
    read_csv,
    resolve_session_rows,
)


def _robert_auth_id() -> uuid.UUID:
    raw = os.environ.get("ROBERT_AUTH_ID", "").strip()
    if not raw:
        sys.exit(
            "ROBERT_AUTH_ID is not set. Robert must sign in via OAuth first, then "
            "copy his id from Supabase Studio → Authentication → Users and pass it:\n"
            "  ROBERT_AUTH_ID=<uuid> uv run python scripts/bootstrap_robert.py"
        )
    try:
        return uuid.UUID(raw)
    except ValueError:
        sys.exit(f"ROBERT_AUTH_ID is not a valid UUID: {raw!r}")


def _require_auth_user(session: Session, auth_id: uuid.UUID) -> None:
    exists = session.execute(
        text("SELECT 1 FROM auth.users WHERE id = :id"), {"id": auth_id}
    ).first()
    if not exists:
        sys.exit(
            f"No auth.users row for {auth_id}. Robert must complete an OAuth "
            "sign-in in production before this script can claim his profile."
        )


def _ensure_profile(session: Session, auth_id: uuid.UUID) -> None:
    existing = session.get(Profile, auth_id)
    if existing is not None:
        print(f"Profile already exists for {auth_id}: username={existing.username!r}")
        return
    # Guard against the founder handle having somehow been taken by another id
    # (shouldn't happen — it's reserved — but a wrong ROBERT_AUTH_ID would only
    # be caught here).
    clash = session.execute(
        text("SELECT id FROM profiles WHERE username = :u"), {"u": ROBERT_USERNAME}
    ).first()
    if clash is not None:
        sys.exit(
            f"Username {ROBERT_USERNAME!r} is already owned by {clash[0]}, not "
            f"{auth_id}. Check that ROBERT_AUTH_ID is Robert's real auth id."
        )
    session.add(
        Profile(id=auth_id, username=ROBERT_USERNAME, display_name=ROBERT_DISPLAY_NAME)
    )
    session.flush()
    print(f"Created profile {ROBERT_USERNAME!r} for {auth_id}")


def _load_library(session: Session, auth_id: uuid.UUID) -> None:
    already = session.execute(
        text("SELECT count(*) FROM games WHERE user_id = :id"), {"id": auth_id}
    ).scalar_one()
    if already:
        print(f"Library already loaded ({already} games) — skipping.")
        return

    warnings: list[str] = []
    game_rows = parse_game_rows(read_csv("games.csv"), warnings)
    wishlist_rows = parse_wishlist_rows(read_csv("wishlist.csv"), warnings)

    games = [Game(user_id=auth_id, **row) for row in game_rows]
    session.add_all(games)
    session.flush()  # assign ids for the name→id bridge

    name_to_game_ids: dict[str, list[int]] = {}
    for game in games:
        name_to_game_ids.setdefault(game.name, []).append(game.id)

    session_rows, errors = resolve_session_rows(read_csv("sessions.csv"), name_to_game_ids)
    if errors:
        print("Unresolvable sessions.csv rows — fix the CSV and rerun:", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        session.rollback()
        sys.exit(1)

    session.add_all(PlaySession(**row) for row in session_rows)
    session.add_all(WishlistItem(user_id=auth_id, **row) for row in wishlist_rows)

    for warning in warnings:
        print(warning)
    print(
        f"Loaded {len(games)} games, {len(session_rows)} sessions, "
        f"{len(wishlist_rows)} wishlist items."
    )


def main() -> None:
    auth_id = _robert_auth_id()
    with get_sessionmaker()() as session:
        _require_auth_user(session, auth_id)
        _ensure_profile(session, auth_id)
        _load_library(session, auth_id)
        session.commit()

        counts = {
            table: session.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
            for table in ("profiles", "games", "play_sessions", "wishlist_items")
        }
    print("Done. Table counts:")
    for table, count in counts.items():
        print(f"  {table}: {count}")


if __name__ == "__main__":
    main()
