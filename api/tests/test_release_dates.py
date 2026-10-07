"""Per-platform release dates: IGDB's parse, and which date an entry shows."""

from datetime import UTC, date, datetime

from app.models import GameMetadata, PlayedGame, WishlistGame
from app.services.igdb import _platform_release_dates
from app.services.users import derive_play_state, release_date_for, to_game_read, to_wishlist_read


def _ts(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=UTC).timestamp())


def _release(platform: str | None, when: date | None) -> dict:
    release: dict = {"id": 1}
    if platform is not None:
        release["platform"] = {"id": 1, "name": platform}
    if when is not None:
        release["date"] = _ts(when)
    return release


class TestPlatformReleaseDates:
    def test_earliest_region_wins_per_platform(self):
        row = {
            "release_dates": [
                _release("PC (Microsoft Windows)", date(2025, 11, 20)),
                _release("PC (Microsoft Windows)", date(2025, 11, 13)),
                _release("Nintendo Switch 2", date(2026, 10, 22)),
            ]
        }
        assert _platform_release_dates(row) == {
            "PC (Microsoft Windows)": "2025-11-13",
            "Nintendo Switch 2": "2026-10-22",
        }

    def test_an_undated_platform_is_kept_as_none(self):
        assert _platform_release_dates(
            {"release_dates": [_release("Nintendo Switch 2", None)]}
        ) == {"Nintendo Switch 2": None}

    def test_a_dated_release_beats_an_undated_one_in_either_order(self):
        undated, dated = _release("Xbox", None), _release("Xbox", date(2027, 1, 1))
        for releases in ([undated, dated], [dated, undated]):
            assert _platform_release_dates({"release_dates": releases}) == {"Xbox": "2027-01-01"}

    def test_missing_or_nameless_data_is_skipped(self):
        assert _platform_release_dates({}) == {}
        assert _platform_release_dates({"release_dates": None}) == {}
        assert _platform_release_dates({"release_dates": [_release(None, date(2020, 1, 1))]}) == {}


class TestReleaseDateFor:
    META = GameMetadata(
        release_date=date(2025, 11, 13),
        platform_release_dates={
            "PC (Microsoft Windows)": "2025-11-13",
            "Nintendo Switch 2": "2026-10-22",
            "Xbox Series X|S": None,
        },
    )

    def test_the_entrys_own_platform_date(self):
        # The bug: a Switch 2 entry showed the PC launch.
        assert release_date_for(self.META, "Nintendo Switch 2") == "2026-10-22"

    def test_an_undated_platform_is_unknown_not_the_first_release(self):
        assert release_date_for(self.META, "Xbox Series X|S") == ""

    def test_falls_back_to_the_first_release(self):
        assert release_date_for(self.META, "Nintendo Switch") == "2025-11-13"
        assert release_date_for(self.META, None) == "2025-11-13"
        assert release_date_for(self.META, "") == "2025-11-13"

    def test_a_row_without_the_map_behaves_as_before(self):
        meta = GameMetadata(release_date=None, platform_release_dates={})
        assert release_date_for(meta, "Nintendo Switch 2") == ""


def test_both_reads_pick_the_date_by_the_entrys_own_system():
    meta = GameMetadata(
        id=1,
        name="The Seance of Blake Manor",
        genres=[],
        platforms=[],
        release_date=date(2025, 11, 13),
        platform_release_dates={"Nintendo Switch 2": "2026-10-22"},
    )
    wish = WishlistGame(id=1, system="Nintendo Switch 2", starred=False, date_added=date.today())
    played = PlayedGame(id=1, system="PC (Microsoft Windows)")

    assert to_wishlist_read(wish, meta).release_date == "2026-10-22"
    # No map entry for PC on this row, so the game's first release.
    assert to_game_read(played, meta, derive_play_state([])).release_date == "2025-11-13"
