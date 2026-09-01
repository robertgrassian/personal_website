"""Business logic for the IGDB proxy.

The proxy exists so IGDB credentials never reach the browser and so IGDB's
global 4 req/s budget sits behind a per-user rate limit. Domain exceptions
(no HTTP knowledge) map in the router: RateLimitedError (shared, from
services/rate_limit.py) → 429,
IgdbNotConfiguredError → 503, IgdbUpstreamError → 502.

Outbound HTTP lives in the small module-level functions ``_fetch_twitch_token``
and ``_query_igdb`` so tests can stub the network seam and exercise
everything else (rate limiting, token caching, parsing) for real.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx
from fastapi import status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import DomainError
from app.core.text import fold_text
from app.repositories import igdb as igdb_repo
from app.schemas.igdb import IgdbSearchResponse, IgdbSearchResult
from app.services import rate_limit

logger = logging.getLogger(__name__)

RATE_LIMIT_BUCKET = "igdb_search"
RATE_LIMIT_MAX = 30
RATE_LIMIT_WINDOW = timedelta(seconds=60)

# Refresh the Twitch token when it has less than a day left. Tokens live
# ~60 days, so refreshes are rare; the wide margin means a token handed to a
# request can't expire mid-flight.
TOKEN_EXPIRY_MARGIN = timedelta(days=1)

SEARCH_LIMIT = 25
# The picker pages by appending, so this caps how deep "show more" can dig.
# Each page is one more IGDB call, hence a bound rather than open-ended paging.
MAX_PAGE = 4

_TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
_IGDB_GAMES_URL = "https://api.igdb.com/v4/games"
_IGDB_PLATFORMS_URL = "https://api.igdb.com/v4/platforms"
_HTTP_TIMEOUT = 10.0

# IGDB's game_type ids, lowest number = most likely the thing you meant.
# Searching "pokemon fire red" puts the ROM hack (Mod) above the actual game
# (Remake) on IGDB's own relevance order, so results get re-sorted by this.
_GAME_TYPE_RANK = {
    0: 0,  # Main Game
    8: 1,  # Remake
    9: 1,  # Remaster
    11: 1,  # Port
    4: 2,  # Standalone Expansion
    10: 2,  # Expanded Game
    2: 3,  # Expansion
    1: 4,  # DLC
    13: 4,  # Pack / Addon
    6: 4,  # Episode
    7: 4,  # Season
    3: 5,  # Bundle
    5: 6,  # Mod
    12: 6,  # Fork
    14: 6,  # Update
}
_DEFAULT_GAME_TYPE_RANK = 3

# Vendor prefixes dropped when deriving platform aliases, so "switch 2" matches
# "Nintendo Switch 2" and "ps5" is not the only way to say PlayStation 5.
_PLATFORM_VENDOR_PREFIXES = (
    "nintendo ",
    "sony ",
    "microsoft ",
    "sega ",
    "atari ",
    "commodore ",
)

# A typed platform is at most this many words ("xbox series x s" is four).
_MAX_PLATFORM_WORDS = 4

PLATFORM_CACHE_TTL = timedelta(hours=12)

# alias -> platform ids, cached per process rather than in Postgres: it is 220
# rows of rarely-changing reference data, so a cold serverless instance paying
# one extra IGDB call every 12 hours is cheaper than a table and a migration.
_platform_aliases: dict[str, tuple[int, ...]] | None = None
_platform_aliases_expire_at: datetime | None = None


class IgdbNotConfiguredError(DomainError):
    """TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set in this environment."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    def __init__(self) -> None:
        super().__init__("Game search is not configured in this environment.")


class IgdbUpstreamError(DomainError):
    """Twitch or IGDB answered with an error we can't recover from."""

    status_code = status.HTTP_502_BAD_GATEWAY

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


def _query_igdb(
    settings: Settings,
    token: str,
    body: str,
    url: str = _IGDB_GAMES_URL,
    timeout: float | None = None,
) -> httpx.Response:
    """POST an Apicalypse query to an IGDB endpoint. Returns the raw response —
    the caller inspects the status so it can retry once on 401.

    ``timeout`` overrides _HTTP_TIMEOUT for callers on a tighter deadline than
    a browser search: the catalog refresh runs inside a public read whose own
    client gives up after five seconds, so a ten-second ceiling there would
    fail the page rather than the lookup."""
    try:
        return httpx.post(
            url,
            headers={
                "Client-ID": settings.twitch_client_id or "",
                "Authorization": f"Bearer {token}",
                "Content-Type": "text/plain",
            },
            content=body,
            timeout=_HTTP_TIMEOUT if timeout is None else timeout,
        )
    except httpx.HTTPError as exc:
        raise IgdbUpstreamError("could not reach IGDB") from exc


