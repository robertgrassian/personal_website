"""Unit tests for the pure parts of the /me service: onboarding username
validation, and which genres an add stores (both no DB, no network)."""

import uuid

import pytest

from app.models.game import MAX_GENRE_LENGTH, MAX_GENRES
from app.services import me as me_service
from app.services.me import RESERVED_USERNAMES, UsernameError, _validate_username


class TestValidateUsername:
    def test_valid_username_passes_through(self):
        assert _validate_username("cool_gamer-7") == "cool_gamer-7"

    def test_lowercases_and_trims(self):
        # citext makes uniqueness case-insensitive; we store the canonical
        # lowercase form so the DB CHECK (lowercase-only) is satisfied.
        assert _validate_username("  MixedCase  ") == "mixedcase"

    def test_too_short_is_format_error(self):
        with pytest.raises(UsernameError) as exc:
            _validate_username("ab")
        assert exc.value.reason == "format"

    def test_too_long_is_format_error(self):
        with pytest.raises(UsernameError) as exc:
            _validate_username("a" * 31)
        assert exc.value.reason == "format"

    def test_leading_hyphen_is_format_error(self):
        # Must start with a letter or digit.
        with pytest.raises(UsernameError) as exc:
            _validate_username("-nope")
        assert exc.value.reason == "format"

    def test_illegal_characters_are_format_error(self):
        for bad in ("has space", "dot.dot", "emoji😀x", "slash/y"):
            with pytest.raises(UsernameError) as exc:
                _validate_username(bad)
            assert exc.value.reason == "format", bad

    def test_reserved_username_is_rejected(self):
        # "search" collides with the /users/search route; "rgrassian" is the
        # seeded founder handle. (Shorter reserved names like
        # "me" can never be reached — they fail the 3-char minimum first — which
        # is fine: they're un-creatable either way.)
        for reserved in ("search", "rgrassian", "robert", "admin", "library"):
            with pytest.raises(UsernameError) as exc:
                _validate_username(reserved)
            assert exc.value.reason == "reserved", reserved

    def test_every_reserved_name_covers_both_spellings(self):
        # The invariant, asserted over the whole set rather than a few literals:
        # USERNAME_RE accepts "_" and "-" alike, so a name reserved in one
        # spelling stays claimable in the other. Checking the set itself means a
        # name added later in either spelling is covered without anyone
        # remembering this rule. Membership rather than _validate_username here,
        # since short entries like "u" fail the 3-char minimum first and raise
        # "format" before the reserved check ever runs.
        for reserved in RESERVED_USERNAMES:
            assert reserved.replace("_", "-") in RESERVED_USERNAMES, reserved
            assert reserved.replace("-", "_") in RESERVED_USERNAMES, reserved

    def test_kebab_and_snake_route_names_are_both_rejected(self):
        # The regression that motivated the rule: only "video_games" was listed,
        # leaving "video-games" claimable after the routes moved to kebab-case —
        # the spelling that now matches a real URL.
        for reserved in (
            "video_games",
            "video-games",
            "currently_playing",
            "currently-playing",
        ):
            with pytest.raises(UsernameError) as exc:
                _validate_username(reserved)
            assert exc.value.reason == "reserved", reserved

    def test_reserved_check_is_case_insensitive(self):
        # Lowercased first, so "SEARCH" hits the reserved set too.
        with pytest.raises(UsernameError) as exc:
            _validate_username("SEARCH")
        assert exc.value.reason == "reserved"


class TestGenresForNewCatalogRow:
    """Which genres an add stores, and when it pays for a Wikipedia lookup.

    No DB and no network: the repository lookup and the genre service are both
    stubbed, since what is under test is the decision between them.
    """

    @pytest.fixture
    def calls(self):
        return []

    @pytest.fixture
    def stub(self, monkeypatch, calls):
        """Wire both seams. `existing` is what the catalog lookup returns;
        `found` is what Wikipedia answers."""

        def wire(*, existing=None, found=None):
            monkeypatch.setattr(me_service.me_repo, "find_metadata", lambda db, **kw: existing)

            def fake_lookup(name):
                calls.append(name)
                return found or []

            monkeypatch.setattr(me_service.genre_service, "lookup_one", fake_lookup)

        return wire

    def source(self, *, igdb_id=1051, name="Chrono Trigger", from_client=None):
        return me_service._genres_for_new_catalog_row(
            None,
            user_id=uuid.uuid4(),
            igdb_id=igdb_id,
            name=name,
            from_client=from_client if from_client is not None else ["Role-playing (RPG)"],
        )

    def test_a_new_igdb_row_stores_wikipedias_genres(self, stub, calls):
        # The whole point: IGDB's coarse "Role-playing (RPG)" is replaced by the
        # infobox vocabulary the rest of the shelves already use.
        stub(found=["Role-Playing", "Time Travel"])
        assert self.source() == ["Role-Playing", "Time Travel"]
        assert calls == ["Chrono Trigger"]

    def test_an_existing_catalog_row_skips_the_lookup(self, stub, calls):
        # find_or_create_metadata returns the existing row untouched, so
        # sourcing genres for it would be two requests thrown away.
        stub(existing=object(), found=["Role-Playing"])
        assert self.source() == ["Role-playing (RPG)"]
        assert calls == []

    def test_a_wikipedia_miss_falls_back_to_the_clients_genres(self, stub):
        stub(found=[])
        assert self.source() == ["Role-playing (RPG)"]

    def test_a_hand_entered_game_keeps_the_typed_genres(self, stub, calls):
        # A private catalog row is the caller's to name; overriding it would be
        # the silent discard this path exists to avoid.
        stub(found=["Simulation"])
        assert self.source(igdb_id=None, from_client=["Farm Life Sim"]) == ["Farm Life Sim"]
        assert calls == []

    def test_a_hand_entered_game_with_no_genres_is_looked_up(self, stub, calls):
        stub(found=["Puzzle"])
        assert self.source(igdb_id=None, name="Obscure Thing", from_client=[]) == ["Puzzle"]
        assert calls == ["Obscure Thing"]

    def test_sourced_genres_are_shaped_like_a_create_payload(self, stub):
        """They never pass through the create schema, so the cap and the
        per-genre length limit are applied here instead."""
        stub(found=["Puzzle", "puzzle", "x" * 60] + [f"Genre {i}" for i in range(20)])
        out = self.source()
        assert len(out) == MAX_GENRES
        assert out[:2] == ["Puzzle", "Genre 0"]
        assert not any(len(g) > MAX_GENRE_LENGTH for g in out)
