"""Unit tests for the catalog staleness refresh: which rows come due, what a
refresh is willing to write, and that a third-party failure still counts as an
attempt. No DB and no network — the repository and the two lookups are the
seams, and they are stubbed.
"""

import time
import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.models import GameMetadata
from app.services import catalog_refresh
from app.services import genres as genre_service
from app.services import igdb as igdb_service
from app.services import users as users_service
from app.services.igdb import IgdbGameFacts

NOW = datetime(2026, 9, 1, tzinfo=UTC)

# Bound at import, which is BEFORE conftest's autouse stub_catalog_refresh
# replaces the module attribute. This module is the one place that exercises
# the real implementation rather than being protected from it.
refresh_stale_rows = catalog_refresh.refresh_stale_rows


def make_row(**overrides) -> GameMetadata:
    """A complete, freshly refreshed shared catalog row. Tests override the one
    field they are about, so "why is this due?" is visible in the call.

    created_at is deliberately absent: nothing in the refresh reads it, and
    setting it here would suggest otherwise."""
    defaults = {
        "id": 1,
        "igdb_id": 1051,
        "name": "Hades II",
        "genres": ["Roguelike"],
        "platforms": ["PC (Microsoft Windows)"],
        "release_date": date(2026, 5, 6),
        "image_url": "https://images.igdb.com/cover.jpg",
        "refreshed_at": NOW,
    }
    return GameMetadata(**{**defaults, **overrides})


class FakeSession:
    """Just enough Session for the refresh: it commits and rolls back through
    the repository, which is itself stubbed out in these tests. ``expired``
    records what the refresh asked the REQUEST's session to re-read."""

    def __init__(self) -> None:
        self.expired: list[int] = []

    def __enter__(self) -> "FakeSession":
        return self

    def __exit__(self, *exc) -> None:
        pass

    def rollback(self) -> None:
        pass

    def commit(self) -> None:
        pass

    def expire(self, obj) -> None:
        self.expired.append(obj.id)


