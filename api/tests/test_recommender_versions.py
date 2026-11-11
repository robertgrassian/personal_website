from recommender.versions import BUNDLE, PORT, build_main_game_index, canonical_ids


def _games(*rows: dict) -> dict[int, dict]:
    return {row["id"]: row for row in rows}


def _resolve(igdb_id: int, games: dict[int, dict]) -> list[int]:
    return canonical_ids(igdb_id, games, build_main_game_index(games))


def test_port_resolves_to_its_main_game():
    games = _games({"id": 1, "game_type": 0, "ports": [2]}, {"id": 2, "game_type": PORT})
    assert _resolve(2, games) == [1]


def test_main_game_stands_for_itself():
    games = _games({"id": 1, "game_type": 0, "ports": [2]}, {"id": 2, "game_type": PORT})
    assert _resolve(1, games) == [1]


def test_bundle_holding_a_port_resolves_through_it():
    games = _games(
        {"id": 1, "game_type": 0, "ports": [2]},
        {"id": 2, "game_type": PORT, "bundles": [10]},
        {"id": 3, "game_type": 0, "bundles": [10]},
        {"id": 10, "game_type": BUNDLE},
    )
    assert _resolve(10, games) == [1, 3]


def test_bundle_drops_its_dlc():
    games = _games(
        {"id": 1, "game_type": 0, "bundles": [10]},
        {"id": 4, "game_type": 1, "bundles": [10]},
        {"id": 10, "game_type": BUNDLE},
    )
    assert _resolve(10, games) == [1]


def test_unresolvable_port_stands_for_itself():
    games = _games({"id": 2, "game_type": PORT})
    assert _resolve(2, games) == [2]
