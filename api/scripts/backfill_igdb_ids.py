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

    # And, separately, rename stored titles to IGDB's spelling:
    uv run python scripts/backfill_igdb_ids.py --user rgrassian --titles
    uv run python scripts/backfill_igdb_ids.py --user rgrassian --titles --apply

Preview is the default and prints every row it would touch alongside IGDB's own
name for the resolved id, so a production run is always a select before an
update. Read that column: a stored name that disagrees with IGDB's is the only
way a bad row shows itself.

--titles is the follow-up that acts on those disagreements. It improves on
backfill_titles.py's hand-read RENAMES map, which scored IGDB *name search*
results and so could land on an entirely different game. Keying on the cover id
cannot do that -- but it can still propose a variant's title, because IGDB
sometimes files a cover under an edition entry. See _run_titles for the three
ways a proposal can be wrong, and KEEP_STORED for the ones already declined.

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

# Stored name -> IGDB game id, for rows the cover join could not place. Read by
# hand from the --plan run's suggestions (see _suggest_hand_matches).
#
# All six of these are games whose cover art IGDB has since REPLACED: the stored
# CDN URL still renders, but that image_id is gone from /covers, so the exact
# join finds nothing. Two of the six needed correcting away from what the name
# search proposed first, which is the fuzziness this script exists to avoid --
# left as comments so nobody "fixes" them back.
HAND_MATCHED: dict[str, int] = {
    "Cadence of Hyrule": 116419,  # long canonical name, right game
    "Fortnite": 1905,  # Main Game; search proposed 303239, a Crew Pack DLC
    "Marvel's Spider-Man: Miles Morales": 134581,  # not the Launch Edition
    "Pac-Man World 2": 305269,  # 2002 original; search proposed the 2025 Re-Pac
    "TowerFall Ascension": 9567,  # not Dark World
    "Wii Sports Resort": 2182,  # not the Wii Sports + Resort bundle
}

# Stored names that --titles must NOT rename to IGDB's spelling. Populate this
# from the --titles preview before applying: IGDB's house style is not always
# the better display name, and a rename away from the Wikipedia article title
# will make a later backfill_genres.py run miss the game.
KEEP_STORED: set[str] = {
    # --- IGDB filed the cover under an EDITION, not the base game ------------
    # The cover id identifies the cover exactly, but IGDB sometimes hangs that
    # cover off a variant entry. backfill_titles.py already rejected the first
    # three of these by hand; keep them rejected.
    "Cyberpunk 2077",  # -> ": Ultimate Edition", a Bundle (base + Phantom Liberty)
    "Dead Cells",  # -> "Dead Cells+"
    "Nintendogs",  # -> "Nintendogs: Labrador & Friends", one of several versions
    "Bomberman DS",  # -> "Bomberman", which loses the platform that names it
    #
    # --- house style, where IGDB's spelling is not the better display name ---
    "Baldur's Gate 3",  # -> "Baldur's Gate III"; the box art uses the digit
    "Pokémon FireRed",  # -> "... Version"; the other Pokémon rows omit it too
    #
    # Deliberately NOT here, though both were at first:
    #
    #   "Final Fantasy Tactics" -> ": The Ivalice Chronicles". Not an edition:
    #   IGDB has it as a Remaster with parent_game 428 (the 1997 original), and
    #   the stored cover is the remaster's. The longer name is the accurate one
    #   and it also stops the genre lookup matching the 1997 article.
    #
    #   "Cadence of Hyrule" -> its full canonical title. backfill_titles.py
    #   refused this because the long title's words are a superset of "The
    #   Legend of Zelda", so the Wikipedia genre lookup matched THAT article and
    #   took the wrong game's genres. Now safe: backfill_genres.py's OVERRIDES
    #   pins the long name to ["Roguelike", "Rhythm"]. Do not remove that entry.
}

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


def _suggest_hand_matches(session, unresolved: list[tuple]) -> None:
    """Name-search the rows the cover join could not place, and print candidates
    as a paste-ready HAND_MATCHED block.

    Name search is fuzzy -- that is the whole reason this script keys on cover
    ids instead -- so these are PROPOSALS, never applied. But the set is small
    (a handful of games whose art IGDB has replaced), and reading three
    candidates each is a couple of minutes' work against no other way in.

    The cover image_id is printed beside each candidate: if it differs from the
    one your row stores, that confirms "IGDB replaced the art" rather than
    "wrong game", and doubles as the value to refresh image_url to.
    """
    settings = get_settings()
    print("\nCandidates by name search. Read them, then paste the right ids into")
    print("HAND_MATCHED at the top of this script and re-run:\n")
    print("HAND_MATCHED = {")
    for row in unresolved:
        name = row[2]
        body = (
            f'search "{_escape(name)}"; fields name, cover.image_id, first_release_date; limit 3;'
        )
        try:
            candidates = _run_query(session, settings, body, _IGDB_GAMES_URL)
        except Exception as exc:
            print(f"    # {name!r}: search failed ({exc})")
            continue
        stored_slug = cover_image_id(row[3])
        print(f"    # {name!r}  (your cover: {stored_slug})")
        for c in candidates:
            slug = (c.get("cover") or {}).get("image_id", "-")
            same = " <- same cover" if slug == stored_slug else ""
            print(f"    #     {c['id']:>7}  {c.get('name', '')!r}  cover={slug}{same}")
        if candidates:
            print(f"    {name!r}: {candidates[0]['id']},")
    print("}")


def _escape(term: str) -> str:
    return term.replace("\\", "\\\\").replace('"', '\\"')


