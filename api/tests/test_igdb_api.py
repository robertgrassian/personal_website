"""Integration tests for the IGDB proxy against the local database.

Auth is stubbed via dependency_overrides (same pattern as test_me_api.py).
The two outbound-HTTP seams — ``_fetch_twitch_token`` and ``_query_igdb`` in
services/igdb.py — are monkeypatched, so rate limiting, token caching, and
result parsing all run for real: counters and the token row live in actual
Postgres tables.
"""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.main import create_app
from app.repositories import igdb as igdb_repo
from app.repositories import rate_limit as rate_limit_repo
from app.services import igdb as igdb_service

requires_db = pytest.mark.skipif(not get_settings().database_url, reason="DATABASE_URL not set")

SEARCH_URL = "/api/py/igdb/search"

# A fully populated IGDB row and the DTO it should become.
FULL_IGDB_ROW = {
    "id": 1022,
    "name": "The Legend of Zelda: A Link Between Worlds",
    "first_release_date": 1385078400,  # 2013-11-22 UTC
    "platforms": [{"id": 37, "name": "Nintendo 3DS"}],
    "genres": [{"id": 31, "name": "Adventure"}, {"id": 9, "name": "Puzzle"}],
    "cover": {"id": 1, "url": "//images.igdb.com/igdb/image/upload/t_thumb/co3p0j.jpg"},
}


def client_as(user_id: uuid.UUID) -> TestClient:
    """A TestClient whose requests authenticate as the given user id."""
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id=user_id, email="test@example.com"
    )
    return TestClient(app)


@pytest.fixture
def test_user() -> uuid.UUID:
    """A random authenticated caller. No auth.users/profiles rows needed:
    rate_limits deliberately has no FK. Counters cleaned on teardown."""
    user_id = uuid.uuid4()
    yield user_id
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": user_id})
        session.commit()


# What the stubbed /platforms endpoint answers with. Enough platforms to
# exercise alias matching: an abbreviation ("Switch 2"), a vendor-prefixed name
# ("Nintendo Switch 2" -> "switch 2"), and Nintendo 64, whose "64" alias must
# NOT be allowed to eat the tail of "Star Fox 64".
PLATFORM_ROWS = [
    {"id": 508, "name": "Nintendo Switch 2", "abbreviation": "Switch 2"},
    {"id": 130, "name": "Nintendo Switch", "abbreviation": "Switch", "alternative_name": "NX"},
    {"id": 4, "name": "Nintendo 64", "abbreviation": "N64", "alternative_name": "N64"},
    {"id": 7, "name": "PlayStation", "abbreviation": "PS1", "alternative_name": "PSX, PSOne"},
]


@pytest.fixture
def igdb_env(monkeypatch: pytest.MonkeyPatch):
    """Configured credentials + stubbed network, with the token row wiped and
    the platform-alias cache cleared so every test starts cold. Yields a dict
    of call counters and the Apicalypse bodies sent upstream."""
    settings = get_settings()
    monkeypatch.setattr(settings, "twitch_client_id", "test-client-id")
    monkeypatch.setattr(settings, "twitch_client_secret", "test-secret")

    calls = {
        "twitch": 0,
        "igdb": 0,  # /games calls only — the ones that cost a search
        "platforms": 0,
        "last_body": "",
        "bodies": [],  # every /games body, in order
        "igdb_responses": [],
        "platform_status": 200,
    }

    def fake_fetch_twitch_token(_settings):
        calls["twitch"] += 1
        return f"token-{calls['twitch']}", datetime.now(UTC) + timedelta(days=60)

    def fake_query_igdb(_settings, _token, body, url=igdb_service._IGDB_GAMES_URL):
        if url == igdb_service._IGDB_PLATFORMS_URL:
            calls["platforms"] += 1
            if calls["platform_status"] != 200:
                return httpx.Response(calls["platform_status"])
            return httpx.Response(200, json=PLATFORM_ROWS)
        calls["igdb"] += 1
        calls["last_body"] = body
        calls["bodies"].append(body)
        if calls["igdb_responses"]:
            return calls["igdb_responses"].pop(0)
        return httpx.Response(200, json=[FULL_IGDB_ROW])

    monkeypatch.setattr(igdb_service, "_fetch_twitch_token", fake_fetch_twitch_token)
    monkeypatch.setattr(igdb_service, "_query_igdb", fake_query_igdb)
    # The alias map is a module-level cache, so it would otherwise leak the
    # first test's platforms (and its expiry) into every later test.
    monkeypatch.setattr(igdb_service, "_platform_aliases", None)
    monkeypatch.setattr(igdb_service, "_platform_aliases_expire_at", None)

    _delete_token_row()
    yield calls
    _delete_token_row()


