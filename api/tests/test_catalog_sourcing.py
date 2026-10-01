"""Unit tests for what an add stores for a new catalog row, and the preview of
it (no DB, no network)."""

import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.models.game import MAX_GENRE_LENGTH, MAX_GENRES
from app.services import catalog_sourcing
from app.services import igdb as igdb_service


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
            monkeypatch.setattr(
                catalog_sourcing.me_repo, "find_metadata", lambda db, **kw: existing
            )
            # Whether a console missing from IGDB's list is a real IGDB platform.
            monkeypatch.setattr(
                catalog_sourcing.igdb_service, "is_platform_name", lambda db, name: platform_name
            )

            def fake_lookup(name):
                calls.append(name)
                return found or []

            monkeypatch.setattr(catalog_sourcing.genre_service, "lookup_one", fake_lookup)

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

            monkeypatch.setattr(catalog_sourcing.igdb_service, "fetch_catalog_game", fake_fetch)

        return wire

    def fields(
        self, *, igdb_id=1051, name="Chrono Trigger", system=None, payload_genres=None, **kw
    ):
        return catalog_sourcing.fields_for_new_catalog_row(
            fake_db(),
            user_id=uuid.uuid4(),
            igdb_id=igdb_id,
            name=name,
            system=system,
            genres=payload_genres if payload_genres is not None else ["Role-playing (RPG)"],
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
            payload_genres=["Nonsense"],
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
        with pytest.raises(catalog_sourcing.UnknownIgdbGameError):
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
        with pytest.raises(catalog_sourcing.CatalogUnverifiedError):
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
        assert self.source(igdb_id=None, payload_genres=["Farm Life Sim"]) == ["Farm Life Sim"]
        assert calls == []

    def test_a_wikipedia_miss_falls_back_to_igdbs_genres(self, stub):
        """IGDB's, not the payload's, and normalized on the way through: IGDB
        says "Role-playing (RPG)" and the catalog stores the same spelling
        every Wikipedia-sourced row uses."""
        stub(found=[])
        assert self.source(payload_genres=["Nonsense"]) == ["Role-Playing"]

    def test_a_hand_entered_game_keeps_the_typed_genres(self, stub, calls):
        # A private catalog row is the caller's to name; overriding it would be
        # the silent discard this path exists to avoid.
        stub(found=["Simulation"])
        assert self.source(igdb_id=None, payload_genres=["Farm Life Sim"]) == ["Farm Life Sim"]
        assert calls == []

    def test_a_hand_entered_game_with_no_genres_is_looked_up(self, stub, calls):
        stub(found=["Puzzle"])
        assert self.source(igdb_id=None, name="Obscure Thing", payload_genres=[]) == ["Puzzle"]
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
        assert self.source(igdb_id=None, payload_genres=["beat 'em up"]) == ["Beat 'em Up"]
        assert calls == []

    def test_a_genre_the_normalizer_rejects_is_kept_as_typed(self, stub):
        """Casing is corrected; values are not dropped. THEME_VALUES deliberately
        does not bite here, because silently discarding what the caller sent is
        the failure the fallback exists to avoid."""
        stub(found=[])
        assert self.source(igdb_id=None, payload_genres=["Iyashikei"]) == ["Iyashikei"]

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
        assert self.fields(igdb_id=None, payload_genres=["Farm Life Sim"]).platforms == []
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
        monkeypatch.setattr(catalog_sourcing.me_repo, "find_metadata", lambda db, **kw: row)

        def create(*a, **kw):
            raise AssertionError("an existing row must not reach find_or_create_metadata")

        monkeypatch.setattr(catalog_sourcing.me_repo, "find_or_create_metadata", create)
        out = catalog_sourcing.catalog_row_for_add(
            fake_db(), user_id=uuid.uuid4(), igdb_id=1051, name="anything", sourced=None
        )
        assert out is row

    def test_a_shared_row_deleted_mid_add_is_not_rebuilt_from_the_payload(self, monkeypatch):
        monkeypatch.setattr(catalog_sourcing.me_repo, "find_metadata", lambda db, **kw: None)
        with pytest.raises(catalog_sourcing.CatalogUnverifiedError):
            catalog_sourcing.catalog_row_for_add(
                fake_db(), user_id=uuid.uuid4(), igdb_id=1051, name="anything", sourced=None
            )


class TestPreviewCatalogEntry:
    """The add form's info popover. What matters is that it answers with what
    an add would STORE, not with a fresh opinion."""

    @pytest.fixture(autouse=True)
    def no_rate_limit(self, monkeypatch):
        # Charged against a real bucket in production; here it would need a DB.
        monkeypatch.setattr(catalog_sourcing.rate_limit, "enforce", lambda *a, **kw: None)

    def preview(self, **kw):
        return catalog_sourcing.preview_catalog_entry(
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
        monkeypatch.setattr(catalog_sourcing.me_repo, "find_metadata", lambda db, **kw: row)
        monkeypatch.setattr(
            catalog_sourcing.genre_service, "lookup_one", lambda name: ["Something Else"]
        )
        out = self.preview()
        assert out.genres == ["Role-Playing", "Time Travel"]
        assert out.release_date == date(1995, 3, 11)

    def test_a_new_row_is_previewed_from_wikipedia(self, monkeypatch):
        monkeypatch.setattr(catalog_sourcing.me_repo, "find_metadata", lambda db, **kw: None)
        monkeypatch.setattr(
            catalog_sourcing.genre_service, "lookup_one", lambda name: ["Role-Playing"]
        )
        out = self.preview(release_date=date(1995, 3, 11))
        assert out.genres == ["Role-Playing"]
        # No catalog row yet, so IGDB's date is the one that would be stored.
        assert out.release_date == date(1995, 3, 11)

    def test_it_agrees_with_what_the_add_would_store(self, monkeypatch):
        """The regression this class exists for: preview and write must not
        drift. Both go through _sourced_genres, so a change to one is a change
        to both."""
        monkeypatch.setattr(catalog_sourcing.me_repo, "find_metadata", lambda db, **kw: None)
        monkeypatch.setattr(
            catalog_sourcing.genre_service, "lookup_one", lambda name: ["Roguelike"]
        )
        # IGDB's record matches what the preview was sent, as it does for the
        # add form, which posts a search result verbatim.
        monkeypatch.setattr(
            catalog_sourcing.igdb_service,
            "fetch_catalog_game",
            lambda db, igdb_id: igdb_service.IgdbCatalogGame(
                name="Chrono Trigger",
                release_date=date(1995, 3, 11),
                platforms=["Windows"],
                genres=["Role-playing (RPG)"],
                cover_url="",
            ),
        )
        stored = catalog_sourcing.fields_for_new_catalog_row(
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
