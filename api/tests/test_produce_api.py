"""Integration tests for the produce tracker's /me endpoints, against a real
migrated database (same requires_db skip and auth stub as test_me_api.py).

Every user here is a bare auth.users row with NO profile, which is the point:
tracking produce must work for an account that never made a game library.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
from app.models.produce_tasting import MAX_TASTINGS_PER_USER

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

BASE = "/api/library/me/produce/tastings"


def client_as(user_id: uuid.UUID) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=user_id, email="test@example.com"
    )
    return TestClient(app)


def _delete_auth_user(user_id: uuid.UUID) -> None:
    with get_sessionmaker()() as session:
        session.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": user_id})
        session.commit()


def _make_auth_user() -> uuid.UUID:
    user_id = uuid.uuid4()
    with get_sessionmaker()() as session:
        session.execute(
            text(
                "INSERT INTO auth.users "
                "(instance_id, id, aud, role, email, created_at, updated_at) "
                "VALUES ('00000000-0000-0000-0000-000000000000', :id, "
                "'authenticated', 'authenticated', :email, now(), now())"
            ),
            {"id": user_id, "email": f"produce-{user_id}@example.com"},
        )
        session.commit()
    return user_id


@pytest.fixture
def user():
    """A throwaway auth user with no profile; its tastings cascade on teardown."""
    user_id = _make_auth_user()
    try:
        yield user_id
    finally:
        _delete_auth_user(user_id)
        # rate_limits has no FK, so the cascade above does not collect what the
        # write guard charged.
        with get_sessionmaker()() as session:
            session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": user_id})
            session.commit()


def _count_tastings(user_id: uuid.UUID) -> int:
    with get_sessionmaker()() as session:
        return session.execute(
            text("SELECT count(*) FROM produce_tastings WHERE user_id = :id"), {"id": user_id}
        ).scalar_one()


def _put(user_id: uuid.UUID, year: int, slug: str, eaten_on: str):
    return client_as(user_id).put(f"{BASE}/{year}/{slug}", json={"eatenOn": eaten_on})


# ── Auth ──────────────────────────────────────────────────────────────────


def test_read_without_a_token_is_401() -> None:
    assert TestClient(create_app()).get(f"{BASE}?year=2026").status_code == 401


def test_write_without_a_token_is_401() -> None:
    client = TestClient(create_app())
    assert client.put(f"{BASE}/2026/ramps", json={"eatenOn": "2026-04-20"}).status_code == 401
    assert client.delete(f"{BASE}/2026/ramps").status_code == 401


# ── Read and write, with no profile ───────────────────────────────────────


@requires_db
def test_user_with_no_profile_can_mark_and_read(user) -> None:
    written = _put(user, 2026, "ramps", "2026-04-20")
    assert written.status_code == 200
    assert written.json() == {"slug": "ramps", "year": 2026, "eatenOn": "2026-04-20"}

    listed = client_as(user).get(f"{BASE}?year=2026")
    assert listed.status_code == 200
    assert listed.json() == [{"slug": "ramps", "year": 2026, "eatenOn": "2026-04-20"}]


@requires_db
def test_read_is_scoped_to_the_year_and_the_caller(user) -> None:
    _put(user, 2025, "apple", "2025-10-01")
    _put(user, 2026, "apple", "2026-10-02")
    other = _make_auth_user()
    try:
        _put(other, 2026, "ramps", "2026-04-20")
        listed = client_as(user).get(f"{BASE}?year=2026").json()
    finally:
        _delete_auth_user(other)
    assert listed == [{"slug": "apple", "year": 2026, "eatenOn": "2026-10-02"}]


@requires_db
def test_read_requires_a_year(user) -> None:
    assert client_as(user).get(BASE).status_code == 422


@requires_db
def test_put_is_an_idempotent_upsert(user) -> None:
    assert _put(user, 2026, "strawberry", "2026-06-01").status_code == 200
    again = _put(user, 2026, "strawberry", "2026-06-14")
    assert again.status_code == 200
    assert again.json()["eatenOn"] == "2026-06-14"
    assert _count_tastings(user) == 1


@requires_db
def test_delete_removes_the_row_and_repeats_as_204(user) -> None:
    _put(user, 2026, "strawberry", "2026-06-01")
    assert client_as(user).delete(f"{BASE}/2026/strawberry").status_code == 204
    assert _count_tastings(user) == 0
    assert client_as(user).delete(f"{BASE}/2026/strawberry").status_code == 204


# ── Validation ────────────────────────────────────────────────────────────


@requires_db
def test_date_outside_the_paths_year_is_refused(user) -> None:
    # The New Year's Eve case: the client's date and the path must agree, or a
    # tasting lands in a year its own date contradicts.
    response = _put(user, 2026, "apple", "2025-12-31")
    assert response.status_code == 422
    assert _count_tastings(user) == 0


@requires_db
def test_tomorrow_utc_is_accepted_and_the_day_after_is_not(user) -> None:
    today = datetime.now(UTC).date()
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)
    # A caller ahead of UTC is legitimately on tomorrow's date already.
    assert _put(user, tomorrow.year, "apple", tomorrow.isoformat()).status_code == 200
    assert _put(user, day_after.year, "pear", day_after.isoformat()).status_code == 422


@requires_db
def test_date_before_the_floor_is_refused(user) -> None:
    assert _put(user, 2019, "apple", "2019-06-01").status_code == 422


@requires_db
@pytest.mark.parametrize("year", [2019, 10000, 99999])
def test_year_out_of_range_is_refused_before_the_database(user, year: int) -> None:
    # DELETE and GET carry no date, so only the bound on the year itself can
    # refuse these. Without it 99999 overflows the smallint column as a 500.
    assert client_as(user).delete(f"{BASE}/{year}/apple").status_code == 422
    assert client_as(user).get(f"{BASE}?year={year}").status_code == 422


@requires_db
def test_write_for_a_deleted_account_is_401_not_500() -> None:
    # A token outlives its account until it expires; the insert then meets the
    # auth.users FK. No auth.users row is made for this id.
    ghost = uuid.uuid4()
    try:
        response = _put(ghost, 2026, "apple", "2026-06-01")
        assert response.status_code == 401
        assert client_as(ghost).get(f"{BASE}?year=2026").json() == []
    finally:
        with get_sessionmaker()() as session:
            session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": ghost})
            session.commit()


@requires_db
@pytest.mark.parametrize("slug", ["Apple", "apple_pie", "-apple", "apple-", "a" * 65])
def test_malformed_slug_is_refused(user, slug: str) -> None:
    assert _put(user, 2026, slug, "2026-06-01").status_code == 422
    assert client_as(user).delete(f"{BASE}/2026/{slug}").status_code == 422


@requires_db
def test_unknown_body_key_and_missing_date_are_refused(user) -> None:
    client = client_as(user)
    assert client.put(f"{BASE}/2026/apple", json={}).status_code == 422
    assert (
        client.put(f"{BASE}/2026/apple", json={"eatenOn": "2026-06-01", "note": "tart"}).status_code
        == 422
    )


@requires_db
def test_slug_is_not_checked_against_the_catalog(user) -> None:
    # The catalog is a TS module the API cannot read; an unknown slug is stored.
    assert _put(user, 2026, "not-a-real-vegetable", "2026-06-01").status_code == 200


# ── Guards ────────────────────────────────────────────────────────────────


@requires_db
def test_writes_are_forbidden_in_preview(user, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        assert _put(user, 2026, "apple", "2026-06-01").status_code == 503
        assert client_as(user).delete(f"{BASE}/2026/apple").status_code == 503
    finally:
        get_settings.cache_clear()


@requires_db
def test_writes_are_charged_to_the_write_budget(user) -> None:
    _put(user, 2026, "apple", "2026-06-01")
    with get_sessionmaker()() as session:
        charged = session.execute(
            text("SELECT count(*) FROM rate_limits WHERE user_id = :id"), {"id": user}
        ).scalar_one()
    try:
        assert charged > 0
    finally:
        # rate_limits has no FK, so the fixture's cascade does not collect it.
        with get_sessionmaker()() as session:
            session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": user})
            session.commit()


# ── The per-user cap ──────────────────────────────────────────────────────


@requires_db
def test_cap_refuses_a_new_row_but_not_an_existing_one(user) -> None:
    with get_sessionmaker()() as session:
        session.execute(
            text(
                "INSERT INTO produce_tastings (user_id, produce_slug, year, eaten_on) "
                "SELECT :id, 'item-' || g, 2026, DATE '2026-06-01' "
                "FROM generate_series(1, :n) AS g"
            ),
            {"id": user, "n": MAX_TASTINGS_PER_USER},
        )
        session.commit()

    over = _put(user, 2026, "one-too-many", "2026-06-01")
    assert over.status_code == 409
    assert str(MAX_TASTINGS_PER_USER) in over.json()["detail"]

    # A row the user already has can still have its date corrected at the cap.
    assert _put(user, 2026, "item-1", "2026-06-02").status_code == 200

    # And removing one makes room.
    assert client_as(user).delete(f"{BASE}/2026/item-2").status_code == 204
    assert _put(user, 2026, "one-too-many", "2026-06-01").status_code == 200


# ── Account deletion ──────────────────────────────────────────────────────


@requires_db
def test_account_deletion_cascades_tastings_for_a_user_with_no_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = _make_auth_user()
    try:
        _put(user_id, 2026, "ramps", "2026-04-20")
        assert _count_tastings(user_id) == 1

        # Stand in for the GoTrue Admin API with the SQL it amounts to. The
        # FK's ON DELETE CASCADE is what is under test, not the HTTP call.
        def fake_admin_delete(deleted_id: uuid.UUID) -> bool:
            _delete_auth_user(deleted_id)
            return True

        monkeypatch.setattr("app.services.me.delete_auth_user_or_raise", fake_admin_delete)
        assert client_as(user_id).delete("/api/library/me/account").status_code == 204
        assert _count_tastings(user_id) == 0
    finally:
        _delete_auth_user(user_id)


# ── Database constraints, bypassing the API ───────────────────────────────


@pytest.fixture
def conn(user):
    from app.core.db import get_engine

    with get_engine().connect() as connection:
        transaction = connection.begin()
        yield connection
        transaction.rollback()


_INSERT = text(
    "INSERT INTO produce_tastings (user_id, produce_slug, year, eaten_on) "
    "VALUES (:id, :slug, :year, :eaten_on)"
)


@requires_db
@pytest.mark.parametrize(
    "slug,year,eaten_on,constraint",
    [
        ("Bad_Slug", 2026, date(2026, 6, 1), "ck_produce_tastings_slug_format"),
        ("a" * 65, 2026, date(2026, 6, 1), "ck_produce_tastings_slug_format"),
        ("apple", 2025, date(2026, 6, 1), "ck_produce_tastings_year_matches_eaten_on"),
        ("apple", 2019, date(2019, 6, 1), "ck_produce_tastings_eaten_on_floor"),
    ],
)
def test_check_constraints_backstop_the_api(conn, user, slug, year, eaten_on, constraint) -> None:
    with pytest.raises(IntegrityError, match=constraint):
        conn.execute(_INSERT, {"id": user, "slug": slug, "year": year, "eaten_on": eaten_on})


@requires_db
def test_tasting_for_a_nonexistent_user_is_refused(conn) -> None:
    with pytest.raises(IntegrityError, match="fk_produce_tastings_user_id_users"):
        conn.execute(
            _INSERT,
            {"id": uuid.uuid4(), "slug": "apple", "year": 2026, "eaten_on": date(2026, 6, 1)},
        )