def _delete_token_row() -> None:
    sm = get_sessionmaker()
    with sm() as session:
        session.execute(text("DELETE FROM igdb_tokens"))
        session.commit()


# ---------------------------------------------------------------------------
# Auth / validation / configuration
# ---------------------------------------------------------------------------


def test_search_requires_auth() -> None:
    response = TestClient(create_app()).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 401


@requires_db
def test_search_empty_q_is_422(test_user, igdb_env) -> None:
    assert client_as(test_user).get(SEARCH_URL, params={"q": ""}).status_code == 422
    assert client_as(test_user).get(SEARCH_URL).status_code == 422


@requires_db
def test_search_unconfigured_is_503(test_user, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "twitch_client_id", None)
    monkeypatch.setattr(settings, "twitch_client_secret", None)
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 503


@requires_db
def test_search_forbidden_in_preview(test_user, monkeypatch: pytest.MonkeyPatch) -> None:
    # The proxy writes (token cache, counters) and preview holds a read-only
    # DB role, so the guard refuses before anything runs.
    monkeypatch.setenv("APP_ENV", "preview")
    get_settings.cache_clear()
    try:
        response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
        assert response.status_code == 503
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Result parsing
# ---------------------------------------------------------------------------


@requires_db
def test_search_returns_parsed_results(test_user, igdb_env) -> None:
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 200
    (result,) = response.json()["results"]
    assert result == {
        "igdbId": 1022,
        "name": "The Legend of Zelda: A Link Between Worlds",
        "releaseDate": "2013-11-22",
        "platforms": ["Nintendo 3DS"],
        "genres": ["Adventure", "Puzzle"],
        "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co3p0j.jpg",
    }


@requires_db
def test_sparse_igdb_rows_become_empty_fields(test_user, igdb_env) -> None:
    # Games without cover art are deliberately included — the FE has fallback
    # art, and filtering would make obscure games un-addable.
    igdb_env["igdb_responses"].append(httpx.Response(200, json=[{"id": 7, "name": "Obscurity"}]))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "obscurity"})
    assert response.status_code == 200
    (result,) = response.json()["results"]
    assert result == {
        "igdbId": 7,
        "name": "Obscurity",
        "releaseDate": "",
        "platforms": [],
        "genres": [],
        "coverUrl": "",
    }


@requires_db
def test_already_absolute_cover_url_is_not_double_prefixed(test_user, igdb_env) -> None:
    # If IGDB ever returns an already-absolute https:// cover, the scheme must
    # not be doubled (https:https://...) — that would fail validate_igdb_image_url
    # on a later POST /me/games.
    igdb_env["igdb_responses"].append(
        httpx.Response(
            200,
            json=[
                {
                    "id": 9,
                    "name": "Absolute",
                    "cover": {"url": "https://images.igdb.com/igdb/image/upload/t_thumb/x.jpg"},
                }
            ],
        )
    )
    response = client_as(test_user).get(SEARCH_URL, params={"q": "absolute"})
    (result,) = response.json()["results"]
    assert result["coverUrl"] == "https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg"


@requires_db
def test_rows_missing_id_or_name_are_skipped(test_user, igdb_env) -> None:
    # One malformed row shouldn't cost the whole search a KeyError 500; the
    # usable candidates still come back.
    igdb_env["igdb_responses"].append(
        httpx.Response(200, json=[{"id": 11}, {"name": "No Id"}, {"id": 12, "name": "Fine"}])
    )
    response = client_as(test_user).get(SEARCH_URL, params={"q": "partial"})
    assert response.status_code == 200
    assert [r["name"] for r in response.json()["results"]] == ["Fine"]


@requires_db
def test_null_valued_fields_are_tolerated(test_user, igdb_env) -> None:
    # An explicit null slips past a .get(key, default), so the parser uses
    # `or []` / `or ""` instead.
    igdb_env["igdb_responses"].append(
        httpx.Response(
            200,
            json=[{"id": 13, "name": "Nulls", "platforms": None, "genres": None, "cover": None}],
        )
    )
    response = client_as(test_user).get(SEARCH_URL, params={"q": "nulls"})
    assert response.status_code == 200
    (result,) = response.json()["results"]
    assert result["platforms"] == []
    assert result["genres"] == []
    assert result["coverUrl"] == ""