def _get_cached_token(db: Session) -> str | None:
    """The stored Twitch token if it is good for a while yet, else None. Split
    out so a caller on a deadline can find out whether IGDB is reachable
    WITHOUT paying for a mint (see _run_query_cached_token)."""
    cached = igdb_repo.get_token(db)
    if cached is not None and cached.expires_at > datetime.now(UTC) + TOKEN_EXPIRY_MARGIN:
        return cached.access_token
    return None


def _get_valid_token(db: Session, settings: Settings, *, force_refresh: bool = False) -> str:
    """The cached Twitch token, refreshed through Postgres when missing or
    near expiry. The cache is a DB row, not process memory, because every
    serverless instance must share one token."""
    if not force_refresh:
        cached = _get_cached_token(db)
        if cached is not None:
            return cached
    access_token, expires_at = _fetch_twitch_token(settings)
    igdb_repo.upsert_token(db, access_token, expires_at)
    return access_token


def _run_query(
    db: Session, settings: Settings, body: str, url: str = _IGDB_GAMES_URL
) -> list[dict]:
    """Send one Apicalypse query and return its rows, refreshing the cached
    token and retrying exactly once if IGDB rejects it as expired.

    Reliable rather than bounded: this can cost up to four HTTP requests (two
    of them token mints on their own ten-second ceiling). A caller that cannot
    afford that wants _run_query_cached_token instead.
    """
    token = _get_valid_token(db, settings)
    response = _query_igdb(settings, token, body, url)
    if response.status_code == 401:
        # The cached token died early (revoked or clock drift past the
        # margin): mint a fresh one and retry exactly once.
        token = _get_valid_token(db, settings, force_refresh=True)
        response = _query_igdb(settings, token, body, url)
    if response.status_code != 200:
        raise IgdbUpstreamError(f"IGDB answered {response.status_code}")
    return response.json()


def _run_query_cached_token(
    db: Session, settings: Settings, body: str, timeout: float
) -> list[dict] | None:
    """One Apicalypse query on a HARD one-request budget, or None.

    Everything _run_query does to be reliable costs an unbounded extra request:
    minting a token when the cache is cold, and re-minting on a 401. That is
    right where a user is waiting on a search and wrong on a deadline, because
    _fetch_twitch_token has its own ten-second ceiling that no timeout argument
    reaches -- so "two seconds" would really have been up to twenty-four.

    So this makes exactly one HTTP call and gives up otherwise. A cold token
    cache means no refresh this round rather than a slow one; the search and
    add paths mint on their own schedule and this rides on whatever they left.
    """
    token = _get_cached_token(db)
    if token is None:
        logger.info("Skipping a deadline-bound IGDB query: no usable cached token")
        return None
    response = _query_igdb(settings, token, body, _IGDB_GAMES_URL, timeout)
    if response.status_code != 200:
        # Including a 401. Recovering from that means minting, which is the
        # unbounded request this function exists to refuse.
        logger.info("Deadline-bound IGDB query answered %s", response.status_code)
        return None
    return response.json()


def _add_alias(aliases: dict[str, set[int]], raw: str, platform_id: int) -> None:
    """Record one way of naming a platform, unless it is unusable as a query
    suffix. Aliases with no letter are dropped: Nintendo 64's "64" would
    otherwise swallow the tail of "Star Fox 64" and hide the 3DS remake."""
    alias = fold_text(raw)
    if len(alias) < 2 or not any(c.isalpha() for c in alias):
        return
    if len(alias.split()) > _MAX_PLATFORM_WORDS:
        return
    aliases.setdefault(alias, set()).add(platform_id)


