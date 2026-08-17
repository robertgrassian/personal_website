"""Unit tests for the variant-repoint script's candidate choice.

Only the pure helper is exercised; the DB and network work is driven by hand
from the command line, same as the genre backfill.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from scripts.repoint_variant_rows import REPOINTS, choose_candidate, choose_name

# Two IGDB rows for one game, which is why candidates are a list at all: the
# 1998 PC release and the remaster that carries every later platform.
GRIM = {
    181: {"platforms": ["PC (Microsoft Windows)"]},
    8682: {"platforms": ["Nintendo Switch", "PC (Microsoft Windows)", "PlayStation 4"]},
}


def test_first_candidate_wins_when_it_covers_the_recorded_console():
    assert choose_candidate((181, 8682), {"PC (Microsoft Windows)"}, GRIM) == (181, "")


def test_falls_through_to_the_candidate_that_lists_the_recorded_console():
    """The whole reason order is "widest first" rather than "only one": the
    canonical row is preferred, but a console only the later row lists must
    still resolve instead of blocking."""
    assert choose_candidate((181, 8682), {"Nintendo Switch"}, GRIM) == (8682, "")


def test_no_candidate_covering_the_console_is_refused_not_guessed():
    """The failure mode this script exists to undo. Writing the closest match
    is what put a row on Dead Cells+ in the first place."""
    chosen, why = choose_candidate((181, 8682), {"Nintendo GameCube"}, GRIM)
    assert chosen is None
    assert "Nintendo GameCube" in why


def test_a_candidate_igdb_knows_nothing_about_is_skipped():
    chosen, why = choose_candidate((999999, 8682), {"Nintendo Switch"}, GRIM)
    assert chosen == 8682
    chosen, why = choose_candidate((999999,), {"Nintendo Switch"}, GRIM)
    assert chosen is None
    assert "nothing" in why


def test_a_row_nobody_recorded_a_console_for_takes_the_first_candidate():
    """Wishlist entries may carry no system at all, so an empty recorded set is
    normal and must not read as "no evidence, refuse"."""
    assert choose_candidate((181, 8682), set(), GRIM) == (181, "")


def test_every_mapped_title_has_at_least_one_candidate():
    assert all(REPOINTS.values())


@pytest.mark.parametrize(
    "stored,igdb_name,expected",
    [
        # The edition the verified id actually points at, named as IGDB names it.
        ("Disco Elysium", "Disco Elysium: The Final Cut", "Disco Elysium: The Final Cut"),
        ("Grim Fandango", "Grim Fandango Remastered", "Grim Fandango Remastered"),
        # An informal shelf name giving way to the canonical one is an
        # improvement, not a loss -- accepted 2026-08-17.
        ("Halo CE", "Halo: Combat Evolved", "Halo: Combat Evolved"),
        # The common case by far: the id was wrong, the name already right.
        ("Metroid Dread", "Metroid Dread", "Metroid Dread"),
        # IGDB rows can be missing a name; never blank the shelf entry.
        ("Dead Cells", "", "Dead Cells"),
    ],
)
def test_choose_name(stored, igdb_name, expected):
    assert choose_name(stored, igdb_name) == expected
