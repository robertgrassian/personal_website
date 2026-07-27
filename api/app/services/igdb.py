"""Business logic for the IGDB proxy.

The proxy exists so IGDB credentials never reach the browser and so IGDB's
global 4 req/s budget sits behind a per-user rate limit. Domain exceptions
(no HTTP knowledge) map in the router: RateLimitedError → 429,
IgdbNotConfiguredError → 503, IgdbUpstreamError → 502.

Outbound HTTP lives in the small module-level functions ``_fetch_twitch_token``
and ``_query_igdb`` so tests can stub the network seam and exercise
everything else (rate limiting, token caching, parsing) for real.
"""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.repositories import igdb as igdb_repo
from app.schemas.igdb import IgdbSearchResult

RATE_LIMIT_BUCKET = "igdb_search"
RATE_LIMIT_MAX = 30
RATE_LIMIT_WINDOW = timedelta(seconds=60)

# Refresh the Twitch token when it has less than a day left. Tokens live
# ~60 days, so refreshes are rare; the wide margin means a token handed to a
# request can't expire mid-flight.
TOKEN_EXPIRY_MARGIN = timedelta(days=1)

SEARCH_LIMIT = 10

_TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
_IGDB_GAMES_URL = "https://api.igdb.com/v4/games"
_HTTP_TIMEOUT = 10.0


class RateLimitedError(Exception):
    """The caller exceeded their search budget for the current window."""

    def __init__(self) -> None:
        super().__init__(
            f"Too many searches — limited to {RATE_LIMIT_MAX} per minute. "
            "Wait a moment and try again."
        )


class IgdbNotConfiguredError(Exception):
    """TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set in this environment."""

    def __init__(self) -> None:
        super().__init__("Game search is not configured in this environment.")


class IgdbUpstreamError(Exception):
    """Twitch or IGDB answered with an error we can't recover from."""

    def __init__(self, detail: str) -> None:
        super().__init__(f"Game search is temporarily unavailable ({detail}).")


def _fetch_twitch_token(settings: Settings) -> tuple[str, datetime]:
    """Mint a fresh app token from Twitch (client-credentials grant).
    Returns (access_token, expires_at)."""
    try:
        response = httpx.post(
            _TWITCH_TOKEN_URL,
            params={
                "client_id": settings.twitch_client_id,
                "client_secret": settings.twitch_client_secret,
                "grant_type": "client_credentials",
            },
            timeout=_HTTP_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise IgdbUpstreamError("could not reach Twitch") from exc
    if response.status_code != 200:
        raise IgdbUpstreamError(f"Twitch auth failed with {response.status_code}")
    data = response.json()
    expires_at = datetime.now(UTC) + timedelta(seconds=data["expires_in"])
    return data["access_token"], expires_at


def _query_igdb(settings: Settings, token: str, body: str) -> httpx.Response:
    """POST an Apicalypse query to IGDB. Returns the raw response — the
    caller inspects the status so it can retry once on 401."""
    try:
        return httpx.post(
            _IGDB_GAMES_URL,
            headers={
                "Client-ID": settings.twitch_client_id or "",
                "Authorization": f"Bearer {token}",
                "Content-Type": "text/plain",
            },
            content=body,
            timeout=_HTTP_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise IgdbUpstreamError("could not reach IGDB") from exc


def _get_valid_token(db: Session, settings: Settings, *, force_refresh: bool = False) -> str:
    """The cached Twitch token, refreshed through Postgres when missing or
    near expiry. The cache is a DB row, not process memory, because every
    serverless instance must share one token."""
    if not force_refresh:
        cached = igdb_repo.get_token(db)
        if cached is not None and cached.expires_at > datetime.now(UTC) + TOKEN_EXPIRY_MARGIN:
            return cached.access_token
    access_token, expires_at = _fetch_twitch_token(settings)
    igdb_repo.upsert_token(db, access_token, expires_at)
    return access_token


def _escape_apicalypse(term: str) -> str:
    """Escape a user-supplied search term for interpolation into an
    Apicalypse string literal (backslashes first, then quotes)."""
    return term.replace("\\", "\\\\").replace('"', '\\"')


def _parse_results(raw: list[dict]) -> list[IgdbSearchResult]:
    """IGDB rows → wire DTOs. Every field except name/id is optional on
    IGDB's side, hence the .get chains; absent scalars become "" per the
    site-wide wire convention."""
    results: list[IgdbSearchResult] = []
    for row in raw:
        release_ts = row.get("first_release_date")
        cover_url = (row.get("cover") or {}).get("url", "")
        results.append(
            IgdbSearchResult(
                igdb_id=row["id"],
                name=row["name"],
                # IGDB dates are unix timestamps (UTC midnight of release day).
                release_date=(
                    datetime.fromtimestamp(release_ts, tz=UTC).date().isoformat()
                    if release_ts
                    else ""
                ),
                platforms=[p["name"] for p in row.get("platforms", [])],
                genres=[g["name"] for g in row.get("genres", [])],
                # IGDB returns protocol-relative thumbnail URLs; upgrade to
                # the 264x374 cover size the shelves already hotlink.
                cover_url=cover_url.replace("t_thumb", "t_cover_big").replace(
                    "//images", "https://images", 1
                ),
            )
        )
    return results


def search_games(db: Session, user_id: uuid.UUID, query: str) -> list[IgdbSearchResult]:
    """Search IGDB on behalf of an authenticated caller.

    Order matters: the rate limit is charged before any upstream call, so a
    hammering client burns its own budget, never the IGDB quota.
    """
    settings = get_settings()
    if not settings.twitch_client_id or not settings.twitch_client_secret:
        raise IgdbNotConfiguredError()

    count = igdb_repo.increment_rate_limit(db, user_id, RATE_LIMIT_BUCKET, RATE_LIMIT_WINDOW)
    if count > RATE_LIMIT_MAX:
        raise RateLimitedError()

    body = (
        f'search "{_escape_apicalypse(query)}"; '
        "fields name, first_release_date, platforms.name, genres.name, cover.url; "
        f"limit {SEARCH_LIMIT};"
    )

    token = _get_valid_token(db, settings)
    response = _query_igdb(settings, token, body)
    if response.status_code == 401:
        # The cached token died early (revoked or clock drift past the
        # margin): mint a fresh one and retry exactly once.
        token = _get_valid_token(db, settings, force_refresh=True)
        response = _query_igdb(settings, token, body)
    if response.status_code != 200:
        raise IgdbUpstreamError(f"IGDB answered {response.status_code}")

    return _parse_results(response.json())