def _build_platform_aliases(rows: list[dict]) -> dict[str, tuple[int, ...]]:
    """IGDB's /platforms rows -> every string a user might type for them.

    One alias can map to several platforms ("ps" covers a few), so the values
    are tuples that become an OR-ed `where platforms = (...)` clause.
    """
    collected: dict[str, set[int]] = {}
    for row in rows:
        platform_id = row.get("id")
        if platform_id is None:
            continue
        name = row.get("name") or ""
        _add_alias(collected, name, platform_id)
        _add_alias(collected, row.get("abbreviation") or "", platform_id)
        # alternative_name is one string that sometimes holds a comma-separated
        # list ("PSX, PSOne, PS").
        for alt in (row.get("alternative_name") or "").split(","):
            _add_alias(collected, alt, platform_id)
        # "Nintendo Switch 2" -> "switch 2", which is how people actually type it.
        normalized = fold_text(name)
        for prefix in _PLATFORM_VENDOR_PREFIXES:
            if normalized.startswith(prefix):
                _add_alias(collected, normalized[len(prefix) :], platform_id)
    return {alias: tuple(sorted(ids)) for alias, ids in collected.items()}


def _get_platform_aliases(db: Session, settings: Settings) -> dict[str, tuple[int, ...]]:
    """The alias map, fetched from IGDB on first use and refreshed every
    PLATFORM_CACHE_TTL. Failure is not fatal: an empty map just means the
    query goes to IGDB unsplit, which is the old behaviour."""
    global _platform_aliases, _platform_aliases_expire_at
    now = datetime.now(UTC)
    if (
        _platform_aliases is not None
        and _platform_aliases_expire_at is not None
        and _platform_aliases_expire_at > now
    ):
        return _platform_aliases
    try:
        rows = _run_query(
            db,
            settings,
            "fields name, abbreviation, alternative_name; limit 500;",
            _IGDB_PLATFORMS_URL,
        )
    except IgdbUpstreamError:
        # Cache the failure briefly so one IGDB wobble doesn't make every
        # subsequent search pay for another timeout.
        _platform_aliases = {}
        _platform_aliases_expire_at = now + timedelta(minutes=5)
        return _platform_aliases
    _platform_aliases = _build_platform_aliases(rows)
    _platform_aliases_expire_at = now + PLATFORM_CACHE_TTL
    return _platform_aliases


def _split_platform_suffix(
    query: str, aliases: dict[str, tuple[int, ...]]
) -> tuple[str, tuple[int, ...]]:
    """ "star fox switch 2" -> ("star fox", (508,)).

    IGDB's `search` matches game names only, so a typed console makes the
    whole query miss. The longest matching suffix wins ("nintendo switch 2"
    beats "switch 2"), and a suffix is only taken when something is left to
    search for — "switch" alone stays a name search.
    """
    words = query.split()
    for take in range(min(_MAX_PLATFORM_WORDS, len(words) - 1), 0, -1):
        candidate = fold_text(" ".join(words[-take:]))
        platform_ids = aliases.get(candidate)
        if platform_ids:
            return " ".join(words[:-take]), platform_ids
    return query, ()


def _escape_apicalypse(term: str) -> str:
    """Escape a user-supplied search term for interpolation into an
    Apicalypse string literal (backslashes first, then quotes)."""
    return term.replace("\\", "\\\\").replace('"', '\\"')


def _upgrade_cover_url(url: str) -> str:
    """IGDB cover URL → the 264x374 (t_cover_big) size the shelves hotlink.
    IGDB returns protocol-relative thumbnails
    (//images.igdb.com/.../t_thumb/...): upgrade the size, then make the scheme
    explicit only when it's actually missing — guarding against a doubled
    scheme (https:https://...) if IGDB ever returns an already-absolute URL.
    The result must satisfy validate_igdb_image_url so a later POST /me/games
    with this cover isn't rejected."""
    if not url:
        return ""
    url = url.replace("t_thumb", "t_cover_big")
    return f"https:{url}" if url.startswith("//") else url


def _rank_rows(raw: list[dict]) -> list[dict]:
    """Re-sort one page of IGDB rows so real games outrank mods and bundles.

    Python's sort is stable, so IGDB's own relevance order survives inside
    each tier: this only ever moves a Mod below a Remake, never reshuffles two
    main games.
    """
    return sorted(
        raw,
        key=lambda row: _GAME_TYPE_RANK.get(row.get("game_type"), _DEFAULT_GAME_TYPE_RANK),
    )


