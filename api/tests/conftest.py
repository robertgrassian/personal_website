"""Suite-wide fixtures.

Two things, both consequences of the add-game write path calling Wikipedia.
Before that, every third-party call lived in a script or a route no DB test
touched, so nothing in the suite could reach the network by accident. Once
create_my_game started sourcing genres, any test that added a game started
making live requests without anyone noticing -- they passed locally, where the
DB tests skip for want of DATABASE_URL, and failed in CI against whatever the
search happened to return that day.

`stub_genre_lookup` is the fix for the modules that add games; `no_outbound_http`
is the backstop that makes the next module to forget fail loudly instead of
quietly depending on Wikipedia. It both raises and records, because the callers
swallow exceptions by design; see its docstring.

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

from app.services import genres as genre_service


@pytest.fixture
def stub_genre_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    """Resolve every genre lookup to a clean miss.

    Opt-in rather than autouse, because test_genres.py is the one module that
    tests lookup_one itself and must keep the real implementation. Everywhere
    else a miss is the right default: it falls back to the genres in the
    request body, so those tests assert on what they sent rather than on what
    Wikipedia says today. Tests that want the sourcing itself override this.
    """
    monkeypatch.setattr(genre_service, "lookup_one", lambda name: [])

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
