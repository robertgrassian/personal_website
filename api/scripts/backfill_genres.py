"""Re-source a user's game genres from Wikipedia/Wikidata.

Why this exists: the library's genres came from two different places. The
original 155 games were taken from Wikipedia by hand and are good ("Metroidvania",
"Soulslike", "Farm Life Sim"). Games added since arrived through the IGDB search
flow and carry IGDB's much coarser vocabulary -- Hades II as "Role-playing (RPG),
Hack and slash, Adventure, Indie", with no roguelike anywhere. This script puts
the whole library back on one vocabulary, sourced from the same place the good
half already came from. See app/services/genres.py for why the lookup goes
through Wikipedia search rather than straight to Wikidata.

It is deliberately NOT fully automatic, for two independent reasons:

  1. Title matching is fuzzy. The shelf carries informal names ("Halo CE",
     "Expedition 33"). Wikipedia resolves most correctly, but "Octopath
     Traveller" lands on *Octopath Traveler II*.
  2. Even a correct article can propose WORSE genres than the curated value it
     replaces. Measured on the real library: of 68 changing rows, 55 dropped at
     least one existing genre, including "Soulslike" and "Brick-Breaking" --
     precisely the hand-picked terms this effort exists to keep.

So every row that would change is shown before it is written, and "keep both"
is one keystroke.

Usage (from api/, with DATABASE_URL set):

    # 1. Look everything up and write a plan. Touches no rows. Safe to re-run.
    uv run python scripts/backfill_genres.py --plan --user rgrassian

    # 2. Review every changing row; updates the plan in place.
    uv run python scripts/backfill_genres.py --review

    # 3. Apply the approved plan.
    uv run python scripts/backfill_genres.py --apply

--review and --apply never reach the network, and --review never touches the
database; only --apply writes, and only to the user named when the plan was
built.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import get_sessionmaker
from app.models import Game, Profile, WishlistItem
from app.schemas.me import clean_genres
from app.services import genres as genre_service

PLAN_PATH = Path(__file__).parent / ".genre_backfill_plan.json"

# Above this title similarity the match is trusted enough to skip the "is this
# the right article?" question -- but NOT the "are these better genres?" one,
# which is asked for every changing row regardless.
#
# Deliberately set just below an exact match, because string distance turns out
# to be a BAD confidence signal for game titles and a mid-range threshold gets
# it backwards. Measured against the real library:
#
#   0.895  "Octopath Traveller"   -> "Octopath Traveler II"            WRONG
#   0.941  "Super Smash Bros 4"   -> "Super Smash Bros. (video game)"  WRONG
#   0.538  "Halo CE"              -> "Halo: Combat Evolved"            right
#   0.667  "Expedition 33"        -> "Clair Obscur: Expedition 33"     right
#
# A wrong sequel or entry in a series is one character away from correct, while
# an abbreviation the shelf uses is very far from it.
AUTO_ACCEPT = 0.97

# Politeness delay between Wikipedia searches. Their API is generous but this is
# a bulk read of a free shared service, and the whole library still finishes in
# a couple of minutes.
REQUEST_DELAY = 0.3

# Statuses whose rows --apply is allowed to write. Everything else
# ("needs_review", "missing", "skipped") is left alone.
WRITABLE = ("auto", "approved")

# Final genres for rows where Wikipedia's infobox is vaguer or plainly wrong.
# Keyed by game name, applied to both the library and the wishlist.
#
# These live here rather than being re-entered by hand each run because the plan
# is rebuilt from Wikipedia every time, so every run re-proposes the same losses.
# Doing it by hand worked three times and would eventually be forgotten once --
# which is the entire failure mode this script exists to avoid.
OVERRIDES: dict[str, list[str]] = {
    # The infobox says only "action role-playing"; soulslike is the useful term.
    "Elden Ring": ["Soulslike", "Action Role-Playing"],
    "Elden Ring Nightreign": ["Soulslike", "Roguelike", "Action Role-Playing"],
    "Bloodborne": ["Soulslike", "Action Role-Playing"],
    # Infobox says "action-adventure" and drops the more specific term.
    "Metroid Dread": ["Action-Adventure", "Metroidvania"],
    # No infobox genre at all; the Wikidata fallback offers only "Action".
    "Ball x Pit": ["Roguelike", "Brick-Breaking"],
    # Infobox is vaguer than the curated term.
    "WarioWare: Touched!": ["Rhythm", "Action"],
    # Wikipedia has no standalone article; search lands on "Bomberman Story DS",
    # an RPG spin-off, and takes its genres.
    "Bomberman DS": ["Action", "Puzzle"],
    # The infobox lists Role-Playing, which it plainly is not.
    "Untitled Goose Game": ["Puzzle", "Stealth"],
}

# One concept, two spellings. Wikipedia says "Monster Tamer"; the library has
# always said "Monster-taming", and the two are far enough apart that the
# spelling-insensitive snap below cannot connect them, so they would sit in the
# filter dropdown as separate options.
SYNONYMS = {"Monster Tamer": "Monster-taming"}


# Re-exported from the service so the script's confidence score and the
# service's candidate ranking can never disagree about what "matches".
similarity = genre_service._title_similarity


def _vocab_key(genre: str) -> str:
    """Collapse a genre to a spelling-insensitive key, so "First-Person Shooter"
    and "First Person Shooter" are recognized as the same term."""
    return re.sub(r"[^a-z0-9]+", "", genre.lower())


def build_vocabulary(games: list[dict]) -> dict[str, str]:
    """The library's existing genre spellings, keyed for loose matching.

    Wikidata's spelling of a genre the library already uses is often *almost*
    the same ("First-Person Shooter" vs the stored "First Person Shooter",
    "Life Simulation" vs "Life simulation"). Left alone, both spellings end up
    in the shelf's filter dropdown as separate options -- the same defect the
    clean_genres dedupe fixes within a single game, one size larger. Snapping a
    proposal onto the spelling already in use avoids it without a hand-written
    alias table.

    When the library itself is inconsistent, the most common spelling wins.
    """
    counts: dict[str, dict[str, int]] = {}
    for game in games:
        for genre in game["current"]:
            bucket = counts.setdefault(_vocab_key(genre), {})
            bucket[genre] = bucket.get(genre, 0) + 1
    return {key: max(spellings, key=spellings.get) for key, spellings in counts.items()}


def snap(proposed: list[str], vocabulary: dict[str, str]) -> list[str]:
    """Rewrite proposed genres to the library's existing spelling where one
    matches loosely. Terms genuinely new to the library pass through."""
    return [vocabulary.get(_vocab_key(g), g) for g in proposed]


def load_games(username: str) -> tuple[list[dict], str]:
    """Every game belonging to one user.

    Scoped by user on purpose: this is a multi-user site, and an unscoped
    UPDATE would rewrite other people's curated genres with no way to tell
    afterwards which rows had been theirs.
    """
    with get_sessionmaker()() as session:
        profile = (
            session.query(Profile).filter(Profile.username == username).one_or_none()
        )
        if profile is None:
            print(f"No profile with username {username!r}.")
            sys.exit(1)
        out = []
        # Both tables, because the wishlist carries the same game titles and the
        # same genre vocabulary, and is shown on the same page. "kind" is what
        # --apply uses to route each row back to the right table.
        for g in (
            session.query(Game).filter(Game.user_id == profile.id).order_by(Game.name).all()
        ):
            out.append(
                {
                    "kind": "game",
                    "id": g.id,
                    "user_id": str(g.user_id),
                    "name": g.name,
                    "system": g.system,
                    "current": list(g.genres or []),
                }
            )
        for w in (
            session.query(WishlistItem)
            .filter(WishlistItem.user_id == profile.id)
            .order_by(WishlistItem.name)
            .all()
        ):
            out.append(
                {
                    "kind": "wishlist",
                    "id": w.id,
                    "user_id": str(w.user_id),
                    "name": w.name,
                    "system": w.system or "",
                    "current": list(w.genres or []),
                }
            )
        return out, str(profile.id)


def build_plan(username: str, force: bool) -> dict:
    if PLAN_PATH.exists() and not force:
        print(
            f"A plan already exists at {PLAN_PATH}.\n"
            "Re-planning discards every --review decision recorded in it. "
            "Pass --force to overwrite."
        )
        sys.exit(1)

    games, user_id = load_games(username)
    if not games:
        print(f"{username} has no games. Is DATABASE_URL pointing at the right database?")
        sys.exit(1)
    print(f"Looking up {len(games)} games (about {len(games) * REQUEST_DELAY / 60:.1f} min)...")

    # Distinct titles only: the same game on two systems is one lookup.
    titles = sorted({g["name"] for g in games})
    vocabulary = build_vocabulary(games)

    done = {"n": 0}

    def progress(title, _result):
        done["n"] += 1
        print(f"  [{done['n']}/{len(titles)}] {title}", flush=True)
        time.sleep(REQUEST_DELAY)

    found = genre_service.lookup_many(titles, on_progress=progress)

    entries = []
    for game in games:
        result = found[game["name"]]
        score = similarity(game["name"], result.article) if result.article else 0.0
        if not result.found:
            status = "missing"
        elif score >= AUTO_ACCEPT:
            status = "auto"
        else:
            status = "needs_review"
        entries.append(
            {
                **game,
                "article": result.article,
                "qid": result.qid,
                "proposed": OVERRIDES.get(
                    game["name"],
                    [SYNONYMS.get(g, g) for g in snap(result.genres, vocabulary)],
                ),
                "raw": result.raw_genres,
                "score": round(score, 3),
                "status": status,
            }
        )
    plan = {"username": username, "user_id": user_id, "entries": entries}
    PLAN_PATH.write_text(json.dumps(plan, indent=2))
    return plan


def read_plan() -> dict:
    if not PLAN_PATH.exists():
        print(f"No plan at {PLAN_PATH}. Run with --plan first.")
        sys.exit(1)
    return json.loads(PLAN_PATH.read_text())


def _changes(entry: dict) -> bool:
    """Would applying this entry actually alter the row? Empty proposals never
    count, so a lookup that found nothing can't blank out real genres."""
    return bool(entry["proposed"]) and entry["proposed"] != entry["current"]


