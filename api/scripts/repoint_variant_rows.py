"""Repoint catalog rows whose igdb_id landed on a variant, not the base game.

WHAT IS WRONG. game_metadata.igdb_id was filled in by a since-deleted matcher
that scored IGDB search results, and IGDB is full of near-duplicates: editions,
per-platform ports, remasters, mods. Eleven rows ended up on one of those.
"Dead Cells" points at IGDB's *Dead Cells+* (Apple Arcade, iOS only), "Super
Mario 64" at the Switch port inside 3D All-Stars, "Luigi's Mansion" at the 3DS
remake. Only the NAME was protected at the time, so the rest of the row -- cover
art, release date, platforms, genres -- is the variant's.

WHY IT MATTERS MORE THAN IT LOOKS. igdb_id is the catalog's shared key. Another
user adding "Dead Cells" through search resolves the BASE game's id, which is a
different game_metadata row, so the same game ends up with two catalog rows and
the sharing the catalog exists for silently stops happening for exactly these
titles.

HOW A ROW IS FOUND. Same guard that surfaced them: backfill_platforms.py skips
any row where a console someone actually recorded is absent from IGDB's platform
list for that id, because IGDB contradicting a known fact means the id is wrong.
This script reuses that check in the other direction -- as VERIFICATION of a
proposed id. A candidate whose platform list does not cover every recorded
console is refused, so a bad entry in the table below fails loudly.

WHY THE TABLE IS HAND-WRITTEN. An earlier version of the id backfill scored
candidates automatically and is what produced this mess; backfill_titles.py
retired the same idea for the same reason. The candidates below were read by
hand against IGDB. The only thing left to the machine is picking WHICH of a
title's hand-audited candidates covers the consoles this database records, which
is a lookup, not a judgement -- IGDB models a multi-platform release as several
rows, and which one is right depends on data only the database has.

HOW IT FIXES. Never by editing igdb_id in place when the correct row already
exists: uq_game_metadata_igdb_id would reject it, and the two rows need merging
anyway. Link rows (played_games, wishlist_games) are repointed at the correct
catalog row, which is the merge the catalog was designed for -- it touches no
play session, because play_sessions.game_id points at the user's row, not the
catalog's. The emptied variant row is then deleted.

Usage, from api/. The Twitch credentials come from the repo-root .env in every
environment, so only the database ever needs naming, and only when it is not
the .env one:

    uv run python scripts/repoint_variant_rows.py                      # preview, local
    uv run python scripts/repoint_variant_rows.py --apply
    uv run python scripts/repoint_variant_rows.py --database-url "$PROD_URL"
    uv run python scripts/repoint_variant_rows.py --database-url "$PROD_URL" --apply

Every run prints the database it is pointed at, with the password stripped.
A URL typed inline lands in shell history and in `ps`; read it from a variable
or a password manager rather than pasting it.

Preview is the default and prints every row it would touch, so a production run
is always a select before an update. Re-run backfill_platforms.py afterwards:
the skip list should shrink to the genuine IGDB gaps.
"""

import argparse
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import sqlalchemy as sa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.models import GameMetadata, PlayedGame, PlaySession, WishlistGame
from app.services.igdb import _IGDB_GAMES_URL, _run_query, _upgrade_cover_url
from scripts.backfill_platforms import CHUNK, recorded_systems
from scripts.db_target import add_database_url_arg, apply_database_url

# Catalog row name -> the IGDB ids that are legitimately this game, best first.
#
# Several titles need more than one because IGDB splits a multi-platform release
# into separate rows ("Main" for the lead platforms, "Port" for the rest), and
# only the row listing the console someone recorded is usable here: the platform
# guard rejects the others. The first candidate whose platform list covers every
# recorded console wins, so ordering is "the widest, most canonical row first".
#
# Rejected while reading, so nobody re-adds them: Dead Cells+ (351296, iOS
# bundle), Super Mario 64 FPS (144163) and the two PC forks, Luigi's Mansion
# Beta Restoration (281022), Smash Brawl's Web browser entry (328674) and its
# "Limited Edition" (231867), the Metroid Dread PC (323061) and Nintendo DS
# (233651) fan entries, Pac-Man World 2 Re-Pac (358530, a 2025 remake, not this
# game), Hollow Knight's Vita mod (365702), Disco Elysium's Game Boy Edition
# (140050) and Android port (335434), and every DLC row.
REPOINTS: dict[str, tuple[int, ...]] = {
    # Single canonical row; the stored id is a variant of it.
    "Dead Cells": (26855,),
    "Hollow Knight": (14593,),
    "Super Smash Bros. Brawl": (1628,),  # Wii
    "Metroid Dread": (15698,),  # Switch
    "Luigi's Mansion": (2485,),  # one row covers both GameCube and 3DS
    # Split releases: the base row, then the ports, so a recorded console that
    # only the port lists still resolves.
    "Super Mario 64": (1074, 229245),  # N64/Wii/Wii U, then the Switch port
    "Call of Duty: Black Ops III": (9509, 136212),  # PC+PS4/XB1, then PS3/360
    "Disco Elysium": (26472, 141540),  # PC/Mac, then The Final Cut's consoles
    "Grim Fandango": (181, 8682),  # the 1998 PC release, then Remastered
    "Pac-Man World 2": (4063, 305269, 134428),  # GC/PS2/PC/Xbox, PS2, GBA
    "SpongeBob SquarePants: Lights, Camera, Pants!": (2768, 210724, 248553, 320418),
}


