"""Unit tests for the catalog staleness refresh: which rows come due, what a
refresh is willing to write, and that a third-party failure still counts as an
attempt. No DB and no network — the repository and the two lookups are the
seams, and they are stubbed.
"""

import time
from datetime import UTC, date, datetime, timedelta

import pytest

from app.models import GameMetadata
from app.services import catalog_refresh
from app.services import genres as genre_service
from app.services import igdb as igdb_service
from app.services.igdb import IgdbGameFacts

NOW = datetime(2026, 9, 1, tzinfo=UTC)


def make_row(**overrides) -> GameMetadata:
    """A complete, freshly refreshed shared catalog row. Tests override the one
    field they are about, so "why is this due?" is visible in the call."""
    defaults = {
        "id": 1,
        "igdb_id": 1051,
        "name": "Hades II",
        "genres": ["Roguelike"],
        "platforms": ["PC (Microsoft Windows)"],
        "release_date": date(2026, 5, 6),
        "image_url": "https://images.igdb.com/cover.jpg",
        "created_at": NOW - timedelta(days=400),
        "refreshed_at": NOW,
    }
    return GameMetadata(**{**defaults, **overrides})


class FakeSession:
    """Just enough Session for the refresh: it commits and rolls back through
    the repository, which is itself stubbed out in these tests."""

    def rollback(self) -> None:
        pass

    def commit(self) -> None:
        pass


