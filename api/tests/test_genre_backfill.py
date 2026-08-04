"""Unit tests for the genre backfill's title-matching confidence.

Only the pure helpers are exercised; the script's DB and network work is driven
by hand from the command line.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from scripts.backfill_genres import (
    AUTO_ACCEPT,
    _changes,
    build_vocabulary,
    pending_writes,
    similarity,
    snap,
)


@pytest.mark.parametrize(
    "name,article",
    [
        ("Elden Ring", "Elden Ring"),
        # Wikipedia's disambiguation parenthetical is stripped before scoring,
        # so it must not push a correct match into review.
        ("Hades", "Hades (video game)"),
        ("It Takes Two", "It Takes Two (video game)"),
    ],
)
def test_confident_matches_are_auto_accepted(name, article):
    assert similarity(name, article) >= AUTO_ACCEPT


@pytest.mark.parametrize(
    "name,article",
    [
        # The whole reason the threshold sits just below 1.0: these are close
        # string matches and the WRONG game. Auto-accepting them would silently
        # write the sequel's genres onto the original.
        ("Octopath Traveller", "Octopath Traveler II"),
        ("Super Smash Bros 4", "Super Smash Bros. (video game)"),
        # Correct, but far apart as strings -- review confirms this cheaply.
        ("Halo CE", "Halo: Combat Evolved"),
    ],
)
def test_uncertain_matches_go_to_review(name, article):
    assert similarity(name, article) < AUTO_ACCEPT


def test_a_subtitled_article_is_confident_not_reviewed():
    """"Expedition 33" -> "Clair Obscur: Expedition 33" is correct: our title is
    wholly contained in the article's, with no series number in the remainder."""
    assert similarity("Expedition 33", "Clair Obscur: Expedition 33") >= AUTO_ACCEPT


def test_similarity_ignores_case_and_punctuation():
    assert similarity("pokemon: lets go, pikachu", "Pokémon Let's Go Pikachu") > 0.8


def test_similarity_is_zero_for_unrelated_titles():
    assert similarity("Tetris", "Grand Theft Auto V") < 0.4


# --- what --apply is allowed to write --------------------------------------


def entry(**overrides):
    base = {
        "id": 1,
        "user_id": "u1",
        "name": "A Game",
        "system": "PC",
        "current": ["RPG"],
        "proposed": ["Roguelike"],
        "status": "auto",
    }
    return {**base, **overrides}


@pytest.mark.parametrize("status", ["needs_review", "missing", "skipped"])
def test_only_decided_rows_are_written(status):
    """The guard standing between an undecided lookup and a production UPDATE."""
    plan = {"entries": [entry(status=status)]}
    assert pending_writes(plan) == []


@pytest.mark.parametrize("status", ["auto", "approved"])
def test_decided_rows_are_written(status):
    plan = {"entries": [entry(status=status)]}
    assert len(pending_writes(plan)) == 1


def test_empty_proposal_never_blanks_out_existing_genres():
    """A lookup that found nothing must not erase curated genres."""
    assert _changes(entry(proposed=[])) is False
    assert pending_writes({"entries": [entry(proposed=[], status="auto")]}) == []


def test_unchanged_rows_are_not_rewritten():
    assert _changes(entry(current=["RPG"], proposed=["RPG"])) is False


def test_reordering_counts_as_a_change():
    """Genre order is preserved on the shelf, so it is a real difference."""
    assert _changes(entry(current=["RPG", "Puzzle"], proposed=["Puzzle", "RPG"])) is True


def test_changes_returns_a_real_bool():
    assert _changes(entry(proposed=[])) is False


# --- snapping onto the library's existing spellings -------------------------


def test_vocabulary_prefers_the_librarys_existing_spelling():
    games = [
        {"current": ["First Person Shooter"]},
        {"current": ["First Person Shooter"]},
        {"current": ["Life simulation"]},
    ]
    vocab = build_vocabulary(games)
    # Wikidata's hyphenated and capitalized spellings collapse onto the ones
    # already on the shelves, instead of joining them in the filter dropdown.
    assert snap(["First-Person Shooter"], vocab) == ["First Person Shooter"]
    assert snap(["Life Simulation"], vocab) == ["Life simulation"]


def test_vocabulary_breaks_ties_by_frequency():
    games = [
        {"current": ["Third-person Shooter"]},
        {"current": ["Third-person Shooter"]},
        {"current": ["Third-Person Shooter"]},
    ]
    vocab = build_vocabulary(games)
    assert snap(["third person shooter"], vocab) == ["Third-person Shooter"]


def test_genuinely_new_genres_pass_through_unchanged():
    vocab = build_vocabulary([{"current": ["RPG"]}])
    assert snap(["Metroidvania"], vocab) == ["Metroidvania"]


def test_snapping_does_not_merge_distinct_genres():
    """Loose matching is spelling-only: "Platform" and "Platformer" are
    different terms and must stay that way."""
    vocab = build_vocabulary([{"current": ["Platform"]}])
    assert snap(["Platformer"], vocab) == ["Platformer"]