@requires_db
def test_query_term_is_escaped(test_user, igdb_env) -> None:
    client_as(test_user).get(SEARCH_URL, params={"q": 'say "hi" \\ bye'})
    assert 'search "say \\"hi\\" \\\\ bye";' in igdb_env["last_body"]


@requires_db
def test_results_are_ranked_by_game_type(test_user, igdb_env) -> None:
    # IGDB's own relevance puts the ROM hack (Mod) first; the real game
    # (Remake) has to come back on top, and ordering inside a tier is IGDB's.
    igdb_env["igdb_responses"].append(
        httpx.Response(
            200,
            json=[
                {"id": 1, "name": "Fire Red Extended", "game_type": 5},  # Mod
                {"id": 2, "name": "Pack", "game_type": 13},  # Pack / Addon
                {"id": 3, "name": "FireRed Version", "game_type": 8},  # Remake
                {"id": 4, "name": "Some Main Game", "game_type": 0},
                {"id": 5, "name": "Another Main Game", "game_type": 0},
            ],
        )
    )
    response = client_as(test_user).get(SEARCH_URL, params={"q": "fire red"})
    assert [r["name"] for r in response.json()["results"]] == [
        "Some Main Game",
        "Another Main Game",
        "FireRed Version",
        "Pack",
        "Fire Red Extended",
    ]


# ---------------------------------------------------------------------------
# Platform-aware queries
# ---------------------------------------------------------------------------


@requires_db
def test_platform_suffix_becomes_a_where_clause(test_user, igdb_env) -> None:
    # "star fox switch 2" must search for "star fox" ON the Switch 2, not for
    # a game literally called "star fox switch 2" (which matches nothing).
    response = client_as(test_user).get(SEARCH_URL, params={"q": "star fox switch 2"})
    assert response.status_code == 200
    body = igdb_env["last_body"]
    assert 'search "star fox";' in body
    assert "where platforms = (508);" in body


@requires_db
def test_platform_alias_matches_abbreviation_and_alternative_name(test_user, igdb_env) -> None:
    client_as(test_user).get(SEARCH_URL, params={"q": "goldeneye n64"})
    assert "where platforms = (4);" in igdb_env["last_body"]
    client_as(test_user).get(SEARCH_URL, params={"q": "tomb raider psx"})
    assert "where platforms = (7);" in igdb_env["last_body"]


@requires_db
def test_numeric_only_alias_does_not_eat_the_title(test_user, igdb_env) -> None:
    # Nintendo 64's alternative name is "N64", but a bare "64" is not an alias:
    # if it were, "star fox 64" would become "star fox" on the N64 and hide the
    # 3DS remake.
    client_as(test_user).get(SEARCH_URL, params={"q": "star fox 64"})
    assert 'search "star fox 64";' in igdb_env["last_body"]
    assert "where platforms" not in igdb_env["last_body"]


@requires_db
def test_platform_name_alone_stays_a_name_search(test_user, igdb_env) -> None:
    # Nothing would be left to search for, so "switch" is treated as a title.
    client_as(test_user).get(SEARCH_URL, params={"q": "switch"})
    assert 'search "switch";' in igdb_env["last_body"]
    assert "where platforms" not in igdb_env["last_body"]


@requires_db
def test_platform_filtered_miss_falls_back_to_the_whole_query(test_user, igdb_env) -> None:
    # "Star Fox NES" is a real PC fan game, so a suffix that looked like a
    # platform gets a second chance as part of the title.
    igdb_env["igdb_responses"].append(httpx.Response(200, json=[]))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "star fox switch"})
    assert response.status_code == 200
    assert len(response.json()["results"]) == 1
    first, second = igdb_env["bodies"][0], igdb_env["bodies"][1]
    assert "where platforms = (130);" in first
    assert 'search "star fox switch";' in second
    assert "where platforms" not in second


@requires_db
def test_platform_list_is_fetched_once_and_cached(test_user, igdb_env) -> None:
    client = client_as(test_user)
    client.get(SEARCH_URL, params={"q": "zelda ocarina"})
    client.get(SEARCH_URL, params={"q": "super mario"})
    assert igdb_env["platforms"] == 1