def pending_writes(plan: dict) -> list[dict]:
    """Exactly the rows --apply would write."""
    return [e for e in plan["entries"] if e["status"] in WRITABLE and _changes(e)]


def summarize(plan: dict) -> None:
    entries = plan["entries"]
    by_status: dict[str, int] = {}
    for entry in entries:
        by_status[entry["status"]] = by_status.get(entry["status"], 0) + 1
    changed = pending_writes(plan)

    games = sum(1 for e in entries if e.get("kind") != "wishlist")
    print(
        f"\n{len(entries)} rows for {plan.get('username', '?')} "
        f"({games} games, {len(entries) - games} wishlist)"
    )
    for status in ("auto", "approved", "needs_review", "missing", "skipped"):
        if by_status.get(status):
            print(f"  {status:14} {by_status[status]}")

    # Printed in full, never truncated: for the rows already marked writable
    # this is the only view of what is about to be overwritten.
    print(f"\n{len(changed)} would change:\n")
    for entry in changed:
        before = " | ".join(entry["current"]) or "-"
        after = " | ".join(entry["proposed"]) or "-"
        print(f"  {entry['name']}")
        print(f"      {before}")
        print(f"   -> {after}")

    dropped = [e for e in changed if set(e["current"]) - set(e["proposed"])]
    if dropped:
        print(f"\n{len(dropped)} of those DROP an existing genre:")
        for entry in dropped:
            lost = " | ".join(sorted(set(entry["current"]) - set(entry["proposed"])))
            print(f"  {entry['name']}: loses {lost}")


