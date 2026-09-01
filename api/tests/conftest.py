"""Suite-wide fixtures.

`purge_suite_catalog_rows` collects the catalog rows the suite leaks; see its
docstring. The other two are consequences of the add-game write path calling
Wikipedia. Before that, every third-party call lived in a script or a route no DB test
touched, so nothing in the suite could reach the network by accident. Once
create_my_game started sourcing genres, any test that added a game started
making live requests without anyone noticing -- they passed locally, where the
DB tests skip for want of DATABASE_URL, and failed in CI against whatever the
search happened to return that day.

`stub_genre_lookup` and `stub_platform_lookup` are the fix for the modules that
add games; `no_outbound_http` is the backstop that makes the next module to
forget fail loudly instead of quietly depending on Wikipedia or IGDB. It both
raises and records, because the callers swallow exceptions by design; see its
docstring.

Blocking the module-level httpx functions rather than sockets is deliberate.
The two seams that reach third parties are services/genres.py (httpx.get) and
services/igdb.py (httpx.post), and blocking at this level leaves alone the two
things in the suite that legitimately open sockets: psycopg's connection to
Postgres, and TestClient, which drives the app in-process through an
ASGITransport on its own httpx.Client and never goes through these.
"""

from urllib.parse import urlsplit

import httpx
import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.services import catalog_refresh
from app.services import genres as genre_service
from app.services import igdb as igdb_service


@pytest.fixture(scope="session", autouse=True)
def purge_suite_catalog_rows():
    """Delete the game_metadata rows the suite leaves behind.

    Deleting a test's auth.users row cascades away everything it owns, but not
    the catalog rows its games point at: game_metadata is the parent of that FK,
    and created_by_user_id is ON DELETE SET NULL so a row outlives the account
    that entered it. The cascade therefore strips the only column marking a row
    as a test's and leaves it. Nothing collides afterwards either, since
    uq_game_metadata_creator_name is UNIQUE over (created_by_user_id, name) and
    NULLs never conflict -- so this silently grew to thousands of rows.

    Deleting needs both guards: the watermark alone would take a row added
    through the UI mid-run, and the orphan check alone would take a shared row
    that legitimately has no links today.
    """
    settings = get_settings()
    # Same environment guard as scripts/seed.py, for the same reason: .env may
    # hold a prod URL during a debugging session, and this issues a DELETE.
    if not settings.database_url or settings.app_env != "dev":
        yield
        return

    session_maker = get_sessionmaker()
    with session_maker() as session:
        watermark = session.execute(
            text("SELECT COALESCE(MAX(id), 0) FROM game_metadata")
        ).scalar_one()

    try:
        yield
    finally:
        # finally, so an interpreter-level exit still collects the rows.
        with session_maker() as session:
            session.execute(
                text("""
                    DELETE FROM game_metadata m
                    WHERE m.id > :watermark
                      AND NOT EXISTS (SELECT 1 FROM played_games p WHERE p.metadata_id = m.id)
                      AND NOT EXISTS (SELECT 1 FROM wishlist_games w WHERE w.metadata_id = m.id)
                """),
                {"watermark": watermark},
            )
            session.commit()


@pytest.fixture
def stub_genre_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Resolve every genre lookup to a clean miss.

    Opt-in rather than autouse, because test_genres.py is the one module that
    tests lookup_one itself and must keep the real implementation. Everywhere
    else a miss is the right default: it falls back to the genres in the
    request body, so those tests assert on what they sent rather than on what
    Wikipedia says today. Tests that want the sourcing itself override this.
    """
    # **_kwargs because the catalog refresh calls this with a tighter timeout
    # than the add path does; a stub that pins the signature would turn that
    # into a TypeError inside a read.
    monkeypatch.setattr(genre_service, "lookup_one", lambda name, **_kwargs: [])


@pytest.fixture(autouse=True)
def stub_catalog_refresh(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stop the public library reads re-sourcing anything.

    Autouse, unlike the two below, because this fires from a READ rather than a
    write: any DB test that reads a library is exposed, not only the ones that
    add a game. Today they escape because a row created during the test is
    never due -- so without this the suite would start reaching Wikipedia the
    first time a fixture used a backdated row, and no_outbound_http would fail
    a test that looks unrelated. The refresh has its own module of tests, which
    call it directly rather than through a route.
    """
    monkeypatch.setattr(catalog_refresh, "refresh_stale_rows", lambda db, rows: None)