@dataclass
class Fold:
    """Two link rows for the same user that the merge would collide.

    Only possible when a user holds both the variant row and the correct row --
    uq_played_games_user_id_metadata_id would reject the second. The duplicate
    is absorbed into the keeper rather than repointed.
    """

    table: str
    dup_link_id: int
    keeper_link_id: int
    sessions_moved: int
    lost: str  # per-user fields on the duplicate that the keeper's values win over


@dataclass
class RowPlan:
    row: GameMetadata
    target_igdb_id: int
    target_row: GameMetadata | None  # set when the correct row already exists
    igdb: dict  # IGDB's data for target_igdb_id
    links: dict[str, int] = field(default_factory=dict)  # table -> rows repointed
    folds: list[Fold] = field(default_factory=list)
    # Why this row is not purely mechanical, if it isn't. Printed as its own
    # section so a production run has a short list to read rather than eleven.
    review: list[str] = field(default_factory=list)

    @property
    def is_merge(self) -> bool:
        return self.target_row is not None

    @property
    def new_name(self) -> str:
        return choose_name(self.row.name, self.igdb["name"])


def fetch_games(db, igdb_ids: list[int]) -> dict[int, dict]:
    """IGDB game id -> the catalog-shaped fields for it.

    Wider than backfill_platforms.fetch_platforms, because repointing in place
    has to replace the whole row's worth of variant data, not just platforms.
    """
    settings = get_settings()
    out: dict[int, dict] = {}
    for start in range(0, len(igdb_ids), CHUNK):
        chunk = igdb_ids[start : start + CHUNK]
        ids = ",".join(str(i) for i in chunk)
        body = (
            "fields name, first_release_date, platforms.name, cover.url;"
            f" where id = ({ids}); limit {len(chunk)};"
        )
        for row in _run_query(db, settings, body, _IGDB_GAMES_URL):
            released = row.get("first_release_date")
            out[row["id"]] = {
                "name": row.get("name") or "",
                "platforms": sorted(p["name"] for p in row.get("platforms") or [] if p.get("name")),
                # IGDB dates are unix timestamps at UTC midnight of release day.
                "release_date": (
                    datetime.fromtimestamp(released, tz=UTC).date() if released else None
                ),
                "image_url": _upgrade_cover_url((row.get("cover") or {}).get("url") or ""),
            }
    return out


def choose_name(stored: str, igdb_name: str) -> str:
    """The name to keep once the row points at the correct game: IGDB's.

    This is only safe because of what has already happened to the id. A name
    lifted from a SEARCH result is a guess, and trusting one is how a shelf ends
    up reading "Dead Cells+"; but this name comes from an id that was chosen by
    hand from the table above and then checked against the consoles the database
    records. Given an id that is right, IGDB's name for it is the canonical name
    of that exact game -- there is no "Metroid Dreadnought" case to guard
    against, because the id is 15698 and IGDB calls 15698 "Metroid Dread".

    So the earlier rule (adopt only when IGDB's name extends ours) is dropped:
    it was string-matching around a trust problem the id no longer has, and it
    also refused improvements like "Halo CE" -> "Halo: Combat Evolved". Every
    rename is listed under WANT A LOOK in the preview instead, which is the
    right place for a human to disagree.
    """
    return igdb_name or stored


def choose_candidate(
    candidates: tuple[int, ...], recorded: set[str], fetched: dict[int, dict]
) -> tuple[int | None, str]:
    """The first candidate IGDB lists every recorded console for.

    Returns (id, reason-if-none). Covering the recorded consoles is the whole
    test: it is the one claim about the row that can be checked against a fact
    the database already holds.
    """
    for igdb_id in candidates:
        data = fetched.get(igdb_id)
        if data is None:
            continue
        if not recorded - set(data["platforms"]):
            return igdb_id, ""
    known = [c for c in candidates if c in fetched]
    if not known:
        return None, "IGDB returned nothing for any candidate id"
    # Every candidate failed, so report against the best one rather than
    # printing the same console list once per candidate.
    missing = sorted(recorded - set(fetched[known[0]]["platforms"]))
    return None, f"no candidate lists {', '.join(missing)}"


