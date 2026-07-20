"""Seed the database from the repo-root CSVs (spec §8, Phase 1).

Run from api/:  uv run python scripts/seed.py

Idempotent truncate-and-reload: every run wipes the five tables and reinserts
everything, so it can rerun freely during development. All rows belong to a
Robert profile with a fixed UUID, backed by a real local auth.users row this
script also creates (required by the profiles → auth.users FK, migration
f985740c0df9) — so local magic-link login as ROBERT_EMAIL signs you in as the
owner of the seeded library. Auth users created by other local signups are
left alone, but their profiles ARE truncated: after a reseed those accounts
are back in the "authenticated but no profile" onboarding state.

Validation ports the rules from src/lib/gamesServer.ts: warn-don't-drop for
fixable problems (unknown rating, missing system), skip only nameless rows.
The one hard failure is session-name resolution — sessions.csv references
games by name, and a name matching zero or several games aborts the run
(nonzero exit) rather than guessing; fix the CSV and rerun.
"""

import csv
import sys
import uuid
from collections.abc import Iterable
from datetime import date
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

# Make the app package importable when run as `python scripts/seed.py`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.models import Game, PlaySession, Profile, WishlistItem

REPO_ROOT = Path(__file__).resolve().parents[2]

# Fixed (not random) so reruns and other tooling can reference it. The same
# UUID is used for the auth.users row, keeping profile id == auth id exactly
# as real signups will.
ROBERT_PROFILE_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
ROBERT_USERNAME = "robert"
ROBERT_DISPLAY_NAME = "Robert"
# Log in locally as this address (magic link lands in Mailpit, :54324) to act
# as Robert. Local-only — the guard in main() keeps this off prod, where
# Robert signs up through real OAuth (Phase 2b).
ROBERT_EMAIL = "robert@example.com"

# Mirrors RATINGS in src/lib/games.ts; the DB CHECK backstops it.
VALID_RATINGS = frozenset({"Perfect", "Great", "Good", "Okay", "Bad"})

TABLES = ["profiles", "games", "play_sessions", "wishlist_items", "follows"]


# --- pure parsing/validation (unit-tested in tests/test_seed_parsing.py) ---


def split_genres(raw: str) -> list[str]:
    """'Metroidvania|Puzzle' -> ['Metroidvania', 'Puzzle']; blanks dropped."""
    return [g.strip() for g in raw.split("|") if g.strip()]


def parse_date_field(raw: str, context: str, problems: list[str]) -> date | None:
    """ISO date, or None for blank. A malformed value appends to `problems`
    and returns None, so every CSV problem surfaces through the same
    warnings/errors report instead of crashing mid-parse."""
    raw = raw.strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        problems.append(f'{context} is not an ISO date: "{raw}"')
        return None


def parse_game_rows(rows: Iterable[dict], warnings: list[str]) -> list[dict]:
    """games.csv rows -> games column dicts (sans user_id).

    Same rules as gamesServer.ts parseRow: no name -> skip with warning;
    missing system -> warn but keep; unknown rating -> warn and store NULL.
    """
    out = []
    for i, row in enumerate(rows, start=2):  # start=2: 1-indexed + header
        name = (row.get("name") or "").strip()
        if not name:
            warnings.append(f"[games.csv] Row {i}: skipping row with no game name")
            continue

        system = (row.get("system") or "").strip()
        if not system:
            warnings.append(f'[games.csv] Row {i}: "{name}" has no system')

        rating: str | None = (row.get("rating") or "").strip() or None
        if rating is not None and rating not in VALID_RATINGS:
            warnings.append(
                f'[games.csv] Row {i}: "{name}" has unrecognized rating '
                f'"{rating}" — treating as unrated'
            )
            rating = None

        out.append(
            {
                "name": name,
                "system": system,
                "rating": rating,
                "genres": split_genres(row.get("genre") or ""),
                "release_date": parse_date_field(
                    row.get("release_date") or "",
                    f'[games.csv] Row {i}: "{name}" release_date',
                    warnings,
                ),
                "image_url": (row.get("image_url") or "").strip() or None,
            }
        )
    return out


def resolve_session_rows(
    rows: Iterable[dict], name_to_game_ids: dict[str, list[int]]
) -> tuple[list[dict], list[str]]:
    """sessions.csv rows -> play_sessions column dicts via the name→id bridge.

    Returns (resolved rows, errors). Any error means the run must abort:
    a session naming zero or multiple games, or carrying an unparseable or
    missing start date, cannot be loaded safely. All of a row's problems are
    collected before it is skipped, so one run reports everything.
    """
    resolved, errors = [], []
    for i, row in enumerate(rows, start=2):
        name = (row.get("game") or "").strip()
        errors_before = len(errors)

        ids = name_to_game_ids.get(name, [])
        if len(ids) != 1:
            problem = "matches no game" if not ids else f"is ambiguous ({len(ids)} games)"
            errors.append(f'[sessions.csv] Row {i}: "{name}" {problem} in the library')

        row_ctx = f'[sessions.csv] Row {i}: "{name}"'
        start_date = parse_date_field(row.get("start_date") or "", f"{row_ctx} start_date", errors)
        if start_date is None and not (row.get("start_date") or "").strip():
            errors.append(f"{row_ctx} has no start_date")
        # Empty end_date = open session = currently playing.
        end_date = parse_date_field(row.get("end_date") or "", f"{row_ctx} end_date", errors)

        if len(errors) > errors_before:
            continue
        resolved.append({"game_id": ids[0], "start_date": start_date, "end_date": end_date})
    return resolved, errors