@pytest.fixture
def stub_repo(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Replace the repository with a recorder, so a test can assert on the
    claim and the write without a database. Also stands in for the work
    session the refresh opens for itself, which would otherwise need a real
    DATABASE_URL."""
    monkeypatch.setattr(catalog_refresh, "get_sessionmaker", lambda: FakeSession)
    calls: dict = {"claimed": [], "applied": [], "systems": set(), "claim_wins": True}

    def claim(db, metadata_id, seen_stamp):
        calls["claimed"].append((metadata_id, seen_stamp))
        return calls["claim_wins"]

    def apply(db, metadata_id, **fields):
        calls["applied"].append(fields)
        return any(value is not None for value in fields.values())

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

    def test_a_freshly_added_row_is_not_due(self):
        # The column defaults to now() on insert, and that is true rather than
        # convenient: the add path sources genres and platforms on the way in.
        assert catalog_refresh.is_due(make_row(), NOW) is False


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
            lambda db, igdb_id, *, timeout: IgdbGameFacts(
                release_date=date(2026, 10, 1), platforms=[], cover_url=""
            ),
        )
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, *, timeout: [])

        refresh_stale_rows(FakeSession(), [row])

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
        monkeypatch.setattr(igdb_service, "lookup_game_facts", lambda db, igdb_id, *, timeout: None)
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, *, timeout: [])

        refresh_stale_rows(FakeSession(), [row])

        assert [claimed_id for claimed_id, _ in stub_repo["claimed"]] == [row.id]
        assert stub_repo["applied"] == [
            {"release_date": None, "platforms": None, "image_url": None, "genres": None}
        ]

    def test_nothing_due_makes_no_calls_at_all(self, stub_repo, monkeypatch: pytest.MonkeyPatch):
        # The common case: a read must not pay for this.
        def explode(*args, **kwargs):
            raise AssertionError("a fresh library must not reach a third party")

        monkeypatch.setattr(igdb_service, "lookup_game_facts", explode)
        refresh_stale_rows(FakeSession(), [make_row(), make_row(id=2)])
        assert stub_repo["claimed"] == []

    def test_a_spent_budget_drops_the_genre_leg_rather_than_the_row(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        row = make_row(genres=[], refreshed_at=NOW - timedelta(days=2))

        def slow_igdb(db, igdb_id, *, timeout):
            # Stand in for IGDB eating the whole budget.
            monkeypatch.setattr(time, "monotonic", lambda: float("inf"))
            return IgdbGameFacts(release_date=None, platforms=[], cover_url="")

        monkeypatch.setattr(igdb_service, "lookup_game_facts", slow_igdb)
        monkeypatch.setattr(
            genre_service,
            "lookup_one",
            lambda name, *, timeout: pytest.fail("Wikipedia must not be called past the budget"),
        )

        refresh_stale_rows(FakeSession(), [row])

        assert stub_repo["applied"][0]["genres"] is None

    def test_a_broken_row_does_not_fail_the_read(self, stub_repo, monkeypatch: pytest.MonkeyPatch):
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))

        def broken(db, metadata_id, seen_stamp):
            raise RuntimeError("database went away")

        monkeypatch.setattr(catalog_refresh.catalog_repo, "claim_for_refresh", broken)

        refresh_stale_rows(FakeSession(), [row])  # must not raise

        assert stub_repo["applied"] == []


class TestClaiming:
    def test_losing_the_claim_skips_the_row_entirely(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        # Another reader got there first. Without this, a burst of concurrent
        # readers all sort the due rows the same way and all pay for the same
        # row at IGDB.
        stub_repo["claim_wins"] = False
        monkeypatch.setattr(
            igdb_service,
            "lookup_game_facts",
            lambda db, igdb_id, *, timeout: pytest.fail("a lost claim must not reach IGDB"),
        )
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))

        refresh_stale_rows(FakeSession(), [row])

        assert stub_repo["applied"] == []

    def test_the_claim_is_conditional_on_the_stamp_that_was_read(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        seen = NOW - timedelta(days=2)
        row = make_row(release_date=None, refreshed_at=seen)
        monkeypatch.setattr(igdb_service, "lookup_game_facts", lambda db, igdb_id, *, timeout: None)
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, *, timeout: [])

        refresh_stale_rows(FakeSession(), [row])

        assert stub_repo["claimed"] == [(row.id, seen)]


class TestRequestSessionIsolation:
    def test_a_written_row_is_expired_so_the_response_shows_it(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))
        monkeypatch.setattr(
            igdb_service,
            "lookup_game_facts",
            lambda db, igdb_id, *, timeout: IgdbGameFacts(
                release_date=date(2026, 10, 1), platforms=[], cover_url=""
            ),
        )
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, *, timeout: [])
        request_session = FakeSession()

        refresh_stale_rows(request_session, [row])

        assert request_session.expired == [row.id]

    def test_a_refresh_that_writes_nothing_does_not_expire_anything(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        # Expiring costs the response a re-SELECT, so it is only worth it when
        # something actually changed.
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))
        monkeypatch.setattr(igdb_service, "lookup_game_facts", lambda db, igdb_id, *, timeout: None)
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, *, timeout: [])
        request_session = FakeSession()

        refresh_stale_rows(request_session, [row])

        assert request_session.expired == []

    def test_the_request_session_is_never_rolled_back(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        # Session.rollback() expires every object in its identity map, which on
        # the request's session means reloading the whole library one row at a
        # time while the response is being built.
        row = make_row(release_date=None, refreshed_at=NOW - timedelta(days=2))
        monkeypatch.setattr(igdb_service, "lookup_game_facts", lambda db, igdb_id, *, timeout: None)
        monkeypatch.setattr(genre_service, "lookup_one", lambda name, *, timeout: [])

        request_session = FakeSession()
        rollbacks = []
        request_session.rollback = lambda: rollbacks.append(1)

        refresh_stale_rows(request_session, [row])

        assert rollbacks == []


class TestDeadlineIsPushedIntoTheCalls:
    def test_each_leg_is_given_what_is_left_of_the_budget(
        self, stub_repo, monkeypatch: pytest.MonkeyPatch
    ):
        # Checking the clock between legs bounds nothing: the bound has to be
        # the timeout the call itself is given.
        row = make_row(genres=[], refreshed_at=NOW - timedelta(days=2))
        handed: dict[str, float] = {}

        def igdb(db, igdb_id, *, timeout):
            handed["igdb"] = timeout
            return None

        def wiki(name, *, timeout):
            handed["wiki"] = timeout
            return []

        monkeypatch.setattr(igdb_service, "lookup_game_facts", igdb)
        monkeypatch.setattr(genre_service, "lookup_one", wiki)

        refresh_stale_rows(FakeSession(), [row])

        budget = catalog_refresh.BUDGET.total_seconds()
        assert 0 < handed["igdb"] <= budget
        # Halved, because lookup_one makes two sequential requests.
        assert 0 < handed["wiki"] <= budget / catalog_refresh.WIKIPEDIA_CALLS


class TestWiring:
    """That the two public reads actually call the refresh, which no test
    covered while the whole feature hung off exactly those two call sites."""

    def _profile(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(
            users_service.users_repo,
            "get_profile_by_username",
            lambda db, username: SimpleNamespace(id=uuid.uuid4()),
        )

    def test_the_library_read_refreshes_the_rows_it_loaded(self, monkeypatch: pytest.MonkeyPatch):
        self._profile(monkeypatch)
        meta = make_row()
        entry = SimpleNamespace(id=7, system="Nintendo Switch", rating=None)
        monkeypatch.setattr(users_service.users_repo, "list_games", lambda db, uid: [(entry, meta)])
        monkeypatch.setattr(users_service.users_repo, "list_play_sessions", lambda db, ids: [])
        seen: dict = {}
        monkeypatch.setattr(
            users_service.catalog_refresh,
            "refresh_stale_rows",
            lambda db, rows: seen.setdefault("rows", rows),
        )

        games = users_service.get_user_games(FakeSession(), "rgrassian")

        assert seen["rows"] == [meta]
        assert games[0].name == "Hades II"

    def test_the_wishlist_read_refreshes_the_rows_it_loaded(self, monkeypatch: pytest.MonkeyPatch):
        self._profile(monkeypatch)
        meta = make_row()
        item = SimpleNamespace(
            id=3, system=None, starred=False, date_added=date(2026, 8, 1), notes=""
        )
        monkeypatch.setattr(
            users_service.users_repo, "list_wishlist_items", lambda db, uid: [(item, meta)]
        )
        seen: dict = {}
        monkeypatch.setattr(
            users_service.catalog_refresh,
            "refresh_stale_rows",
            lambda db, rows: seen.setdefault("rows", rows),
        )

        wishlist = users_service.get_user_wishlist(FakeSession(), "rgrassian")

        assert seen["rows"] == [meta]
        assert wishlist[0].name == "Hades II"