def review(plan: dict) -> None:
    """Walk every row that would change.

    Not just the fuzzy-title ones: a confidently-matched article can still
    propose genres worse than the curated ones it replaces, and that tier is
    where most of the real damage sits.
    """
    pending = [e for e in plan["entries"] if e["status"] in WRITABLE and _changes(e)]
    if not pending:
        print("Nothing to review.")
        return
    print(
        f"{len(pending)} rows would change.\n"
        "  [y] accept proposed   [k] keep both (union)   [n] leave unchanged\n"
        "  [e] type genres by hand   [q] stop and save\n"
    )
    try:
        for index, entry in enumerate(pending, 1):
            union = entry["current"] + [
                g for g in entry["proposed"] if g not in entry["current"]
            ]
            print(f"--- {index}/{len(pending)}  {entry['name']}  ({entry['system']})")
            print(f"    wikipedia : {entry['article']}   (title match {entry['score']})")
            print(f"    current   : {' | '.join(entry['current']) or '-'}")
            print(f"    proposed  : {' | '.join(entry['proposed']) or '-'}")
            print(f"    both [k]  : {' | '.join(union)}")
            choice = input("    [y/k/n/e/q] ").strip().lower()
            if choice == "q":
                break
            if choice == "e":
                typed = input("    genres (comma separated): ").strip()
                entry["proposed"] = [g.strip() for g in typed.split(",") if g.strip()]
                entry["status"] = "approved"
            elif choice == "k":
                entry["proposed"] = union
                entry["status"] = "approved"
            elif choice == "y":
                entry["status"] = "approved"
            else:
                entry["status"] = "skipped"
            # Saved every iteration, not once at the end: a Ctrl-C partway
            # through 68 decisions must not discard the ones already made.
            PLAN_PATH.write_text(json.dumps(plan, indent=2))
    except (KeyboardInterrupt, EOFError):
        print("\nInterrupted.")
    PLAN_PATH.write_text(json.dumps(plan, indent=2))
    print(f"\nPlan saved to {PLAN_PATH}.")