def build_plans(session) -> tuple[list[RowPlan], list[tuple[str, str]]]:
    """Read-only: work out what would change. Returns (plans, blocked)."""
    rows = list(
        session.execute(
            sa.select(GameMetadata).where(GameMetadata.name.in_(tuple(REPOINTS)))
        ).scalars()
    )
    if not rows:
        return [], []

    every_candidate = sorted({i for name in REPOINTS for i in REPOINTS[name]})
    fetched = fetch_games(session, every_candidate)
    recorded = recorded_systems(session, [r.id for r in rows])
    # Every shared row keyed by igdb_id, so "does the correct row already exist?"
    # is one query rather than one per candidate.
    by_igdb = {
        r.igdb_id: r
        for r in session.execute(
            sa.select(GameMetadata).where(GameMetadata.igdb_id.is_not(None))
        ).scalars()
    }

    plans: list[RowPlan] = []
    blocked: list[tuple[str, str]] = []
    for row in sorted(rows, key=lambda r: r.name.lower()):
        if row.igdb_id is None:
            blocked.append((row.name, "private row (no igdb_id); nothing to repoint"))
            continue
        target, why_not = choose_candidate(REPOINTS[row.name], recorded.get(row.id, set()), fetched)
        if target is None:
            blocked.append((row.name, why_not))
            continue
        if target == row.igdb_id:
            continue  # already on the right id
        plan = RowPlan(
            row=row,
            target_igdb_id=target,
            target_row=by_igdb.get(target),
            igdb=fetched[target],
        )
        candidates = REPOINTS[row.name]
        if target != candidates[0]:
            # The canonical row does not list the recorded console, so this
            # resolved to a port or an edition. Always worth a human's eyes: it
            # is the difference between "Grim Fandango" and "Remastered".
            plan.review.append(
                f"resolved past the canonical row ({candidates[0]}) to {target}"
                f" ({plan.igdb['name']}), which is the row listing"
                f" {', '.join(sorted(recorded.get(row.id, set()))) or 'no recorded console'}"
            )
        if plan.new_name != row.name:
            plan.review.append(f'renames the shelf entry to "{plan.new_name}"')
        if plan.is_merge:
            plan.review.append(
                f"another catalog row (id {plan.target_row.id},"
                f' "{plan.target_row.name}") already holds this igdb_id, so the two merge'
                " and that row's name, cover and genres are what survive"
            )
            problem = plan_merge(session, plan)
            if problem:
                blocked.append((row.name, problem))
                continue
        plans.append(plan)
    return plans, blocked


def plan_merge(session, plan: RowPlan) -> str:
    """Fill in the link moves and folds for a merge. Returns a blocking reason.

    The variant row's link rows move to the correct row. Where a user holds
    both, the unique key on (user_id, metadata_id) forbids the move, so the
    duplicate is folded into the keeper instead: its play sessions move, the
    row goes.
    """
    old_id, new_id = plan.row.id, plan.target_row.id
    for model, table in ((PlayedGame, "played_games"), (WishlistGame, "wishlist_games")):
        links = list(
            session.execute(
                sa.select(model).where(model.metadata_id.in_((old_id, new_id)))
            ).scalars()
        )
        by_user: dict = {}
        for link in links:
            by_user.setdefault(link.user_id, {})[link.metadata_id] = link
        moved = 0
        for pair in by_user.values():
            dup = pair.get(old_id)
            if dup is None:
                continue
            keeper = pair.get(new_id)
            if keeper is None:
                moved += 1
                continue
            sessions_moved, lost = 0, ""
            if model is PlayedGame:
                open_on = set(
                    session.execute(
                        sa.select(PlaySession.game_id).where(
                            PlaySession.game_id.in_((dup.id, keeper.id)),
                            PlaySession.end_date.is_(None),
                        )
                    ).scalars()
                )
                if {dup.id, keeper.id} <= open_on:
                    # uq_play_sessions_one_open_per_game allows one open session
                    # per library row, so folding would need a human to say
                    # which "currently playing" is the real one.
                    return f"user holds both rows and both are currently playing (link {dup.id})"
                sessions_moved = session.execute(
                    sa.select(sa.func.count())
                    .select_from(PlaySession)
                    .where(PlaySession.game_id == dup.id)
                ).scalar_one()
                lost = f"rating {dup.rating or '-'}"
            else:
                lost = f"starred={dup.starred}, notes={'yes' if dup.notes else 'no'}"
            plan.folds.append(
                Fold(
                    table=table,
                    dup_link_id=dup.id,
                    keeper_link_id=keeper.id,
                    sessions_moved=sessions_moved,
                    lost=lost,
                )
            )
        plan.links[table] = moved
    return ""