@pytest.fixture
def stub_platform_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Resolve every platform lookup to a clean miss.

    Same shape and same reason as stub_genre_lookup: create_my_game calls IGDB
    for a new catalog row's platforms, so without this every DB test that adds
    a game reaches the network. Opt-in for symmetry, and so test_igdb_api.py
    keeps the real implementation. A miss stores [], which is what these tests
    already assert.
    """
    monkeypatch.setattr(igdb_service, "lookup_platforms", lambda db, igdb_id: [])


# The module-level conveniences. httpx.Client methods are untouched on purpose,
# because that is what TestClient is built on.
_BLOCKED = ("get", "post", "put", "patch", "delete", "head", "options", "request", "stream")

# Loopback stays reachable. The Supabase admin calls (services/supabase_admin.py)
# point at a local GoTrue on 127.0.0.1:54321, and several tests exercise the
# path where it is simply not running: the connection is refused, the service's
# own handler turns that into the failure the test asserts on. That is already
# deterministic -- nothing off-machine is involved -- so blocking it would only
# break tests that were never the problem. What this fixture is for is the
# genuinely external hosts: Wikipedia and IGDB.
_ALLOWED_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "testserver"})


class OutboundHTTPBlocked(Exception):
    """Raised in place of a real request to an off-machine host."""


# httpx.request and httpx.stream take (method, url); the rest take (url) first.
_URL_IS_SECOND = frozenset({"request", "stream"})


@pytest.fixture(autouse=True)
def no_outbound_http(monkeypatch: pytest.MonkeyPatch):
    """Fail any test that makes a real outbound HTTP request.

    A test that needs a third-party response stubs the seam its service calls
    (`genre_service._get`, see test_genres.py). Reaching this is a bug in the
    test, not a reason to allow the call.

    Raising is not enough on its own. Both services that call out wrap their
    requests in a broad `except Exception` so that a third-party outage degrades
    to a miss rather than failing a user's request, which is right in production
    and would silently absorb this guard in a test -- handing the caller a
    plausible-looking empty result, the same quietness that let the Wikipedia
    calls into the suite to begin with. So every blocked call is also recorded,
    and the check below fails the test at teardown whether or not the raise
    survived.

    An earlier version solved that by inheriting from BaseException to get past
    those handlers. It worked and cost too much: BaseException is outside the
    `(OutcomeException, Exception)` that pytest catches around finalizers, so a
    guard firing in a fixture teardown escaped the finalizer loop and every
    remaining finalizer on that node was skipped -- leaking monkeypatch undos
    into later tests and orphaning rows the fixture was meant to delete.
    """
    blocked: list[str] = []

    for name in _BLOCKED:
        monkeypatch.setattr(httpx, name, _guard(name, getattr(httpx, name), blocked))

    yield

    if blocked:
        pytest.fail(
            "Test made real outbound HTTP request(s) to: "
            + ", ".join(sorted(set(blocked)))
            + ". Stub the service's seam instead (e.g. monkeypatch genre_service._get)."
        )


def _guard(name, original, blocked: list[str]):
    """Wrap one httpx function so off-machine hosts raise and loopback passes
    through to the real implementation."""

    def guarded(*args, **kwargs):
        url = kwargs.get("url")
        if url is None:
            index = 1 if name in _URL_IS_SECOND else 0
            url = args[index] if len(args) > index else "?"
        if urlsplit(str(url)).hostname in _ALLOWED_HOSTS:
            return original(*args, **kwargs)
        blocked.append(str(url))
        raise OutboundHTTPBlocked(
            f"Test made a real outbound HTTP request to {str(url)!r}. "
            "Stub the service's seam instead (e.g. monkeypatch genre_service._get)."
        )

    return guarded
