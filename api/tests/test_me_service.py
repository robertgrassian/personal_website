"""Unit tests for the pure parts of the /me service: onboarding username
validation, and what an add stores for a new catalog row (both no DB, no
network)."""

import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.models.game import MAX_GENRE_LENGTH, MAX_GENRES
from app.services import igdb as igdb_service
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


# A stand-in Session. Only rollback() is ever called on it: the service ends
# its read transaction before the Wikipedia lookup so a slow third party cannot
# hold a pooler connection idle-in-transaction, and every query these tests
# reach is stubbed at the repository.
def fake_db():
    return SimpleNamespace(rollback=lambda: None)


class TestFieldsForNewCatalogRow:
    """What an add stores for a new catalog row, and when it pays for a lookup.

    No DB and no network: the repository lookup, the genre service and the IGDB
    service are all stubbed, since what is under test is the decision between
    them.
    """

    @pytest.fixture
    def calls(self):
        return []

    @pytest.fixture
    def igdb_calls(self):
        return []

    @pytest.fixture
    def stub(self, monkeypatch, calls, igdb_calls):
        """Wire all three seams. `existing` is what the catalog lookup returns,
        `found` what Wikipedia answers, `platforms` the platforms on IGDB's
        record, and `igdb` replaces that record outright (None is a miss)."""

        def wire(*, existing=None, found=None, platforms=None, igdb=..., platform_name=True):
            monkeypatch.setattr(me_service.me_repo, "find_metadata", lambda db, **kw: existing)
            # Whether a console missing from IGDB's list is a real IGDB platform.
            monkeypatch.setattr(
                me_service.igdb_service, "is_platform_name", lambda db, name: platform_name
            )

            def fake_lookup(name):
                calls.append(name)
                return found or []

            monkeypatch.setattr(me_service.genre_service, "lookup_one", fake_lookup)

            record = (
                igdb_service.IgdbCatalogGame(
                    name="Chrono Trigger",
                    release_date=date(1995, 3, 11),
                    platforms=list(platforms or []),
                    genres=["Role-playing (RPG)"],
                    cover_url="https://images.igdb.com/igdb/image/upload/t_cover_big/co2mkh.jpg",
                )
                if igdb is ...
                else igdb
            )

            def fake_fetch(db, igdb_id):
                igdb_calls.append(igdb_id)
                if isinstance(record, Exception):
                    raise record
                return record

            monkeypatch.setattr(me_service.igdb_service, "fetch_catalog_game", fake_fetch)

        return wire

    def fields(self, *, igdb_id=1051, name="Chrono Trigger", system=None, from_client=None, **kw):
        return me_service._fields_for_new_catalog_row(
            fake_db(),
            user_id=uuid.uuid4(),
            igdb_id=igdb_id,
            name=name,
            system=system,
            genres=from_client if from_client is not None else ["Role-playing (RPG)"],
            release_date=kw.get("release_date"),
            image_url=kw.get("image_url"),
        )

    def source(self, **kw):
        """Just the genres, since most of the cases below are about those."""
        return self.fields(**kw).genres

    # --- what is trusted ---------------------------------------------------
    # The bug these exist for: a new SHARED row used to be built from the
    # payload, so the first adder of an IGDB game named it for everyone.

    def test_a_new_igdb_row_is_built_from_igdb_not_the_payload(self, stub, calls):
        stub(found=[])
        out = self.fields(
            name="anything",
            from_client=["Nonsense"],
            release_date=date(2001, 1, 1),
            image_url="https://images.igdb.com/igdb/image/upload/t_cover_big/co0000.jpg",
        )
        assert out.name == "Chrono Trigger"
        assert out.genres == ["Role-Playing"]
        assert out.release_date == date(1995, 3, 11)
        assert out.image_url.endswith("co2mkh.jpg")
        # And Wikipedia is asked about IGDB's title, not the payload's.
        assert calls == ["Chrono Trigger"]

    def test_an_id_igdb_does_not_know_is_refused(self, stub):
        stub(igdb=None)
        with pytest.raises(me_service.UnknownIgdbGameError):
            self.fields()

    @pytest.mark.parametrize(
        "error",
        [
            igdb_service.IgdbUpstreamError("IGDB answered 500"),
            igdb_service.IgdbNotConfiguredError(),
        ],
    )
    def test_an_igdb_that_cannot_answer_refuses_the_add(self, stub, error):
        """Falling back to the payload would reopen the hole whenever IGDB is down."""
        stub(igdb=error)
        with pytest.raises(me_service.CatalogUnverifiedError):
            self.fields()

    def test_a_hand_entered_game_keeps_what_its_owner_sent(self, stub, igdb_calls):
        # A private row, so nobody else inherits it and there is nothing to verify.
        stub()
        out = self.fields(igdb_id=None, name="Homebrew", release_date=date(2020, 1, 1))
        assert (out.name, out.release_date) == ("Homebrew", date(2020, 1, 1))
        assert igdb_calls == []

    def test_a_new_igdb_row_stores_wikipedias_genres(self, stub, calls):
        # The whole point: IGDB's coarse "Role-playing (RPG)" is replaced by the
        # infobox vocabulary the rest of the shelves already use.
        stub(found=["Role-Playing", "Time Travel"])
        assert self.source() == ["Role-Playing", "Time Travel"]
        assert calls == ["Chrono Trigger"]

    def test_an_existing_catalog_row_skips_the_lookup(self, stub, calls, igdb_calls):
        # The existing row is used untouched, so sourcing anything for it would
        # be requests thrown away. That is also why it needs no verifying: the
        # row was checked when it was created.
        stub(existing=object(), found=["Role-Playing"], platforms=["Super Nintendo"])
        assert self.fields() is None
        assert calls == []
        assert igdb_calls == []

    def test_an_existing_private_row_keeps_the_payload(self, stub, calls):
        # Private, so the payload is safe to hand on even if the row vanished.
        stub(existing=object(), found=["Role-Playing"])
        assert self.source(igdb_id=None, from_client=["Farm Life Sim"]) == ["Farm Life Sim"]
        assert calls == []

    def test_a_wikipedia_miss_falls_back_to_igdbs_genres(self, stub):
        """IGDB's, not the payload's, and normalized on the way through: IGDB
        says "Role-playing (RPG)" and the catalog stores the same spelling
        every Wikipedia-sourced row uses."""
        stub(found=[])
        assert self.source(from_client=["Nonsense"]) == ["Role-Playing"]

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

    def test_an_all_dropped_lookup_still_falls_back(self, stub):
        """The shaping runs BEFORE the emptiness check, so a lookup whose every
        value is dropped is a miss rather than a stored empty list. Truthy
        garbage in, client genres out."""
        stub(found=["x" * 60, "   "])
        assert self.source() == ["Role-Playing"]

    def test_sourced_genres_are_shaped_like_a_create_payload(self, stub):
        """They never pass through the create schema, so the cap and the
        per-genre length limit are applied here instead."""
        stub(found=["Puzzle", "puzzle", "x" * 60] + [f"Genre {i}" for i in range(20)])
        out = self.source()
        assert len(out) == MAX_GENRES
        assert out[:2] == ["Puzzle", "Genre 0"]
        assert not any(len(g) > MAX_GENRE_LENGTH for g in out)

    def test_client_genres_are_put_on_the_pipelines_spelling(self, stub, calls):
        """The hole this closes: hand-typed rows were the only ones skipping
        normalize_genre, so prod held "Beat 'em up" next to "Shoot 'em Up"."""
        stub(found=["Simulation"])
        assert self.source(igdb_id=None, from_client=["beat 'em up"]) == ["Beat 'em Up"]
        assert calls == []

    def test_a_genre_the_normalizer_rejects_is_kept_as_typed(self, stub):
        """Casing is corrected; values are not dropped. THEME_VALUES deliberately
        does not bite here, because silently discarding what the caller sent is
        the failure this fallback exists to avoid."""
        stub(found=[])
        assert self.source(igdb_id=None, from_client=["Iyashikei"]) == ["Iyashikei"]

    # --- platforms ---------------------------------------------------------
    # The regression these exist for: both add paths dropped `platforms` on the
    # floor, so every catalog row they created stored [] and only
    # scripts/backfill_platforms.py ever filled one in.

    def test_a_new_igdb_row_stores_igdbs_platforms(self, stub, igdb_calls):
        stub(platforms=["Nintendo Switch", "Super Nintendo Entertainment System"])
        assert self.fields(system="Nintendo Switch").platforms == [
            "Nintendo Switch",
            "Super Nintendo Entertainment System",
        ]
        assert igdb_calls == [1051]

    def test_a_hand_entered_game_stores_no_platforms(self, stub, igdb_calls):
        # There is no canonical platform list for a game IGDB has never heard
        # of, so this is the right answer rather than a gap.
        stub(platforms=["Nintendo Switch"])
        assert self.fields(igdb_id=None, from_client=["Farm Life Sim"]).platforms == []
        assert igdb_calls == []

    def test_a_game_igdb_lists_no_platforms_for_stores_none(self, stub):
        stub(platforms=[])
        assert self.fields().platforms == []

    def test_a_list_contradicting_the_recorded_console_is_dropped(self, stub):
        """IGDB not listing the console the caller says they own it on means
        the igdb_id landed on a variant. Storing that list would answer "which
        consoles are valid?" with a set excluding the owner's own."""
        stub(platforms=["iOS", "Mac"])
        assert self.fields(system="Nintendo Switch").platforms == []

    def test_free_text_cannot_blank_a_shared_rows_platforms(self, stub):
        """Not an IGDB platform, so it says nothing about which game the id is.
        Otherwise any adder could empty the column for every later one."""
        stub(platforms=["iOS", "Mac"], platform_name=False)
        assert self.fields(system="Bogus").platforms == ["iOS", "Mac"]

    def test_an_unavailable_platform_list_keeps_the_cautious_answer(self, stub):
        stub(platforms=["iOS", "Mac"], platform_name=None)
        assert self.fields(system="Nintendo Switch").platforms == []

    def test_no_recorded_console_has_nothing_to_contradict(self, stub):
        # The wishlist path, where naming a system is optional.
        stub(platforms=["iOS", "Mac"])
        assert self.fields(system=None).platforms == ["iOS", "Mac"]


