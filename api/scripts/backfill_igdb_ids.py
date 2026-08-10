"""One-off: fill in igdb_id on every game and wishlist row that lacks one.

THROWAWAY. Delete this file once it has been run against production. It is not
meant to be maintained, re-run, or generalized.

Why it exists: the shared game_metadata catalog keys shared rows on igdb_id, and
igdb_id is NULL on nearly every row today. Nothing ever backfilled it -- it is
written only by the UI's IGDB search flow, which arrived long after the original
155 games were imported. Without this, the catalog extraction would group nothing
and every user would still get a private copy of every game.

How it matches, and why not by name: the stored image_url already contains an
exact IGDB key. Covers are hotlinked as

    https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg

where {image_id} is IGDB's own cover image_id (see _upgrade_cover_url in
app/services/igdb.py, which builds exactly that shape). IGDB's /covers endpoint
maps image_id -> game id with no fuzziness at all. Name search was the obvious
approach and is the wrong one: it is fuzzy in both directions and mis-resolves
editions and spin-offs, which is the whole reason backfill_titles.py ended up as
a hand-read list.

Rows with no cover art get no id and stay NULL, which is a correct outcome --
they become private catalog rows owned by their creator. HAND_MATCHED below is
the escape hatch for any that are worth fixing anyway.

Usage (from api/, with DATABASE_URL and the Twitch credentials set):

    uv run python scripts/backfill_igdb_ids.py --user rgrassian            # preview
    uv run python scripts/backfill_igdb_ids.py --user rgrassian --apply

Preview is the default and prints every row it would touch alongside IGDB's own
name for the resolved id, so a production run is always a select before an
update. Read that column: a stored name that disagrees with IGDB's is the only
way a bad row shows itself.

--apply also writes scripts/.igdb_platforms.json: IGDB's real platform list per
game, captured while the network call is already being made. Nothing reads it
yet -- game_metadata.platforms is seeded from the consoles people recorded --
but it is the input for filling that column in properly later.

Raw SQL rather than the ORM, deliberately: this runs BEFORE the catalog
migration, against `games` and `wishlist_items`, and the models in app/models
describe the tables that exist AFTER it. There is no version of the ORM that
can address both, and a throwaway is the wrong place to keep one.
"""

import argparse
import json
import re
import sys
from pathlib import Path

import sqlalchemy as sa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.services.igdb import _IGDB_GAMES_URL, _run_query

_IGDB_COVERS_URL = "https://api.igdb.com/v4/covers"

PLATFORMS_PATH = Path(__file__).parent / ".igdb_platforms.json"

# IGDB caps a single Apicalypse response at 500 rows, and the whole library is
# well under that -- but chunk anyway so this doesn't silently truncate if it is
# ever pointed at a bigger database.
CHUNK = 400

# Stored name -> IGDB game id, for rows with no cover art to key on. Read by
# hand against IGDB; empty until the preview run says which rows need it.
HAND_MATCHED: dict[str, int] = {}

# Matches the image_id in a stored cover URL. IGDB image ids are lowercase
# alphanumeric; the size segment (t_cover_big) is deliberately not captured, so
# this keeps working if a row was stored at a different size.
_COVER_RE = re.compile(r"/upload/[^/]+/([a-z0-9]+)\.(?:jpg|png|webp)$")


def cover_image_id(image_url: str | None) -> str | None:
    """The IGDB cover image_id embedded in a stored cover URL, if any."""
    if not image_url:
        return None
    match = _COVER_RE.search(image_url)
    return match.group(1) if match else None


def _quoted_list(values: list[str]) -> str:
    return ",".join(f'"{v}"' for v in values)


def resolve_covers(db, image_ids: list[str]) -> dict[str, int]:
    """image_id -> IGDB game id, via the /covers endpoint.

    An exact lookup, not a search: every id here came out of a URL IGDB itself
    served, so anything unresolved means the cover was deleted upstream, not
    that the match was poor.
    """
    settings = get_settings()
    resolved: dict[str, int] = {}
    for start in range(0, len(image_ids), CHUNK):
        chunk = image_ids[start : start + CHUNK]
        body = (
            f"fields game, image_id; where image_id = ({_quoted_list(chunk)}); limit {len(chunk)};"
        )
        for row in _run_query(db, settings, body, _IGDB_COVERS_URL):
            # A cover with no game is meaningless but not worth crashing on.
            if "image_id" in row and "game" in row:
                resolved[row["image_id"]] = row["game"]
    return resolved


