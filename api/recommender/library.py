"""A user's library as the recommender sees it, loaded from a snapshot.

The snapshot is the public read's JSON (GET /users/{username}/games and
/wishlist), saved to disk, so this needs no database and no credentials.
"""

import json
from dataclasses import dataclass
from pathlib import Path

# S=4 down to F=0, mirroring RATINGS' order in src/lib/games.ts.
RATING_SCORES = {"Perfect": 4, "Great": 3, "Good": 2, "Okay": 1, "Bad": 0}


@dataclass(frozen=True)
class LibraryGame:
    id: int  # played_games.id, what `because` will reference
    name: str
    igdb_id: int | None  # None = hand-entered, no IGDB features
    system: str
    rating: str  # "" = unrated

    @property
    def score(self) -> int | None:
        return RATING_SCORES.get(self.rating)


@dataclass(frozen=True)
class WishlistEntry:
    name: str
    igdb_id: int | None


@dataclass(frozen=True)
class Library:
    played: list[LibraryGame]
    wishlist: list[WishlistEntry]

    @property
    def rated(self) -> list[LibraryGame]:
        """Rated, IGDB-backed games: the only ones the taste model can use."""
        return [g for g in self.played if g.score is not None and g.igdb_id is not None]


def load_library(snapshot_dir: Path) -> Library:
    games = json.loads((snapshot_dir / "games.json").read_text())
    wishlist = json.loads((snapshot_dir / "wishlist.json").read_text())
    return Library(
        played=[
            LibraryGame(
                id=g["id"],
                name=g["name"],
                igdb_id=g["igdbId"],
                system=g["system"],
                rating=g["rating"],
            )
            for g in games
        ],
        wishlist=[WishlistEntry(name=w["name"], igdb_id=w["igdbId"]) for w in wishlist],
    )


def is_eligible(library: Library) -> bool:
    """10+ rated IGDB-backed games using at least 2 distinct ratings; with one
    rating, centering makes every weight zero."""
    rated = library.rated
    return len(rated) >= 10 and len({g.rating for g in rated}) >= 2