@requires_db
def test_single_word_query_skips_the_platform_fetch(test_user, igdb_env) -> None:
    # One word cannot carry a platform suffix, so a cold process must not pay
    # for the /platforms round trip before searching for it.
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 200
    assert igdb_env["platforms"] == 0


@requires_db
def test_platform_fetch_failure_degrades_to_a_plain_search(test_user, igdb_env) -> None:
    # No alias map means no platform splitting, which is the old behaviour —
    # searching must not fail because /platforms did.
    igdb_env["platform_status"] = 500
    response = client_as(test_user).get(SEARCH_URL, params={"q": "star fox switch 2"})
    assert response.status_code == 200
    assert 'search "star fox switch 2";' in igdb_env["last_body"]


# ---------------------------------------------------------------------------
# Fuzzy fallback and paging
# ---------------------------------------------------------------------------


@requires_db
def test_empty_search_falls_back_to_alternative_names(test_user, igdb_env) -> None:
    # "Civ 6" is not a name IGDB's search matches; it is an alternative name.
    igdb_env["igdb_responses"].append(httpx.Response(200, json=[]))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "civ 6"})
    assert response.status_code == 200
    assert len(response.json()["results"]) == 1
    fallback = igdb_env["bodies"][1]
    assert 'name ~ *"civ 6"*' in fallback
    assert 'alternative_names.name ~ *"civ 6"*' in fallback


@requires_db
def test_page_two_offsets_and_skips_the_fuzzy_fallback(test_user, igdb_env) -> None:
    igdb_env["igdb_responses"].append(httpx.Response(200, json=[]))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "star fox", "page": 2})
    assert response.status_code == 200
    assert response.json()["results"] == []
    # Exactly one call: paging past an exhausted search must not splice in a
    # second, differently-ordered result set.
    assert igdb_env["igdb"] == 1
    assert f"offset {igdb_service.SEARCH_LIMIT};" in igdb_env["last_body"]


@requires_db
def test_page_two_does_not_fall_back_to_the_unfiltered_query(test_user, igdb_env) -> None:
    # A platform-filtered search that runs out at page 2 must stop there.
    # Retrying the whole string unfiltered would append matches for the literal
    # "star fox switch 2" under a list of Switch 2 games.
    igdb_env["igdb_responses"].append(httpx.Response(200, json=[]))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "star fox switch 2", "page": 2})
    assert response.status_code == 200
    assert response.json()["results"] == []
    assert igdb_env["igdb"] == 1
    assert "where platforms = (508);" in igdb_env["last_body"]


@requires_db
def test_page_one_has_no_offset(test_user, igdb_env) -> None:
    client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert "offset 0;" in igdb_env["last_body"]


@requires_db
def test_has_more_is_true_only_on_a_full_pageable_page(test_user, igdb_env) -> None:
    full_page = [{"id": i, "name": f"Game {i}"} for i in range(igdb_service.SEARCH_LIMIT)]
    igdb_env["igdb_responses"].append(httpx.Response(200, json=full_page))
    assert client_as(test_user).get(SEARCH_URL, params={"q": "zelda"}).json()["hasMore"] is True

    # A short page means IGDB has run out.
    igdb_env["igdb_responses"].append(httpx.Response(200, json=full_page[:3]))
    assert client_as(test_user).get(SEARCH_URL, params={"q": "zelda"}).json()["hasMore"] is False

    # The last page the API will serve, however full it is.
    igdb_env["igdb_responses"].append(httpx.Response(200, json=full_page))
    params = {"q": "zelda", "page": igdb_service.MAX_PAGE}
    assert client_as(test_user).get(SEARCH_URL, params=params).json()["hasMore"] is False


@requires_db
def test_full_fuzzy_page_does_not_offer_more(test_user, igdb_env) -> None:
    # The fuzzy fallback only ever runs on page 1, so asking for page 2 of one
    # would come back empty. Say so rather than offering a dead button.
    full_page = [{"id": i, "name": f"Civ {i}"} for i in range(igdb_service.SEARCH_LIMIT)]
    igdb_env["igdb_responses"].append(httpx.Response(200, json=[]))
    igdb_env["igdb_responses"].append(httpx.Response(200, json=full_page))
    body = client_as(test_user).get(SEARCH_URL, params={"q": "civ 6"}).json()
    assert len(body["results"]) == igdb_service.SEARCH_LIMIT
    assert body["hasMore"] is False