def _run_titles(session, user_id, plan: list[tuple], apply_changes: bool) -> None:
    """Rename stored titles to IGDB's, for rows whose cover resolved.

    Better than backfill_titles.py's map, which scored IGDB *name search*
    results and so mis-resolved sequels outright. Here the game came back from
    the cover the row is already displaying, so it is never a different game.

    But "never a different game" is NOT "never a different title", and the gap
    is the reason this is previewed rather than applied blind. Three ways a
    proposal can still be wrong, all seen on the real library:

      1. IGDB files the cover under an EDITION entry rather than the base game,
         so "Dead Cells" proposes "Dead Cells+" and "Cyberpunk 2077" proposes
         ": Ultimate Edition". The cover is right; the entry it hangs off is a
         variant.
      2. IGDB's house style is not always the better display name -- roman
         numerals ("Baldur's Gate III") where the box art uses digits.
      3. Names drive the Wikipedia lookup in backfill_genres.py, so a rename
         away from the article title makes a later genre re-run miss the game.

    KEEP_STORED is the opt-out for all three, and is already populated from the
    preview against the real library.
    """
    renames = [
        (row, igdb_name)
        for row, _, igdb_name in plan
        if igdb_name and row[2] != igdb_name and row[2] not in KEEP_STORED
    ]
    kept = [row for row, _, n in plan if n and row[2] != n and row[2] in KEEP_STORED]

    # A rename onto a name the user already holds in that table would violate
    # its unique constraint and abort the transaction, so it is caught here.
    # Conservative on purpose: blocked on any same-name row, not just one that
    # would actually collide on (name, system).
    existing = {
        (table, name)
        for table in ("games", "wishlist_items")
        for (name,) in session.execute(
            sa.text(f"SELECT name FROM {table} WHERE user_id = :u"),
            {"u": user_id},
        )
    }
    blocked = [(r, n) for r, n in renames if (r[0], n) in existing]
    renames = [(r, n) for r, n in renames if (r[0], n) not in existing]

    print(f"{len(renames)} titles differ from IGDB:\n")
    for row, igdb_name in sorted(renames, key=lambda e: e[0][2]):
        print(f"  {row[0]:<15} {row[2]}")
        print(f"  {'':<15}   -> {igdb_name}")
    if blocked:
        print(f"\n{len(blocked)} BLOCKED (you already have a row by the target name):")
        for row, igdb_name in blocked:
            print(f"  {row[2]} -> {igdb_name}")
    if kept:
        print(f"\n{len(kept)} left alone by KEEP_STORED:")
        for row in kept:
            print(f"  {row[2]}")

    if not apply_changes:
        print("\nPreview only. Add any you want to keep to KEEP_STORED, then --apply.")
        return
    if not renames:
        print("\nNothing to apply.")
        return

    for row, igdb_name in renames:
        session.execute(
            sa.text(f"UPDATE {row[0]} SET name = :n WHERE id = :i"),
            {"n": igdb_name, "i": row[1]},
        )
    session.commit()
    print(f"\nApplied. {len(renames)} titles renamed.")


def run(username: str, apply_changes: bool, titles: bool) -> None:
    session_factory = get_sessionmaker()
    with session_factory() as session:
        user_id = session.execute(
            sa.text("SELECT id FROM profiles WHERE username = :u"), {"u": username}
        ).scalar_one_or_none()
        if user_id is None:
            print(f"No profile named {username!r}.")
            sys.exit(1)

        # (table, id, name, image_url). Title mode looks at every row, since a
        # row that already has an igdb_id can still have a stale name; id mode
        # only cares about the ones missing an id.
        where = "" if titles else " AND igdb_id IS NULL"
        rows = [
            (table, row_id, name, image_url)
            for table in ("games", "wishlist_items")
            for row_id, name, image_url in session.execute(
                sa.text(
                    f"SELECT id, name, image_url FROM {table} "
                    f"WHERE user_id = :u{where} ORDER BY name"
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
        stranded: list[tuple] = []  # cover present but IGDB no longer knows it
        for image_id, matching_rows in by_image_id.items():
            game_id = resolved.get(image_id)
            if game_id is None:
                stranded.extend(matching_rows)
                continue
            igdb_name = details.get(game_id, {}).get("name", "")
            plan.extend((row, game_id, igdb_name) for row in matching_rows)

        # HAND_MATCHED covers BOTH failure modes: a row with no cover at all,
        # and one whose cover IGDB has since replaced (the stored CDN URL keeps
        # working, but that image_id is no longer in /covers, so the exact join
        # finds nothing). The second is the common one on an older library.
        unresolved: list[tuple] = []
        hand_ids = {gid for gid in (HAND_MATCHED.get(r[2]) for r in coverless + stranded) if gid}
        if hand_ids:
            details |= fetch_games(session, sorted(hand_ids - set(details)))
        for row in coverless + stranded:
            game_id = HAND_MATCHED.get(row[2])
            if game_id is None:
                unresolved.append(row)
            else:
                plan.append((row, game_id, details.get(game_id, {}).get("name", "(hand-matched)")))

        if titles:
            _run_titles(session, user_id, plan, apply_changes)
            return

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
                reason = "no cover art" if row in coverless_rows else "cover replaced upstream"
                print(f"  {row[2]} ({reason})")
            _suggest_hand_matches(session, unresolved)

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
    parser.add_argument(
        "--titles",
        action="store_true",
        help="rename stored titles to IGDB's, instead of filling in igdb_id",
    )
    args = parser.parse_args()
    run(args.user, args.apply, args.titles)


if __name__ == "__main__":
    main()
