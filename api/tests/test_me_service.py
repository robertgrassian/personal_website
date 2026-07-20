"""Unit tests for the onboarding username validation (pure, no DB)."""

import pytest

from app.services.me import UsernameError, _validate_username


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
        # "search" collides with the /users/search route (spec §4.2);
        # "rgrassian" is the seeded founder handle. (Shorter reserved names like
        # "me" can never be reached — they fail the 3-char minimum first — which
        # is fine: they're un-creatable either way.)
        for reserved in ("search", "rgrassian", "robert", "admin", "library"):
            with pytest.raises(UsernameError) as exc:
                _validate_username(reserved)
            assert exc.value.reason == "reserved", reserved

    def test_reserved_check_is_case_insensitive(self):
        # Lowercased first, so "SEARCH" hits the reserved set too.
        with pytest.raises(UsernameError) as exc:
            _validate_username("SEARCH")
        assert exc.value.reason == "reserved"
