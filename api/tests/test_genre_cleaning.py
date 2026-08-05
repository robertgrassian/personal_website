"""Unit tests for clean_genres, the shared genre validator on the write path.

No DB or network: this is pure schema-level input cleaning, applied by both
GameCreate and WishlistCreate.
"""

import pytest

from app.schemas.me import GameCreate, clean_genres


def test_trims_and_drops_blanks():
    assert clean_genres(["  RPG ", "", "   ", "Puzzle"]) == ["RPG", "Puzzle"]


def test_dedupes_case_insensitively_keeping_first_spelling():
    """The shelf filter builds its dropdown from a Set of the raw strings, so
    "RPG" and "rpg" surfaced as two separate filter options."""
    assert clean_genres(["RPG", "rpg", "Rpg"]) == ["RPG"]
    assert clean_genres(["rpg", "RPG"]) == ["rpg"]


def test_dedupes_exact_duplicates():
    assert clean_genres(["RPG", "RPG"]) == ["RPG"]


def test_dedupes_after_trimming():
    assert clean_genres(["RPG", "  RPG  "]) == ["RPG"]


def test_preserves_order_of_distinct_genres():
    assert clean_genres(["Roguelike", "Puzzle", "RPG"]) == ["Roguelike", "Puzzle", "RPG"]


def test_rejects_overlong_genre():
    with pytest.raises(ValueError, match="50 characters"):
        clean_genres(["x" * 51])


def test_length_cap_applies_after_trimming():
    """A value that is only overlong because of padding is fine."""
    assert clean_genres(["  " + "x" * 50 + "  "]) == ["x" * 50]


def test_applied_through_the_game_create_schema():
    """The validator is wired into the real payload, not just callable."""
    game = GameCreate(name="Hades II", system="PC", genres=["Roguelike", "roguelike", " RPG "])
    assert game.genres == ["Roguelike", "RPG"]


def test_genre_count_is_capped():
    """The backfill writes through clean_genres without going via
    GameCreate, so the count guard has to live here too."""
    assert len(clean_genres([f"Genre{i}" for i in range(40)])) == 12
