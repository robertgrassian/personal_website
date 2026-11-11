"""Fetch the IGDB side of the snapshot: features for every library game, its
`similar_games`, and the candidate pool. Run from api/:

    uv run python -m recommender.snapshot

Reads recommender/snapshot/games.json and wishlist.json (the public library
read) and writes igdb_games.json and pool.json beside them. Everything after
this step runs offline against those files.
"""

import json
import time
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import get_settings
from app.services.igdb import _fetch_twitch_token, _query_igdb
from recommender.versions import (
    KEPT_GAME_TYPES,
    build_main_game_index,
    canonical_ids,
    unresolved_versions,
)

SNAPSHOT_DIR = Path(__file__).parent / "snapshot"

_GAMES_URL = "https://api.igdb.com/v4/games"
_PLATFORMS_URL = "https://api.igdb.com/v4/platforms"

# Half IGDB's 4/s, leaving the rest for the live site, which shares the client id.
_MIN_INTERVAL = 0.5
_MAX_RETRIES = 5
_BATCH = 500  # IGDB's per-query row limit

# Names rather than ids for the feature fields, so a vector is inspectable.
_FIELDS = (
    "fields name, cover.url, first_release_date, game_type,"
    " genres.name, themes.name, player_perspectives.name, game_modes.name, keywords.name,"
    " involved_companies.company.name, involved_companies.developer,"
    " franchises.name, collections.name, platforms.name,"
    " similar_games, remakes, remasters, expanded_games, version_parent, parent_game,"
    " ports, bundles,"
    " total_rating, total_rating_count, hypes;"
)

POPULAR_PER_PLATFORM = 500
UPCOMING_LIMIT = 200


class Igdb:
    """One token per run and a fixed request spacing, with backoff on 429."""

    def __init__(self) -> None:
        self.settings = get_settings()
        if not self.settings.twitch_client_id or not self.settings.twitch_client_secret:
            raise SystemExit("TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET missing from .env")
        self.token, _ = _fetch_twitch_token(self.settings)
        self._last = 0.0
        self.requests = 0

    def query(self, body: str, url: str = _GAMES_URL) -> list[dict]:
        for attempt in range(_MAX_RETRIES):
            wait = self._last + _MIN_INTERVAL - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.requests += 1
            response = _query_igdb(self.settings, self.token, body, url, timeout=30)
            if response.status_code == 429:
                time.sleep(2**attempt)
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError(f"IGDB still rate-limiting after {_MAX_RETRIES} tries")

    def games_by_id(self, ids: set[int]) -> list[dict]:
        rows: list[dict] = []
        ordered = sorted(ids)
        for start in range(0, len(ordered), _BATCH):
            chunk = ",".join(map(str, ordered[start : start + _BATCH]))
            rows += self.query(f"{_FIELDS} where id = ({chunk}); limit {_BATCH};")
        return rows


def _id_list(values: list[int]) -> str:
    return "(" + ",".join(map(str, values)) + ")"


def build_snapshot(snapshot_dir: Path = SNAPSHOT_DIR) -> None:
    games = json.loads((snapshot_dir / "games.json").read_text())
    wishlist = json.loads((snapshot_dir / "wishlist.json").read_text())
    igdb = Igdb()
    now = datetime.now(UTC)

    # 1. Platform ids for the systems the user has played on.
    systems = sorted({g["system"] for g in games})
    names = ",".join(json.dumps(s) for s in systems)
    platform_rows = igdb.query(
        f"fields id, name; where name = ({names}); limit 500;", _PLATFORMS_URL
    )
    platforms = {row["name"]: row["id"] for row in platform_rows}
    unmatched = [s for s in systems if s not in platforms]
    if unmatched:
        print(f"systems with no IGDB platform, ignored: {unmatched}")
    platform_ids = sorted(platforms.values())
    # Filtered in the queries too, so DLC and bundles don't spend the 500 slots.
    types = _id_list(list(KEPT_GAME_TYPES))

    rows: dict[int, dict] = {}

    def keep(new_rows: list[dict]) -> list[int]:
        for row in new_rows:
            rows[row["id"]] = row
        return [row["id"] for row in new_rows]

    # 2. Popular: top N per platform by rating count.
    popular: set[int] = set()
    for name, platform_id in sorted(platforms.items()):
        ids = keep(
            igdb.query(
                f"{_FIELDS} where platforms = ({platform_id}) & game_type = {types}"
                f" & total_rating_count > 0;"
                f" sort total_rating_count desc; limit {POPULAR_PER_PLATFORM};"
            )
        )
        popular.update(ids)
        print(f"popular {name}: {len(ids)}")

    # 3. Upcoming: unreleased, or undated but hyped.
    stamp = int(now.timestamp())
    upcoming = keep(
        igdb.query(
            f"{_FIELDS} where platforms = {_id_list(platform_ids)} & game_type = {types}"
            f" & (first_release_date > {stamp} | (first_release_date = null & hypes > 0));"
            f" sort hypes desc; limit {UPCOMING_LIMIT};"
        )
    )
    print(f"upcoming: {len(upcoming)}")

    # 4. Every library and wishlist game, then everything they list as similar.
    # All library games, not only positives: the harness holds each out in
    # turn and rebuilds the neighbour pool from the rest.
    owned = {g["igdbId"] for g in [*games, *wishlist] if g["igdbId"] is not None}
    keep(igdb.games_by_id(owned - rows.keys()))

    # 5. The main games behind any owned port or bundle, which IGDB links only
    # from the main game's side, so they have to be searched for. Repeated
    # because a bundle can hold a port, whose main game is one more hop away.
    frontier = owned
    for _ in range(4):
        ports, bundles = unresolved_versions(frontier, rows)
        if not ports and not bundles:
            break
        clauses = [f"ports = {_id_list(ports)}"] if ports else []
        clauses += [f"bundles = {_id_list(bundles)}"] if bundles else []
        frontier = set(keep(igdb.query(f"{_FIELDS} where {' | '.join(clauses)}; limit {_BATCH};")))
    index = build_main_game_index(rows)
    library_ids = {
        c for g in games if g["igdbId"] is not None for c in canonical_ids(g["igdbId"], rows, index)
    }

    similar = {s for i in library_ids if i in rows for s in rows[i].get("similar_games", [])}
    keep(igdb.games_by_id(similar - rows.keys()))
    print(f"library + wishlist: {len(owned)}, similar_games: {len(similar)}")

    (snapshot_dir / "igdb_games.json").write_text(json.dumps(list(rows.values())))
    (snapshot_dir / "pool.json").write_text(
        json.dumps(
            {
                # The released/upcoming split is judged against this, not the
                # wall clock, so an old snapshot replays the same way.
                "fetched_at": now.isoformat(),
                "platforms": platforms,
                "popular": sorted(popular),
                "upcoming": upcoming,
            },
            indent=1,
        )
    )
    print(f"{len(rows)} games cached in {igdb.requests} requests")


if __name__ == "__main__":
    build_snapshot()