def apply(plan: dict) -> None:
    todo = pending_writes(plan)
    if not todo:
        print("Nothing to apply.")
        return
    unreviewed = sum(1 for e in plan["entries"] if e["status"] == "needs_review")
    if unreviewed:
        print(f"Note: {unreviewed} entries are still unreviewed and will be left alone.")

    print(f"Updating {len(todo)} rows for {plan.get('username', '?')}...")
    updated = 0
    skipped = []
    with get_sessionmaker()() as session:
        for entry in todo:
            model = WishlistItem if entry.get("kind") == "wishlist" else Game
            game = session.get(model, entry["id"])
            if game is None:
                skipped.append(f"{entry['name']} (row no longer exists)")
                continue
            # The plan was built against this row; if it moved to another
            # account since, leave it alone rather than writing across owners.
            if str(game.user_id) != entry["user_id"]:
                skipped.append(f"{entry['name']} (owner changed)")
                continue
            # Through the same validator the API's write path uses, so a
            # backfilled row can't hold genres POST /me/games would reject.
            game.genres = clean_genres(entry["proposed"])
            updated += 1
        session.commit()

    games = sum(1 for e in todo if e.get("kind") != "wishlist")
    print(f"Done. {updated} rows updated ({games} games, {updated - games} wishlist).")
    for note in skipped:
        print(f"  skipped: {note}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--plan", action="store_true", help="look everything up, write the plan")
    group.add_argument("--review", action="store_true", help="decide every changing row")
    group.add_argument("--apply", action="store_true", help="write approved changes to the DB")
    group.add_argument("--show", action="store_true", help="print the current plan")
    parser.add_argument("--user", help="username whose library to plan (required with --plan)")
    parser.add_argument(
        "--force", action="store_true", help="with --plan, overwrite an existing plan"
    )
    args = parser.parse_args()

    if args.plan:
        if not args.user:
            parser.error("--plan requires --user (this script writes to one library only)")
        summarize(build_plan(args.user, args.force))
        print(f"\nPlan written to {PLAN_PATH}.\nNext: --review, then --apply.")
    elif args.review:
        review(read_plan())
    elif args.apply:
        apply(read_plan())
    else:
        summarize(read_plan())


if __name__ == "__main__":
    main()
