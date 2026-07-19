"""Unit tests for the seed script's pure parsing/validation functions."""

from datetime import date

from scripts.seed import (
    parse_game_rows,
    parse_wishlist_rows,
    resolve_session_rows,
    split_genres,
)


def game_row(**overrides) -> dict:
    row = {
        "name": "Astro Bot",
        "system": "PS5",
        "rating": "Great",
        "genre": "Platform",
        "release_date": "2024-09-06",
        "image_url": "https://example.test/astro.jpg",
    }
    row.update(overrides)
    return row


class TestSplitGenres:
    def test_splits_on_pipe_and_strips(self):
        assert split_genres(" Metroidvania | Puzzle ") == ["Metroidvania", "Puzzle"]

    def test_empty_string_yields_no_genres(self):
        assert split_genres("") == []

    def test_drops_blank_segments(self):
        assert split_genres("RPG||") == ["RPG"]


class TestParseGameRows:
    def test_valid_row(self):
        warnings: list[str] = []
        [parsed] = parse_game_rows([game_row()], warnings)
        assert parsed["rating"] == "Great"
        assert parsed["release_date"] == date(2024, 9, 6)
        assert warnings == []

    def test_unknown_rating_warns_and_stores_none(self):
        warnings: list[str] = []
        [parsed] = parse_game_rows([game_row(rating="Amazing")], warnings)
        assert parsed["rating"] is None
        assert len(warnings) == 1
        assert "Amazing" in warnings[0]

    def test_empty_rating_is_unrated_without_warning(self):
        warnings: list[str] = []
        [parsed] = parse_game_rows([game_row(rating="")], warnings)
        assert parsed["rating"] is None
        assert warnings == []

    def test_nameless_row_skipped_with_warning(self):
        warnings: list[str] = []
        assert parse_game_rows([game_row(name="  ")], warnings) == []
        assert len(warnings) == 1

    def test_missing_system_warns_but_keeps_row(self):
        warnings: list[str] = []
        [parsed] = parse_game_rows([game_row(system="")], warnings)
        assert parsed["system"] == ""
        assert len(warnings) == 1

    def test_empty_optional_fields_become_none(self):
        [parsed] = parse_game_rows([game_row(release_date="", image_url="")], [])
        assert parsed["release_date"] is None
        assert parsed["image_url"] is None

    def test_malformed_release_date_warns_and_stores_none(self):
        warnings: list[str] = []
        [parsed] = parse_game_rows([game_row(release_date="09/06/2024")], warnings)
        assert parsed["release_date"] is None
        assert len(warnings) == 1
        assert "09/06/2024" in warnings[0]


class TestResolveSessionRows:
    def test_resolves_by_exact_name(self):
        rows = [{"game": "Palworld", "start_date": "2026-07-17", "end_date": ""}]
        resolved, errors = resolve_session_rows(rows, {"Palworld": [42]})
        assert errors == []
        assert resolved == [
            {"game_id": 42, "start_date": date(2026, 7, 17), "end_date": None}
        ]

    def test_closed_session_parses_end_date(self):
        rows = [{"game": "Mixtape", "start_date": "2026-06-20", "end_date": "2026-06-30"}]
        [resolved], _ = resolve_session_rows(rows, {"Mixtape": [7]})
        assert resolved["end_date"] == date(2026, 6, 30)

    def test_unknown_name_is_an_error(self):
        rows = [{"game": "Not In Library", "start_date": "2026-01-01", "end_date": ""}]
        resolved, errors = resolve_session_rows(rows, {"Palworld": [42]})
        assert resolved == []
        assert len(errors) == 1
        assert "matches no game" in errors[0]

    def test_ambiguous_name_is_an_error(self):
        rows = [{"game": "Doom", "start_date": "2026-01-01", "end_date": ""}]
        resolved, errors = resolve_session_rows(rows, {"Doom": [1, 2]})
        assert resolved == []
        assert len(errors) == 1
        assert "ambiguous" in errors[0]

    def test_malformed_start_date_is_an_error_not_a_crash(self):
        rows = [{"game": "Palworld", "start_date": "not-a-date", "end_date": ""}]
        resolved, errors = resolve_session_rows(rows, {"Palworld": [42]})
        assert resolved == []
        assert len(errors) == 1
        assert "not-a-date" in errors[0]

    def test_missing_start_date_is_an_error(self):
        rows = [{"game": "Palworld", "start_date": "", "end_date": ""}]
        resolved, errors = resolve_session_rows(rows, {"Palworld": [42]})
        assert resolved == []
        assert errors == ['[sessions.csv] Row 2: "Palworld" has no start_date']

    def test_all_problems_in_a_row_are_collected(self):
        # An unknown name AND a bad date report together — one run, full report.
        rows = [{"game": "Ghost", "start_date": "bad", "end_date": ""}]
        resolved, errors = resolve_session_rows(rows, {"Palworld": [42]})
        assert resolved == []
        assert len(errors) == 2


class TestParseWishlistRows:
    def wishlist_row(self, **overrides) -> dict:
        row = {
            "name": "Bloodborne",
            "system": "PlayStation 4",
            "genre": "Soulslike|Action RPG",
            "release_date": "2015-03-24",
            "image_url": "https://example.test/bb.jpg",
            "starred": "true",
            "date_added": "2026-04-17",
            "notes": "",
        }
        row.update(overrides)
        return row

    def test_starred_true_only_for_literal_true(self):
        # Exact parity with wishlistServer.ts (=== "true", case-sensitive):
        # only the literal lowercase "true" counts.
        [parsed] = parse_wishlist_rows([self.wishlist_row(starred="true")], [])
        assert parsed["starred"] is True

    def test_starred_false_when_empty_or_not_literal_true(self):
        for raw in ("", "false", "TRUE", "yes"):
            [parsed] = parse_wishlist_rows([self.wishlist_row(starred=raw)], [])
            assert parsed["starred"] is False, f"starred={raw!r}"

    def test_missing_date_added_falls_back_to_today(self):
        [parsed] = parse_wishlist_rows([self.wishlist_row(date_added="")], [])
        assert parsed["date_added"] == date.today()

    def test_empty_system_becomes_none_but_notes_stay_text(self):
        [parsed] = parse_wishlist_rows([self.wishlist_row(system="", notes="")], [])
        assert parsed["system"] is None
        assert parsed["notes"] == ""