@requires_db
def test_has_more_counts_raw_rows_not_parsed_ones(test_user, igdb_env) -> None:
    # One unusable row on an otherwise full page must not read as "IGDB ran
    # out" and hide the button.
    rows = [{"id": i, "name": f"Game {i}"} for i in range(igdb_service.SEARCH_LIMIT - 1)]
    rows.append({"id": 999})  # no name, dropped by the parser
    igdb_env["igdb_responses"].append(httpx.Response(200, json=rows))
    body = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"}).json()
    assert len(body["results"]) == igdb_service.SEARCH_LIMIT - 1
    assert body["hasMore"] is True


@requires_db
def test_page_out_of_range_is_422(test_user, igdb_env) -> None:
    client = client_as(test_user)
    assert client.get(SEARCH_URL, params={"q": "zelda", "page": 0}).status_code == 422
    over = igdb_service.MAX_PAGE + 1
    assert client.get(SEARCH_URL, params={"q": "zelda", "page": over}).status_code == 422


# ---------------------------------------------------------------------------
# Token caching
# ---------------------------------------------------------------------------


@requires_db
def test_twitch_token_is_cached_across_requests(test_user, igdb_env) -> None:
    client = client_as(test_user)
    assert client.get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    assert client.get(SEARCH_URL, params={"q": "mario"}).status_code == 200
    # One mint, two searches: the second request read the token row.
    assert igdb_env["twitch"] == 1
    assert igdb_env["igdb"] == 2


@requires_db
def test_near_expiry_token_is_refreshed(test_user, igdb_env) -> None:
    # A token inside the 1-day safety margin is treated as dead.
    sm = get_sessionmaker()
    with sm() as session:
        igdb_repo.upsert_token(session, "stale-token", datetime.now(UTC) + timedelta(hours=2))
    assert client_as(test_user).get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    assert igdb_env["twitch"] == 1


@requires_db
def test_igdb_401_refreshes_token_and_retries_once(test_user, igdb_env) -> None:
    igdb_env["igdb_responses"].append(httpx.Response(401, json={"message": "expired"}))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 200
    # First mint + forced re-mint after the 401; two IGDB calls total.
    assert igdb_env["twitch"] == 2
    assert igdb_env["igdb"] == 2


@requires_db
def test_persistent_upstream_failure_is_502(test_user, igdb_env) -> None:
    igdb_env["igdb_responses"].append(httpx.Response(500))
    response = client_as(test_user).get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 502


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


@requires_db
def test_rate_limit_returns_429_over_budget(test_user, igdb_env, monkeypatch) -> None:
    monkeypatch.setattr(igdb_service, "RATE_LIMIT_MAX", 3)
    client = client_as(test_user)
    for _ in range(3):
        assert client.get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    response = client.get(SEARCH_URL, params={"q": "zelda"})
    assert response.status_code == 429
    # The 429 was decided before any upstream call was spent on it.
    assert igdb_env["igdb"] == 3


@requires_db
def test_rate_limit_window_resets(test_user, igdb_env, monkeypatch) -> None:
    # A zero-length window means every request sees the previous window as
    # expired — the counter resets instead of accumulating toward the max.
    monkeypatch.setattr(igdb_service, "RATE_LIMIT_MAX", 1)
    monkeypatch.setattr(igdb_service, "RATE_LIMIT_WINDOW", timedelta(seconds=0))
    client = client_as(test_user)
    assert client.get(SEARCH_URL, params={"q": "zelda"}).status_code == 200
    assert client.get(SEARCH_URL, params={"q": "mario"}).status_code == 200


@requires_db
def test_rate_limits_are_per_user(igdb_env, test_user) -> None:
    other_user = uuid.uuid4()
    sm = get_sessionmaker()
    try:
        with sm() as session:
            for expected in (1, 2, 3):
                count = rate_limit_repo.increment_rate_limit(
                    session, test_user, "igdb_search", timedelta(seconds=60)
                )
                assert count == expected
            assert (
                rate_limit_repo.increment_rate_limit(
                    session, other_user, "igdb_search", timedelta(seconds=60)
                )
                == 1
            )
    finally:
        with sm() as session:
            session.execute(text("DELETE FROM rate_limits WHERE user_id = :id"), {"id": other_user})
            session.commit()