@pytest.fixture
def stub_repo(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Replace the repository with a recorder, so a test can assert on the
    claim and the write without a database."""
    calls: dict = {"claimed": [], "applied": [], "systems": set()}

    def claim(db, meta):
        calls["claimed"].append(meta.id)
        return NOW

    def apply(db, meta, **fields):
        calls["applied"].append(fields)

    monkeypatch.setattr(catalog_refresh.catalog_repo, "claim_for_refresh", claim)
    monkeypatch.setattr(catalog_refresh.catalog_repo, "apply_refresh", apply)
    monkeypatch.setattr(
        catalog_refresh.catalog_repo, "recorded_systems", lambda db, mid: calls["systems"]
    )
    return calls


class TestIsDue:
    def test_a_private_row_is_never_due(self):
        # Hand-entered games have no canonical source to re-source them from,
        # and their genres are whatever their owner typed.
        row = make_row(igdb_id=None, release_date=None, genres=[], refreshed_at=None)
        assert catalog_refresh.is_due(row, NOW) is False

    def test_a_complete_row_is_not_due_before_the_long_interval(self):
        row = make_row(refreshed_at=NOW - timedelta(days=29))
        assert catalog_refresh.is_due(row, NOW) is False

    def test_a_complete_row_is_due_after_the_long_interval(self):
        row = make_row(refreshed_at=NOW - timedelta(days=31))
        assert catalog_refresh.is_due(row, NOW) is True

    def test_a_row_with_no_release_date_uses_the_short_interval(self):
        # The motivating case: wishlisted before the game had a date.
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))
        assert catalog_refresh.is_due(row, NOW) is True

    def test_an_incomplete_row_is_still_not_due_immediately(self):
        # "Always refetch when data is missing" would mean two network round
        # trips on every uncached read for a date that may not exist yet.
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(hours=1))
        assert catalog_refresh.is_due(row, NOW) is False

    @pytest.mark.parametrize("hole", ["genres", "platforms", "image_url"])
    def test_every_sourced_field_counts_as_a_hole(self, hole):
        row = make_row(**{hole: [] if hole != "image_url" else ""})
        row.refreshed_at = NOW - timedelta(days=2)
        assert catalog_refresh.is_due(row, NOW) is True

    def test_a_null_stamp_falls_back_to_created_at(self):
        # Rows predating the column read as "checked when they were created",
        # which is true — the add path sources them.
        assert catalog_refresh.is_due(make_row(refreshed_at=None), NOW) is True
        fresh = make_row(refreshed_at=None, created_at=NOW - timedelta(days=1))
        assert catalog_refresh.is_due(fresh, NOW) is False


class TestDueRows:
    def test_incomplete_rows_are_refreshed_before_merely_old_ones(self):
        old = make_row(id=1, refreshed_at=NOW - timedelta(days=900))
        incomplete = make_row(id=2, release_date=None, refreshed_at=NOW - timedelta(days=2))
        picked = catalog_refresh._due_rows([old, incomplete], NOW)
        assert [row.id for row in picked] == [2, 1]

    def test_oldest_check_first_within_a_group(self):
        newer = make_row(id=1, refreshed_at=NOW - timedelta(days=40))
        older = make_row(id=2, refreshed_at=NOW - timedelta(days=100))
        picked = catalog_refresh._due_rows([newer, older], NOW)
        assert [row.id for row in picked] == [2, 1]

    def test_the_cap_bounds_one_read(self):
        rows = [make_row(id=i, refreshed_at=NOW - timedelta(days=100 + i)) for i in range(10)]
        picked = catalog_refresh._due_rows(rows, NOW)
        assert len(picked) == catalog_refresh.MAX_ROWS_PER_READ

    def test_a_library_with_nothing_due_picks_nothing(self):
        assert catalog_refresh._due_rows([make_row(), make_row(id=2)], NOW) == []


class TestPlatformsToWrite:
    def test_an_empty_list_leaves_the_column_alone(self, stub_repo):
        assert catalog_refresh._platforms_to_write(FakeSession(), make_row(), []) is None

    def test_an_unchanged_list_is_not_rewritten(self, stub_repo):
        row = make_row(platforms=["Nintendo Switch"])
        assert catalog_refresh._platforms_to_write(FakeSession(), row, ["Nintendo Switch"]) is None

    def test_a_new_platform_is_written(self, stub_repo):
        row = make_row(platforms=["Nintendo Switch"])
        fetched = ["Nintendo Switch", "Nintendo Switch 2"]
        assert catalog_refresh._platforms_to_write(FakeSession(), row, fetched) == fetched

    def test_a_list_missing_someone_s_console_is_refused(self, stub_repo):
        # backfill_platforms.py's rule: the contradiction means this igdb_id
        # landed on a variant, and storing its platforms would drop the console
        # the game is actually played on.
        stub_repo["systems"] = {"Nintendo Switch"}
        row = make_row(platforms=[])
        assert catalog_refresh._platforms_to_write(FakeSession(), row, ["iOS"]) is None


class TestGenresToWrite:
    def test_a_miss_leaves_the_stored_genres_alone(self):
        assert catalog_refresh._genres_to_write([]) is None

    def test_genres_are_shaped_the_way_an_add_shapes_them(self):
        assert catalog_refresh._genres_to_write(["RPG", "rpg", " Roguelike "]) == [
            "RPG",
            "Roguelike",
        ]

    def test_an_overlong_infobox_value_is_dropped_rather_than_raising(self):
        # A malformed infobox must not fail the read that triggered the refresh.
        assert catalog_refresh._genres_to_write(["x" * 500, "Puzzle"]) == ["Puzzle"]


class TestCoverToWrite:
    def test_an_existing_cover_is_never_replaced(self):
        assert (
            catalog_refresh._cover_to_write(make_row(), "https://images.igdb.com/new.jpg") is None
        )

    def test_a_missing_cover_is_filled(self):
        row = make_row(image_url="")
        assert catalog_refresh._cover_to_write(row, "https://images.igdb.com/c.jpg") == (
            "https://images.igdb.com/c.jpg"
        )

    def test_a_non_igdb_url_is_rejected(self):
        # Covers are hotlinked, so the same rule the write schemas apply.
        assert (
            catalog_refresh._cover_to_write(make_row(image_url=""), "https://evil.test/c") is None
        )

    def test_no_cover_found_writes_nothing(self):
        assert catalog_refresh._cover_to_write(make_row(image_url=""), "") is None


class TestRefreshStaleRows:
    def test_an_announced_release_date_lands_in_this_response(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))
        monkeypatch.setattr(
            igdb_service,
            "lookup_game_facts",
            lambda db, igdb_id, timeout=None: IgdbGameFacts(
                release_date=date(2026, 10, 1), platforms=[], cover_url=""
            ),
        )
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, timeout=None: [])

        catalog_refresh.refresh_stale_rows(FakeSession(), [row])

        assert stub_repo["applied"] == [
            {
                "release_date": date(2026, 10, 1),
                "platforms": None,
                "image_url": None,
                "genres": None,
            }
        ]

    def test_a_failed_lookup_still_counts_as_an_attempt(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        # Otherwise a game with no announced date would be retried on every
        # single read for as long as it stays unannounced.
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))
        monkeypatch.setattr(
            igdb_service, "lookup_game_facts", lambda db, igdb_id, timeout=None: None
        )
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, timeout=None: [])

        catalog_refresh.refresh_stale_rows(FakeSession(), [row])

        assert stub_repo["claimed"] == [row.id]
        assert stub_repo["applied"] == [
            {"release_date": None, "platforms": None, "image_url": None, "genres": None}
        ]

    def test_nothing_due_makes_no_calls_at_all(self, stub_repo, monkeypatch: pytest.MonkeyPatch):
        # The common case: a read must not pay for this.
        def explode(*args, **kwargs):
            raise AssertionError("a fresh library must not reach a third party")

        monkeypatch.setattr(igdb_service, "lookup_game_facts", explode)
        catalog_refresh.refresh_stale_rows(FakeSession(), [make_row(), make_row(id=2)])
        assert stub_repo["claimed"] == []

    def test_a_spent_budget_drops_the_genre_leg_rather_than_the_row(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        row = make_row(genres=[], refreshed_at=NOW - timedelta(days=2))

        def slow_igdb(db, igdb_id, timeout=None):
            # Stand in for IGDB eating the whole budget.
            monkeypatch.setattr(time, "monotonic", lambda: float("inf"))
            return IgdbGameFacts(release_date=None, platforms=[], cover_url="")

        monkeypatch.setattr(igdb_service, "lookup_game_facts", slow_igdb)
        monkeypatch.setattr(
            genre_service,
            "lookup_one",
            lambda name, timeout=None: pytest.fail("Wikipedia must not be called past the budget"),
        )

        catalog_refresh.refresh_stale_rows(FakeSession(), [row])

        assert stub_repo["applied"][0]["genres"] is None

    def test_a_broken_row_does_not_fail_the_read(self, stub_repo, monkeypatch: pytest.MonkeyPatch):
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))

        def broken(db, meta):
            raise RuntimeError("database went away")

        monkeypatch.setattr(catalog_refresh.catalog_repo, "claim_for_refresh", broken)

        catalog_refresh.refresh_stale_rows(FakeSession(), [row])  # must not raise

        assert stub_repo["applied"] == []
