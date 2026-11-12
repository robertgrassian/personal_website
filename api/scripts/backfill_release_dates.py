"""Fill game_metadata.platform_release_dates from IGDB.

The column landed empty on every existing row (migration a7c3e91d5b20), and an
empty map reads as the game's first release on any platform. The add path and
the catalog refresh fill it from then on; this catches up the rows that predate
it, all at once rather than two per page view.

Re-runnable: it asks IGDB for every shared row and writes only those whose map
differs. Private rows (igdb_id IS NULL) have no IGDB record and are left alone.

Usage, from api/. Credentials come from the repo-root .env; --database-url
points the run at a database other than that one, and every run prints which:

    uv run python scripts/backfill_release_dates.py            # preview, local
    uv run python scripts/backfill_release_dates.py --apply
    uv run python scripts/backfill_release_dates.py --database-url "$PROD_URL" --apply

The preview lists only the entries whose DISPLAYED date changes, i.e. someone's
recorded system releasing on a different day than the game first did.
"""

import argparse
import sys
from pathlib import Path

import sqlalchemy as sa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.models import GameMetadata
from app.services.igdb import (
    _IGDB_GAMES_URL,
    _RELEASE_DATE_FIELDS,
    _platform_release_dates,
    _run_query,
)
from app.services.users import release_date_for
from scripts.backfill_platforms import CHUNK, recorded_systems
from scripts.db_target import add_database_url_arg, apply_database_url


def fetch_release_dates(db, igdb_ids: list[int]) -> dict[int, dict[str, str | None]]:
    """IGDB game id -> platform name -> earliest release date on it."""
    settings = get_settings()
    out: dict[int, dict[str, str | None]] = {}
    for start in range(0, len(igdb_ids), CHUNK):
        chunk = igdb_ids[start : start + CHUNK]
        ids = ",".join(str(i) for i in chunk)
        body = f"fields {_RELEASE_DATE_FIELDS}; where id = ({ids}); limit {len(chunk)};"
        for row in _run_query(db, settings, body, _IGDB_GAMES_URL):
            dates = _platform_release_dates(row)
            if dates:
                out[row["id"]] = dates
    return out


def run(apply_changes: bool) -> None:
    with get_sessionmaker()() as session:
        rows = list(
            session.execute(
                sa.select(GameMetadata).where(GameMetadata.igdb_id.is_not(None))
            ).scalars()
        )
        if not rows:
            print("No catalog rows carry an igdb_id; nothing to look up.")
            return

        fetched = fetch_release_dates(session, sorted(r.igdb_id for r in rows))
        recorded = recorded_systems(session, [r.id for r in rows])

        changes = [
            (row, fetched[row.igdb_id])
            for row in rows
            if row.igdb_id in fetched and fetched[row.igdb_id] != row.platform_release_dates
        ]
        print(f"{len(rows)} catalog rows with an igdb_id; {len(changes)} would change.\n")

        # Computed against an unsaved copy so the preview shows exactly what
        # the read path will serve after --apply.
        for row, dates in sorted(changes, key=lambda c: c[0].name.lower()):
            after = GameMetadata(release_date=row.release_date, platform_release_dates=dates)
            for system in sorted(recorded.get(row.id, set())):
                before_iso = release_date_for(row, system) or "unknown"
                after_iso = release_date_for(after, system) or "unknown"
                if before_iso != after_iso:
                    print(f"  {row.name} ({system}): {before_iso} -> {after_iso}")

        missing = len(rows) - sum(1 for r in rows if r.igdb_id in fetched)
        if missing:
            print(f"\n{missing} rows IGDB listed no release dates for (left unchanged).")

        if not apply_changes:
            print("\nPreview only. Re-run with --apply to write.")
            return
        if not changes:
            print("\nNothing to apply.")
            return

        for row, dates in changes:
            row.platform_release_dates = dates
        session.commit()
        print(f"\nApplied. {len(changes)} rows updated.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write (default is preview)")
    add_database_url_arg(parser)
    args = parser.parse_args()
    print(f"Target: {apply_database_url(args.database_url)}\n")
    run(args.apply)


if __name__ == "__main__":
    main()