def _parse_results(raw: list[dict]) -> list[IgdbSearchResult]:
    """IGDB rows → wire DTOs. Every field except name/id is optional on
    IGDB's side, hence the .get chains; absent scalars become "" per the
    site-wide wire convention."""
    results: list[IgdbSearchResult] = []
    for row in raw:
        # id and name are the two fields a candidate can't do without — one
        # identifies it, the other renders it. A row missing either is dropped
        # rather than subscripted: one malformed row would otherwise turn the
        # whole search into a KeyError 500 instead of the 502 the router
        # reserves for upstream trouble.
        igdb_id = row.get("id")
        name = row.get("name")
        if igdb_id is None or not name:
            continue
        release_ts = row.get("first_release_date")
        # `or []` / `or ""` rather than a .get default: IGDB omits these keys,
        # but an explicit null would slip past a default and blow up below.
        cover_url = (row.get("cover") or {}).get("url") or ""
        results.append(
            IgdbSearchResult(
                igdb_id=igdb_id,
                name=name,
                # IGDB dates are unix timestamps (UTC midnight of release day).
                release_date=(
                    datetime.fromtimestamp(release_ts, tz=UTC).date().isoformat()
                    if release_ts
                    else ""
                ),
                platforms=[p["name"] for p in row.get("platforms") or []],
                genres=[g["name"] for g in row.get("genres") or []],
                cover_url=_upgrade_cover_url(cover_url),
            )
        )
    return results


_FIELDS = "fields name, first_release_date, platforms.name, genres.name, cover.url, game_type;"


def _id_list(platform_ids: tuple[int, ...]) -> str:
    return ",".join(str(p) for p in platform_ids)


def _search_body(query: str, platform_ids: tuple[int, ...], offset: int) -> str:
    """A name search, optionally narrowed to platforms. `= (a,b)` on an array
    field is an OR, so an alias covering several platforms still matches a
    game on any one of them."""
    where = f" where platforms = ({_id_list(platform_ids)});" if platform_ids else ""
    return (
        f'search "{_escape_apicalypse(query)}";'
        f" {_FIELDS}"
        f"{where}"
        f" limit {SEARCH_LIMIT}; offset {offset};"
    )


def _fuzzy_body(query: str, platform_ids: tuple[int, ...]) -> str:
    """Last resort when a name search finds nothing: substring-match the name
    and IGDB's alternative names. `~ *"..."*` is a case-insensitive contains,
    and alternative_names is what knows "Civ 6" means Civilization VI."""
    escaped = _escape_apicalypse(query)
    clauses = f'(name ~ *"{escaped}"* | alternative_names.name ~ *"{escaped}"*)'
    if platform_ids:
        clauses += f" & platforms = ({_id_list(platform_ids)})"
    return f"{_FIELDS} where {clauses}; limit {SEARCH_LIMIT};"


def search_games(db: Session, user_id: uuid.UUID, query: str, page: int = 1) -> IgdbSearchResponse:
    """Search IGDB on behalf of an authenticated caller.

    Order matters: the rate limit is charged before any upstream call, so a
    hammering client burns its own budget, never the IGDB quota. One request
    is one charge no matter how many upstream calls the fallbacks below cost.
    """
    settings = get_settings()
    if not settings.twitch_client_id or not settings.twitch_client_secret:
        raise IgdbNotConfiguredError()

    rate_limit.enforce(
        db,
        user_id,
        RATE_LIMIT_BUCKET,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW,
        f"Too many searches — limited to {RATE_LIMIT_MAX} per minute. Wait a moment and try again.",
    )

    offset = (page - 1) * SEARCH_LIMIT
    stripped = query.strip()
    # A one-word query cannot have a platform suffix (splitting it would leave
    # nothing to search for), so it must not pay for the alias fetch.
    aliases = _get_platform_aliases(db, settings) if " " in stripped else {}
    name_query, platform_ids = _split_platform_suffix(stripped, aliases)

    # Tried in order, stopping at the first that returns anything. Each step
    # loosens the previous one, so the common case still costs a single call.
    # Both fallbacks are first-page only: reaching one on a later page would
    # mean the strategy behind the earlier pages ran out, and appending a
    # different strategy's results there splices two unrelated lists together.
    # Neither is pageable, hence pageable=False on the ones that can't be.
    attempts = [(_search_body(name_query, platform_ids, offset), True)]
    if page == 1:
        if platform_ids:
            # The suffix may have been part of the title after all ("Star Fox
            # NES" is a real PC fan game), so retry with the whole string.
            attempts.append((_search_body(query, (), offset), True))
        attempts.append((_fuzzy_body(name_query, platform_ids), False))

    for body, pageable in attempts:
        raw = _run_query(db, settings, body)
        if raw:
            return IgdbSearchResponse(
                results=_parse_results(_rank_rows(raw)),
                # Counted from the rows IGDB sent, not the parsed ones: a
                # malformed row that _parse_results drops would otherwise look
                # like the end of the results and hide the "show more" button.
                has_more=pageable and len(raw) == SEARCH_LIMIT and page < MAX_PAGE,
            )
    return IgdbSearchResponse(results=[], has_more=False)