def parse_wishlist_rows(rows: Iterable[dict], warnings: list[str]) -> list[dict]:
    """wishlist.csv rows -> wishlist_items column dicts (sans user_id)."""
    out = []
    for i, row in enumerate(rows, start=2):
        name = (row.get("name") or "").strip()
        if not name:
            warnings.append(f"[wishlist.csv] Row {i}: skipping row with no game name")
            continue
        out.append(
            {
                "name": name,
                "system": (row.get("system") or "").strip() or None,
                "genres": split_genres(row.get("genre") or ""),
                "release_date": parse_date_field(
                    row.get("release_date") or "",
                    f'[wishlist.csv] Row {i}: "{name}" release_date',
                    warnings,
                ),
                "image_url": (row.get("image_url") or "").strip() or None,
                # Exactly the literal "true" counts — mirroring wishlistServer.ts
                # (=== "true", case-sensitive) so the two parse paths agree for
                # the Phase 3 parity comparison.
                "starred": (row.get("starred") or "").strip() == "true",
                "date_added": parse_date_field(
                    row.get("date_added") or "",
                    f'[wishlist.csv] Row {i}: "{name}" date_added',
                    warnings,
                )
                or date.today(),
                "notes": (row.get("notes") or "").strip(),
            }
        )
    return out


# --- IO ---


def read_csv(filename: str) -> list[dict]:
    with (REPO_ROOT / filename).open(newline="") as f:
        return list(csv.DictReader(f))


def ensure_robert_auth_user(session: Session) -> None:
    """Insert the auth.users + auth.identities rows GoTrue needs to treat
    Robert as a real, confirmed, magic-link-loginable email user.

    Direct SQL into GoTrue's tables is a local-dev-only pattern (the Admin
    API can't create a user with a chosen UUID, and we need id ==
    ROBERT_PROFILE_ID for the FK). Column choices that matter:
    - encrypted_password '': no hash ever matches, so password login is
      impossible — magic link (OTP) is the only way in, matching config.toml.
    - token columns '' not NULL: GoTrue's Go code scans them as strings and
      errors on NULL.
    - ON CONFLICT DO NOTHING: reruns and already-signed-up state are no-ops.
    """
    session.execute(
        text(
            """
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, created_at, updated_at,
                raw_app_meta_data, raw_user_meta_data,
                confirmation_token, recovery_token,
                email_change_token_new, email_change
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', :id,
                'authenticated', 'authenticated', :email, '',
                now(), now(), now(),
                '{"provider": "email", "providers": ["email"]}', '{}',
                '', '', '', ''
            )
            ON CONFLICT DO NOTHING
            """
        ),
        {"id": ROBERT_PROFILE_ID, "email": ROBERT_EMAIL},
    )
    session.execute(
        text(
            """
            INSERT INTO auth.identities (
                provider_id, user_id, identity_data, provider,
                last_sign_in_at, created_at, updated_at
            ) VALUES (
                :id_text, :id,
                jsonb_build_object(
                    'sub', :id_text ::text, 'email', :email ::text,
                    'email_verified', true, 'phone_verified', false
                ),
                'email', now(), now(), now()
            )
            ON CONFLICT DO NOTHING
            """
        ),
        {"id": ROBERT_PROFILE_ID, "id_text": str(ROBERT_PROFILE_ID), "email": ROBERT_EMAIL},
    )


def seed(session: Session) -> dict[str, int]:
    warnings: list[str] = []

    game_rows = parse_game_rows(read_csv("games.csv"), warnings)
    wishlist_rows = parse_wishlist_rows(read_csv("wishlist.csv"), warnings)

    # Truncate-and-reload keeps the script idempotent; RESTART IDENTITY so
    # game ids don't grow across reruns, CASCADE for the FK chains.
    session.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))

    # Must exist before the profile insert: profiles.id → auth.users(id).
    ensure_robert_auth_user(session)

    session.add(
        Profile(id=ROBERT_PROFILE_ID, username=ROBERT_USERNAME, display_name=ROBERT_DISPLAY_NAME)
    )
    # Flush the profile before the games: the models declare no ORM
    # relationship() (FKs only), so the unit of work won't order the
    # inserts across tables on its own.
    session.flush()

    games = [Game(user_id=ROBERT_PROFILE_ID, **row) for row in game_rows]
    session.add_all(games)
    session.flush()  # assigns game ids for the name→id bridge

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
    session.add_all(WishlistItem(user_id=ROBERT_PROFILE_ID, **row) for row in wishlist_rows)
    session.commit()

    for warning in warnings:
        print(warning)

    counts = {
        table: session.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
        for table in TABLES
    }
    print("Seeded:")
    for table, count in counts.items():
        print(f"  {table}: {count}")
    print(f"Warnings: {len(warnings)}")
    return counts


def main() -> None:
    # Environment guard: this script TRUNCATEs whatever DATABASE_URL points at.
    # .env will eventually hold the prod pooler URL during debugging sessions
    # (spec §7.6) — refusing outside dev makes "forgot to swap it back" a
    # loud error instead of a wiped production database.
    app_env = get_settings().app_env
    if app_env != "dev":
        print(
            f"Refusing to seed: APP_ENV is '{app_env}', not 'dev'. "
            "The seed truncates every table at DATABASE_URL — never prod.",
            file=sys.stderr,
        )
        sys.exit(1)
    with get_sessionmaker()() as session:
        seed(session)


if __name__ == "__main__":
    main()
