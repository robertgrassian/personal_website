"""Resolve a library entry that is a port or bundle to the main game(s) behind it.

IGDB links these only from the main game's side (`ports`, `bundles`), so a
library holding the PC port of Minecraft has no field pointing at Minecraft.
Without this, owning the port would not exclude the main game, and holding
the port out in the harness could never score a hit.
"""

BUNDLE = 3
PORT = 11

# Main game, standalone expansion, remake, remaster, expanded game: the types
# that can be recommended, and so the ones a version resolves to.
KEPT_GAME_TYPES = (0, 4, 8, 9, 10)

_MAX_DEPTH = 4


def build_main_game_index(games: dict[int, dict]) -> dict[int, list[int]]:
    """port or bundle id -> ids of the games that list it."""
    index: dict[int, list[int]] = {}
    for game in games.values():
        for version_id in [*game.get("ports", []), *game.get("bundles", [])]:
            index.setdefault(version_id, []).append(game["id"])
    for ids in index.values():
        ids.sort()
    return index


def unresolved_versions(ids: set[int], games: dict[int, dict]) -> tuple[list[int], list[int]]:
    """(ports, bundles) among ids, for the snapshot to look up."""
    types = {i: games.get(i, {}).get("game_type") for i in ids}
    return sorted(i for i, t in types.items() if t == PORT), sorted(
        i for i, t in types.items() if t == BUNDLE
    )


def canonical_ids(igdb_id: int, games: dict[int, dict], index: dict[int, list[int]]) -> list[int]:
    """The ids that stand for this game: its main game(s) if it is a port or
    bundle, otherwise itself. Recursive, since a bundle can hold a port. A
    bundle's DLC is dropped; a version IGDB cannot resolve stands for itself."""

    def resolve(game_id: int, depth: int) -> list[int]:
        if games.get(game_id, {}).get("game_type") not in (PORT, BUNDLE) or depth == _MAX_DEPTH:
            return [game_id]
        found: list[int] = []
        for parent in index.get(game_id, []):
            parent_type = games.get(parent, {}).get("game_type")
            if parent_type in (PORT, BUNDLE):
                found += resolve(parent, depth + 1)
            elif parent_type in KEPT_GAME_TYPES:
                found.append(parent)
        return sorted(set(found)) or [game_id]

    return resolve(igdb_id, 0)