@dataclass(frozen=True)
class IgdbGameFacts:
    """What IGDB knows about one game that the catalog stores.

    Deliberately not the game's NAME. IGDB's title is frequently not the one
    this library wants (scripts/backfill_titles.py is a hand-checked list of
    the cases where it is wrong), and the stored name is what the Wikipedia
    genre lookup searches on, so overwriting it from here would break genres
    for the row it just "fixed".
    """

    release_date: date | None
    platforms: list[str]
    cover_url: str


def _fetch_one_game(
    db: Session, igdb_id: int, fields: str, what: str, *, deadline_timeout: float | None = None
) -> dict | None:
    """One IGDB row by id, or None on a miss, a misconfiguration or an outage.

    Never raises, which is the shared rule for every lookup that rides on
    another request (see lookup_platforms and genres.lookup_one): a third-party
    problem must not fail the add or read that triggered it.

    ``deadline_timeout`` switches to the one-request budget above. Without it
    this takes the reliable path, which can mint a token and retry.
    """
    settings = get_settings()
    if not settings.twitch_client_id or not settings.twitch_client_secret:
        return None
    # Interpolated as an int rather than escaped as text: Apicalypse has no
    # bound parameters, and int() is what makes the interpolation safe.
    body = f"{fields} where id = {int(igdb_id)}; limit 1;"
    try:
        if deadline_timeout is None:
            rows = _run_query(db, settings, body)
        else:
            rows = _run_query_cached_token(db, settings, body, deadline_timeout)
    except Exception:
        logger.exception("%s failed for IGDB id %s", what, igdb_id)
        return None
    return rows[0] if rows else None


def _platform_names(row: dict) -> list[str]:
    """IGDB's platform names off a game row, sorted. The sort is what makes
    scripts/backfill_platforms.py's "nothing to change" true rather than
    merely likely, so every path that writes this column shares it."""
    return sorted(p["name"] for p in row.get("platforms") or [] if p.get("name"))


def lookup_platforms(db: Session, igdb_id: int) -> list[str]:
    """Every platform IGDB lists for one game, in IGDB's own names. [] on a miss.

    For the add write path, so a catalog row carries its platforms the moment
    it is created rather than waiting for scripts/backfill_platforms.py. Same
    query that script runs, so the two agree and a later re-run finds nothing
    to change -- including the sort, which is what makes "nothing to change"
    true rather than merely likely.

    Two rules borrowed from genres.lookup_one, which shares this path:

      * Never raises. A third-party miss must not fail an add; the caller
        stores [] and the read path falls back to the user's own systems.
      * No rate limit of its own. Unlike search_games this is not a request a
        client can aim at IGDB directly -- it rides on a write already bounded
        by rate_limit_writes, one call per new catalog row.
    """
    row = _fetch_one_game(db, igdb_id, "fields platforms.name;", "Platform lookup")
    return _platform_names(row) if row else []


def lookup_game_facts(db: Session, igdb_id: int, *, timeout: float) -> IgdbGameFacts | None:
    """Everything the catalog re-sources from IGDB, in ONE request. None on a
    miss, a misconfiguration, an outage or a cold token cache.

    For the staleness refresh (services/catalog_refresh.py), which needs the
    release date and the cover as well as the platforms lookup_platforms
    already answers -- and needs them without paying three round trips inside
    a read someone is waiting on. Same never-raises rule as lookup_platforms.

    ``timeout`` is required, not optional: this is only ever called from a path
    that has a deadline, and it bounds the whole call rather than one leg of it
    (see _run_query_cached_token).
    """
    row = _fetch_one_game(
        db,
        igdb_id,
        "fields first_release_date, platforms.name, cover.url;",
        "Catalog refresh lookup",
        deadline_timeout=timeout,
    )
    if row is None:
        return None
    release_ts = row.get("first_release_date")
    return IgdbGameFacts(
        # IGDB dates are unix timestamps (UTC midnight of release day). Absent
        # for an announced-but-undated game, which is the case this whole
        # refresh exists for: it becomes a real date once IGDB has one.
        release_date=(datetime.fromtimestamp(release_ts, tz=UTC).date() if release_ts else None),
        platforms=_platform_names(row),
        cover_url=_upgrade_cover_url((row.get("cover") or {}).get("url") or ""),
    )