class TestCatalogRowForAdd:
    def test_an_existing_shared_row_is_adopted_without_creating(self, monkeypatch):
        row = object()
        monkeypatch.setattr(me_service.me_repo, "find_metadata", lambda db, **kw: row)

        def create(*a, **kw):
            raise AssertionError("an existing row must not reach find_or_create_metadata")

        monkeypatch.setattr(me_service.me_repo, "find_or_create_metadata", create)
        out = me_service._catalog_row_for_add(
            fake_db(), user_id=uuid.uuid4(), igdb_id=1051, name="anything", sourced=None
        )
        assert out is row

    def test_a_shared_row_deleted_mid_add_is_not_rebuilt_from_the_payload(self, monkeypatch):
        monkeypatch.setattr(me_service.me_repo, "find_metadata", lambda db, **kw: None)
        with pytest.raises(me_service.CatalogUnverifiedError):
            me_service._catalog_row_for_add(
                fake_db(), user_id=uuid.uuid4(), igdb_id=1051, name="anything", sourced=None
            )


class TestPreviewCatalogEntry:
    """The add form's info popover. What matters is that it answers with what
    an add would STORE, not with a fresh opinion."""

    @pytest.fixture(autouse=True)
    def no_rate_limit(self, monkeypatch):
        # Charged against a real bucket in production; here it would need a DB.
        monkeypatch.setattr(me_service.rate_limit, "enforce", lambda *a, **kw: None)

    def preview(self, **kw):
        return me_service.preview_catalog_entry(
            fake_db(),
            SimpleNamespace(id=uuid.uuid4()),
            name=kw.get("name", "Chrono Trigger"),
            igdb_id=kw.get("igdb_id", 1051),
            genres=kw.get("genres", ["Role-playing (RPG)"]),
            release_date=kw.get("release_date", date(1995, 3, 11)),
        )

    def test_an_existing_row_is_shown_as_it_is(self, monkeypatch):
        """The add will reuse this row untouched, so previewing a fresh
        Wikipedia answer would show genres the game is not going to get."""
        row = SimpleNamespace(
            genres=["Role-Playing", "Time Travel"], release_date=date(1995, 3, 11)
        )
        monkeypatch.setattr(me_service.me_repo, "find_metadata", lambda db, **kw: row)
        monkeypatch.setattr(me_service.genre_service, "lookup_one", lambda name: ["Something Else"])
        out = self.preview()
        assert out.genres == ["Role-Playing", "Time Travel"]
        assert out.release_date == date(1995, 3, 11)

    def test_a_new_row_is_previewed_from_wikipedia(self, monkeypatch):
        monkeypatch.setattr(me_service.me_repo, "find_metadata", lambda db, **kw: None)
        monkeypatch.setattr(me_service.genre_service, "lookup_one", lambda name: ["Role-Playing"])
        out = self.preview(release_date=date(1995, 3, 11))
        assert out.genres == ["Role-Playing"]
        # No catalog row yet, so IGDB's date is the one that would be stored.
        assert out.release_date == date(1995, 3, 11)

    def test_it_agrees_with_what_the_add_would_store(self, monkeypatch):
        """The regression this class exists for: preview and write must not
        drift. Both go through _sourced_genres, so a change to one is a change
        to both."""
        monkeypatch.setattr(me_service.me_repo, "find_metadata", lambda db, **kw: None)
        monkeypatch.setattr(me_service.genre_service, "lookup_one", lambda name: ["Roguelike"])
        # IGDB's record matches what the preview was sent, as it does for the
        # add form, which posts a search result verbatim.
        monkeypatch.setattr(
            me_service.igdb_service,
            "fetch_catalog_game",
            lambda db, igdb_id: igdb_service.IgdbCatalogGame(
                name="Chrono Trigger",
                release_date=date(1995, 3, 11),
                platforms=["Windows"],
                genres=["Role-playing (RPG)"],
                cover_url="",
            ),
        )
        stored = me_service._fields_for_new_catalog_row(
            fake_db(),
            user_id=uuid.uuid4(),
            igdb_id=1051,
            name="Chrono Trigger",
            system=None,
            genres=["Role-playing (RPG)"],
            release_date=date(1995, 3, 11),
            image_url=None,
        )
        assert self.preview().genres == stored.genres