def apply_plan(session, plan: RowPlan) -> None:
    """Write one row's fix. Everything here is inside the caller's transaction."""
    if not plan.is_merge:
        # No row holds the correct id, so the variant row BECOMES the correct
        # row. Genres are untouched on purpose; see run().
        plan.row.igdb_id = plan.target_igdb_id
        plan.row.name = plan.new_name
        plan.row.platforms = plan.igdb["platforms"]
        plan.row.release_date = plan.igdb["release_date"]
        if plan.igdb["image_url"]:
            plan.row.image_url = plan.igdb["image_url"]
        return

    old_id, new_id = plan.row.id, plan.target_row.id
    for fold in plan.folds:
        if fold.table == "played_games":
            session.execute(
                sa.update(PlaySession)
                .where(PlaySession.game_id == fold.dup_link_id)
                .values(game_id=fold.keeper_link_id)
            )
            session.execute(sa.delete(PlayedGame).where(PlayedGame.id == fold.dup_link_id))
        else:
            session.execute(sa.delete(WishlistGame).where(WishlistGame.id == fold.dup_link_id))
    # After the folds, no user holds both rows, so the bulk repoint cannot
    # collide with the unique key.
    for model in (PlayedGame, WishlistGame):
        session.execute(
            sa.update(model).where(model.metadata_id == old_id).values(metadata_id=new_id)
        )
    # Safe now and only now: the FK from the link tables has no cascade, so an
    # emptied catalog row is exactly what may be deleted.
    session.execute(sa.delete(GameMetadata).where(GameMetadata.id == old_id))


def describe(plan: RowPlan) -> None:
    kind = "MERGE into existing row" if plan.is_merge else "repoint in place"
    print(f"  {plan.row.name}  ({kind})")
    print(f"      igdb {plan.row.igdb_id} -> {plan.target_igdb_id}  ({plan.igdb['name']})")
    if plan.is_merge:
        for table, moved in plan.links.items():
            if moved:
                print(f"      {moved} {table} row(s) repointed at metadata {plan.target_row.id}")
        for fold in plan.folds:
            sessions = f", {fold.sessions_moved} session(s) moved" if fold.sessions_moved else ""
            print(f"      {fold.table} duplicate folded: dropping {fold.lost}{sessions}")
        print(f"      catalog row {plan.row.id} deleted")
    else:
        if plan.new_name != plan.row.name:
            print(f'      name -> "{plan.new_name}"')
        print(f"      platforms -> {', '.join(plan.igdb['platforms'])}")
        print(f"      release_date -> {plan.igdb['release_date'] or '-'}")
    for note in plan.review:
        print(f"      REVIEW: {note}")


def run(apply_changes: bool) -> None:
    with get_sessionmaker()() as session:
        plans, blocked = build_plans(session)

        print(f"{len(plans)} of {len(REPOINTS)} mapped titles would change.\n")
        for plan in plans:
            describe(plan)

        if blocked:
            print(f"\n{len(blocked)} SKIPPED, needing a human:")
            for name, why in blocked:
                print(f"  {name}: {why}")

        # Repeated at the end because the per-row output is long enough to
        # scroll past on a production run, and these are the only rows where
        # the script made a choice rather than a lookup.
        needs_review = [p for p in plans if p.review]
        if needs_review:
            print(f"\n{len(needs_review)} row(s) WANT A LOOK before --apply:")
            for plan in needs_review:
                print(f"  {plan.row.name}")
                for note in plan.review:
                    print(f"      {note}")

        # The name each row will have AFTER the fix, not before: this list is
        # handed to the genre audit, which looks rows up by what is in the
        # database by then. On a merge the variant row is gone and the surviving
        # row's name is the one to quote.
        genre_sourced = [p.target_row.name if p.is_merge else p.new_name for p in plans]
        if genre_sourced:
            print(
                "\nGenres are deliberately NOT touched, on any of these rows: they came"
                "\nfrom the variant, but IGDB's vocabulary is what the genre audit exists"
                "\nto replace. Feed this list to it: " + ", ".join(genre_sourced)
            )

        if not apply_changes:
            print("\nPreview only. Re-run with --apply to write.")
            return
        if not plans:
            print("\nNothing to apply.")
            return

        for plan in plans:
            apply_plan(session, plan)
        session.commit()
        print(f"\nApplied. {len(plans)} rows fixed. Re-run backfill_platforms.py now.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write (default is preview)")
    add_database_url_arg(parser)
    args = parser.parse_args()
    print(f"Target: {apply_database_url(args.database_url)}\n")
    run(args.apply)


if __name__ == "__main__":
    main()
