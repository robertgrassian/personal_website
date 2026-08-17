"""Fill game_metadata.platforms from IGDB.

The catalog migration seeded that column from played_games.system, which is
"the one console someone recorded" rather than "every platform this game
released on" -- so a library game got exactly one entry and a wishlist-only
game got none. This replaces the stand-in with IGDB's real list.

Unlike the igdb_id backfill that preceded it, this is re-runnable and needs no
saved state: game_metadata.igdb_id is populated now, so the ids are in the
database and IGDB is asked directly. Re-run it whenever new games have been
added and their platforms matter.

WHAT IT STORES, AND WHY THAT IS A DECISION: IGDB's own platform names, verbatim
("Nintendo Entertainment System"), not the shelf's labels ("NES"). The column
is a fact about the game on a row every user shares, so normalizing it to one
person's vocabulary would bake that vocabulary into everyone's data with no
per-user fallback. Callers that need shelf labels should map at read time --
_build_platform_aliases in app/services/igdb.py already does that direction,
turning IGDB names into normalized aliases.

Private catalog rows (igdb_id IS NULL, hand-entered games) are left alone.
There is no canonical platform list for a game IGDB has never heard of, so
"every row has platforms" is not a reachable or desirable end state.

Usage, from api/. Credentials come from the repo-root .env; --database-url
points the run at a database other than that one, and every run prints which:

    uv run python scripts/backfill_platforms.py            # preview, local
    uv run python scripts/backfill_platforms.py --apply
    uv run python scripts/backfill_platforms.py --database-url "$PROD_URL" --apply

Preview is the default and prints every row it would change, so a production
run is always a select before an update.

It also SKIPS any game recorded on a console IGDB does not list for it, and says
which. IGDB's list contradicting something known to be true means the row's
igdb_id landed on a variant rather than the base game -- "Dead Cells" resolving
to IGDB's "Dead Cells+" (Apple Arcade, iOS only) is the clearest case. Writing
that list would remove the console its owner actually plays it on, which is
worse than the incomplete value already there. Fix the igdb_id and re-run.
"""

import argparse
import sys
from pathlib import Path

import sqlalchemy as sa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.models import GameMetadata
from app.services.igdb import _IGDB_GAMES_URL, _run_query
from scripts.db_target import add_database_url_arg, apply_database_url

# IGDB caps a response at 500 rows; chunk so this keeps working on a library
# larger than one person's.
CHUNK = 400


def fetch_platforms(db, igdb_ids: list[int]) -> dict[int, list[str]]:
    """IGDB game id -> every platform it released on, in IGDB's own names."""
    settings = get_settings()
    out: dict[int, list[str]] = {}
    for start in range(0, len(igdb_ids), CHUNK):
        chunk = igdb_ids[start : start + CHUNK]
        ids = ",".join(str(i) for i in chunk)
        body = f"fields platforms.name; where id = ({ids}); limit {len(chunk)};"
        for row in _run_query(db, settings, body, _IGDB_GAMES_URL):
            names = sorted(p["name"] for p in row.get("platforms", []) if p.get("name"))
            if names:
                out[row["id"]] = names
    return out


def recorded_systems(db, metadata_ids: list[int]) -> dict[int, set[str]]:
    """metadata id -> the systems users actually recorded for that game.

    Only used to flag disagreements in the preview. One query for the whole
    catalog rather than one per row.
    """
    if not metadata_ids:
        return {}
    rows = db.execute(
        sa.text("""
        SELECT metadata_id, system FROM played_games WHERE metadata_id = ANY(:ids)
        UNION
        SELECT metadata_id, system FROM wishlist_games WHERE metadata_id = ANY(:ids)
        """),
        {"ids": metadata_ids},
    )
    out: dict[int, set[str]] = {}
    for metadata_id, system in rows:
        if system:
            out.setdefault(metadata_id, set()).add(system)
    return out


def run(apply_changes: bool) -> None:
    with get_sessionmaker()() as session:
        rows = list(
            session.execute(
                sa.select(GameMetadata).where(GameMetadata.igdb_id.is_not(None))
            ).scalars()
        )
        private = session.execute(
            sa.select(sa.func.count())
            .select_from(GameMetadata)
            .where(GameMetadata.igdb_id.is_(None))
        ).scalar_one()
        if not rows:
            print("No catalog rows carry an igdb_id; nothing to look up.")
            return

        fetched = fetch_platforms(session, sorted(r.igdb_id for r in rows))
        recorded = recorded_systems(session, [r.id for r in rows])

        changes, unlisted, unknown = [], [], []
        for row in rows:
            igdb_platforms = fetched.get(row.igdb_id)
            if igdb_platforms is None:
                unknown.append(row)
                continue
            missing = recorded.get(row.id, set()) - set(igdb_platforms)
            if missing:
                # Somebody owns this game on a console IGDB does not list for
                # it, so IGDB's list contradicts something known to be true and
                # writing it would REMOVE the console they actually play it on.
                # Almost always the row's igdb_id landed on a variant rather
                # than the base game -- "Dead Cells" resolving to IGDB's "Dead
                # Cells+" (Apple Arcade, iOS only) is the clearest case.
                #
                # Skipping leaves the seeded value, which is incomplete but not
                # wrong. Writing would leave a list that excludes the truth, and
                # this column exists to answer "which consoles are valid for
                # this game?" -- an answer that omits the owner's console is
                # worse than a short one. Fix the igdb_id, then re-run.
                unlisted.append((row, sorted(missing)))
                continue
            if igdb_platforms != list(row.platforms):
                changes.append((row, igdb_platforms))

        print(f"{len(rows)} catalog rows with an igdb_id; {len(changes)} would change.\n")
        for row, platforms in sorted(changes, key=lambda c: c[0].name.lower()):
            before = ", ".join(row.platforms) or "-"
            print(f"  {row.name}")
            print(f"      {before}")
            print(f"   -> {', '.join(platforms)}")

        if unlisted:
            print(f"\n{len(unlisted)} games SKIPPED: recorded on a system IGDB does not list.")
            print("Their igdb_id most likely points at a variant rather than the base game.")
            print("Left as-is rather than overwritten with a list missing the owner's console:")
            for row, missing in sorted(unlisted, key=lambda u: u[0].name.lower()):
                print(f"  {row.name}: {', '.join(missing)}")

        if unknown:
            print(f"\n{len(unknown)} rows IGDB returned no platforms for (left unchanged):")
            for row in unknown:
                print(f"  {row.name} (igdb {row.igdb_id})")

        if private:
            print(f"\n{private} private rows have no igdb_id and are left alone, by design.")

        if not apply_changes:
            print("\nPreview only. Re-run with --apply to write.")
            return
        if not changes:
            print("\nNothing to apply.")
            return

        for row, platforms in changes:
            row.platforms = platforms
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
