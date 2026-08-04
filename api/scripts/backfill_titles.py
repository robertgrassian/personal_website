"""One-off: rename a user's games to their canonical titles.

Deliberately a hardcoded list rather than a matcher. An earlier version resolved
every title against IGDB and scored the candidates, which was the wrong shape of
solution for a job that runs a handful of times: the scoring was fooled by IGDB's
edition and spin-off entries ("Elden Ring" -> *Elden Ring Nightreign*, "Halo CE"
-> *Halo CE+*, "Dead Cells" -> *Dead Cells+*), so every result needed reading
anyway. The list below IS that reading, done once. It is auditable, it cannot
drift, and it does not need to be right about games nobody owns.

Why rename at all: the library stores informal names ("Civ 6", "Halo CE"), and
those are what make the Wikipedia genre lookup fail or, worse, silently match
the wrong game. Run this BEFORE the genre backfill.

Usage (from api/, with DATABASE_URL set):

    uv run python scripts/backfill_titles.py --user rgrassian            # preview
    uv run python scripts/backfill_titles.py --user rgrassian --apply

Preview is the default and prints every row it would touch, so a production run
is always a select before an update.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import get_sessionmaker
from app.models import Game, Profile, WishlistItem

# current name -> canonical name.
#
# Everything here was read by hand against IGDB's answers. Entries IGDB proposed
# and this rejects, for the record, so nobody re-adds them: "Baldur's Gate 3" ->
# *Deluxe Edition*, "Bomberman DS" -> *Bomberman*, "Brain Age" -> *Brain Train
# Age*, "Nintendogs" -> *Nintendogs Deluxe*, "Halo CE" -> *Halo CE+*, and two
# Smash entries that resolved to DLC stages. Each was an edition, a spin-off or
# the wrong entry in a series.
RENAMES: dict[str, str] = {
    # Punctuation and accents only.
    "Animal Crossing New Horizons": "Animal Crossing: New Horizons",
    "Arc Raiders": "ARC Raiders",
    "Call of Duty Black Ops": "Call of Duty: Black Ops",
    "Call of Duty Black Ops 4": "Call of Duty: Black Ops 4",
    "Call of Duty Modern Warfare 2": "Call of Duty: Modern Warfare 2",
    "Call of Duty Modern Warfare 3": "Call of Duty: Modern Warfare 3",
    "God of War Ragnarok": "God of War Ragnarök",
    "Halo 3 ODST": "Halo 3: ODST",
    "Halo Reach": "Halo: Reach",
    "Mario Kart Double Dash!!": "Mario Kart: Double Dash!!",
    "Mario Strikers Battle League": "Mario Strikers: Battle League",
    "Multiversus": "MultiVersus",
    "Paper Mario The Origami King": "Paper Mario: The Origami King",
    "Phoenix Wright Ace Attorney Trilogy": "Phoenix Wright: Ace Attorney Trilogy",
    "Plants vs. Zombies Replanted": "Plants vs. Zombies: Replanted",
    "Pokemon Brilliant Diamond": "Pokémon Brilliant Diamond",
    "Pokemon Colosseum": "Pokémon Colosseum",
    "Pokemon Legends Arceus": "Pokémon Legends: Arceus",
    "Pokemon Let's go Pikachu": "Pokémon: Let's Go, Pikachu!",
    "Pokemon Omega Ruby": "Pokémon Omega Ruby",
    "Pokemon Pokopia": "Pokémon Pokopia",
    "Pokemon Stadium": "Pokémon Stadium",
    "Pokemon Violet": "Pokémon Violet",
    "Pokemon XD Gale of Darkness": "Pokémon XD: Gale of Darkness",
    "Spongebob SquarePants Lights Camera Pants": (
        "SpongeBob SquarePants: Lights, Camera, Pants!"
    ),
    "Star Wars the Clone Wars": "Star Wars: The Clone Wars",
    "Super Smash Bros Brawl": "Super Smash Bros. Brawl",
    "Super Smash Bros Melee": "Super Smash Bros. Melee",
    "Super Smash Bros Ultimate": "Super Smash Bros. Ultimate",
    "Warioware Smooth Moves": "WarioWare: Smooth Moves",
    # Real renames IGDB proposed and this accepts.
    # NOT renamed, deliberately: "Cadence of Hyrule" -> its full canonical title
    # "Cadence of Hyrule: Crypt of the NecroDancer Featuring the Legend of
    # Zelda". IGDB is right that this is the formal name, but the longer string
    # then matched the Wikipedia article "The Legend of Zelda" -- its words are a
    # subset of the long title -- and took that game's genres. The short name
    # matches its own article exactly.
    "Call of Duty Black Ops 2": "Call of Duty: Black Ops II",
    "Call of Duty Black Ops 3": "Call of Duty: Black Ops III",
    "Expedition 33": "Clair Obscur: Expedition 33",
    "Guitar Hero 3 Legends of Rock": "Guitar Hero III: Legends of Rock",
    "Mario and Luigi Partners in Time": "Mario & Luigi: Partners in Time",
    "Octopath Traveller": "Octopath Traveler",
    "Rock Band - The Beatles": "The Beatles: Rock Band",
    "Spider Man - Miles Morales": "Marvel's Spider-Man: Miles Morales",
    "Star Wars Episode 3 Revenge of the Sith": (
        "Star Wars: Episode III - Revenge of the Sith"
    ),
    "Starfox Adventures": "Star Fox Adventures",
    "Super Mario Wonder": "Super Mario Bros. Wonder",
    "The Legend of Zelda: Wind Waker": "The Legend of Zelda: The Wind Waker",
    # Written by hand: IGDB either found nothing or offered the wrong entry.
    "Civ 6": "Sid Meier's Civilization VI",
    "Final Fantasy Remake": "Final Fantasy VII Remake",
    "Hades 2": "Hades II",
    "Halo CE": "Halo: Combat Evolved",
    "Pokemon Fire Red": "Pokémon FireRed",
    "Pokemon Legends ZA": "Pokémon Legends: Z-A",
    "Super Mario RPG (remake)": "Super Mario RPG",
    "Super Smash Bros 4": "Super Smash Bros. for Wii U",
    "Super Smash Bros 64": "Super Smash Bros.",
    "The Legend of Zelda: Link's Awakening Remake": "The Legend of Zelda: Link's Awakening",
    "Wario Ware Touched": "WarioWare: Touched!",
}


def _plan_renames(rows: list, key) -> tuple[list, list]:
    """Split rows into (renamable, blocked-by-an-existing-row).

    ``key`` returns the row's uniqueness key, which differs between the two
    tables: games is unique on (name, system), wishlist_items on name alone.
    A rename onto an occupied key would abort the whole transaction, so it is
    caught here instead.
    """
    taken = {key(r, r.name) for r in rows}
    planned, blocked = [], []
    for row in rows:
        new_name = RENAMES.get(row.name)
        if not new_name or new_name == row.name:
            continue
        (blocked if key(row, new_name) in taken else planned).append((row, new_name))
    return planned, blocked


def run(username: str, apply_changes: bool) -> None:
    with get_sessionmaker()() as session:
        profile = session.query(Profile).filter(Profile.username == username).one_or_none()
        if profile is None:
            print(f"No profile with username {username!r}.")
            sys.exit(1)

        games = session.query(Game).filter(Game.user_id == profile.id).order_by(Game.name).all()
        wishes = (
            session.query(WishlistItem)
            .filter(WishlistItem.user_id == profile.id)
            .order_by(WishlistItem.name)
            .all()
        )

        # The wishlist gets the same treatment as the library: it holds the same
        # game titles, is shown on the same page, and leaving it behind would let
        # a wishlist entry and a library row disagree about the same game's name.
        game_plan, game_blocked = _plan_renames(games, lambda r, n: (n, r.system))
        wish_plan, wish_blocked = _plan_renames(wishes, lambda r, n: n)

        print(f"{len(games)} games, {len(wishes)} wishlist items for {username}\n")
        for label, planned, blocked in (
            ("games", game_plan, game_blocked),
            ("wishlist", wish_plan, wish_blocked),
        ):
            print(f"{len(planned)} {label} renames:")
            for row, new_name in planned:
                where = f"  ({row.system})" if label == "games" else ""
                print(f"  [{row.id}] {row.name}{where}")
                print(f"       -> {new_name}")
            if blocked:
                print(f"\n{len(blocked)} BLOCKED {label} (target name already exists):")
                for row, new_name in blocked:
                    print(f"  [{row.id}] {row.name} -> {new_name}")
            print()

        matched = {r.name for r, _ in game_plan + game_blocked + wish_plan + wish_blocked}
        unmatched = sorted(set(RENAMES) - matched)
        if unmatched:
            print(f"{len(unmatched)} mapping entries matched no row (already renamed?):")
            for name in unmatched:
                print(f"  {name}")

        if not apply_changes:
            print("\nPreview only. Re-run with --apply to write.")
            return
        if not (game_plan or wish_plan):
            print("\nNothing to apply.")
            return

        for row, new_name in game_plan + wish_plan:
            row.name = new_name
        session.commit()
        print(f"\nApplied. {len(game_plan)} games and {len(wish_plan)} wishlist items renamed.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user", required=True, help="username whose library to rename")
    parser.add_argument("--apply", action="store_true", help="write (default is preview)")
    args = parser.parse_args()
    run(args.user, args.apply)


if __name__ == "__main__":
    main()