def fetch_games(db, game_ids: list[int]) -> dict[int, dict]:
    """IGDB game id -> {name, platforms}. Two jobs in one round trip: the name
    is the human check that the cover join landed on the right game, and the
    platform list is what game_metadata.platforms wants.
    """
    settings = get_settings()
    out: dict[int, dict] = {}
    for start in range(0, len(game_ids), CHUNK):
        chunk = game_ids[start : start + CHUNK]
        ids = ",".join(str(i) for i in chunk)
        body = f"fields name, platforms.name; where id = ({ids}); limit {len(chunk)};"
        for row in _run_query(db, settings, body, _IGDB_GAMES_URL):
            out[row["id"]] = {
                "name": row.get("name", ""),
                "platforms": [p["name"] for p in row.get("platforms", []) if p.get("name")],
            }
    return out


def run(username: str, apply_changes: bool) -> None:
    session_factory = get_sessionmaker()
    with session_factory() as session:
        user_id = session.execute(
            sa.text("SELECT id FROM profiles WHERE username = :u"), {"u": username}
        ).scalar_one_or_none()
        if user_id is None:
            print(f"No profile named {username!r}.")
            sys.exit(1)

        # (table, id, name, image_url) for every row still missing an igdb_id.
        rows = [
            (table, row_id, name, image_url)
            for table in ("games", "wishlist_items")
            for row_id, name, image_url in session.execute(
                sa.text(
                    f"SELECT id, name, image_url FROM {table} "
                    "WHERE user_id = :u AND igdb_id IS NULL ORDER BY name"
                ),
                {"u": user_id},
            )
        ]
        if not rows:
            print("Nothing to do: every row already has an igdb_id.")
            return

        # One network round trip per distinct cover across both tables -- the
        # same game on the wishlist and on the shelf shares one lookup.
        by_image_id: dict[str, list[tuple]] = {}
        coverless: list[tuple] = []
        for row in rows:
            image_id = cover_image_id(row[3])
            if image_id is None:
                coverless.append(row)
            else:
                by_image_id.setdefault(image_id, []).append(row)

        resolved = resolve_covers(session, sorted(by_image_id))
        details = fetch_games(session, sorted(set(resolved.values())))

        plan: list[tuple[tuple, int, str]] = []  # (row, igdb_id, igdb name)
        unresolved: list[tuple] = []
        for image_id, matching_rows in by_image_id.items():
            game_id = resolved.get(image_id)
            if game_id is None:
                unresolved.extend(matching_rows)
                continue
            igdb_name = details.get(game_id, {}).get("name", "")
            plan.extend((row, game_id, igdb_name) for row in matching_rows)

        for row in coverless:
            game_id = HAND_MATCHED.get(row[2])
            if game_id is None:
                unresolved.append(row)
            else:
                plan.append((row, game_id, details.get(game_id, {}).get("name", "(hand-matched)")))

        # Sorted so disagreeing names cluster at the top rather than hiding in
        # a 180-line list. That column is the entire point of the preview.
        plan.sort(key=lambda entry: (entry[0][2].lower() == entry[2].lower(), entry[0][2]))
        print(f"{len(plan)} rows resolved:\n")
        print(f"  {'stored name':<45} {'igdb id':>8}  igdb name")
        for row, game_id, igdb_name in plan:
            flag = " " if row[2].lower() == igdb_name.lower() else "!"
            print(f"{flag} {row[2]:<45} {game_id:>8}  {igdb_name}")

        if unresolved:
            coverless_rows = set(coverless)
            print(f"\n{len(unresolved)} rows unresolved (staying NULL -> private catalog rows):")
            for row in unresolved:
                reason = "no cover art" if row in coverless_rows else "cover unknown to IGDB"
                print(f"  {row[2]} ({reason})")

        if not apply_changes:
            print("\nPreview only. Re-run with --apply to write.")
            return

        for row, game_id, _ in plan:
            session.execute(
                sa.text(f"UPDATE {row[0]} SET igdb_id = :g WHERE id = :i"),
                {"g": game_id, "i": row[1]},
            )
        session.commit()

        platforms = {
            str(game_id): detail["platforms"]
            for game_id, detail in details.items()
            if detail["platforms"]
        }
        PLATFORMS_PATH.write_text(json.dumps(platforms, indent=2, sort_keys=True))
        print(f"\nApplied. {len(plan)} rows updated.")
        print(f"Wrote platform lists for {len(platforms)} games to {PLATFORMS_PATH.name}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user", required=True, help="username whose rows to backfill")
    parser.add_argument("--apply", action="store_true", help="write (default is preview)")
    args = parser.parse_args()
    run(args.user, args.apply)


if __name__ == "__main__":
    main()
