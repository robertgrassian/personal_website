"""The Bruno collection in api/bruno must describe every endpoint we serve.

A hand-maintained collection drifts the moment someone adds a route and forgets
it, and a collection that is missing routes is worse than none: it reads as
complete. This compares it against the app's own OpenAPI document, which is
generated, so the check costs nothing to keep true.
"""

import re
from pathlib import Path

from app.core.config import API_PREFIX
from app.main import create_app

BRUNO_DIR = Path(__file__).resolve().parents[1] / "bruno"

# Bruno stores each request as a `<method> { url: ... }` block. Parsing that much
# by regex avoids a Node dependency in the Python test suite; anything more of the
# format (bodies, auth, docs) is not what this test is about.
_REQUEST_BLOCK = re.compile(
    r"^(get|post|put|patch|delete)\s*\{(.*?)^\}", re.MULTILINE | re.DOTALL | re.IGNORECASE
)
_URL_LINE = re.compile(r"^\s*url:\s*(\S+)", re.MULTILINE)

# The collection names path parameters after the environment variable a caller
# would fill in; OpenAPI names them after the handler's argument.
_PLACEHOLDERS = {
    "{{gameId}}": "{game_id}",
    "{{wishlistItemId}}": "{item_id}",
    "{{sessionId}}": "{session_id}",
    "{{username}}": "{username}",
    "{{otherUsername}}": "{username}",
}


def _collection_endpoints() -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for path in BRUNO_DIR.rglob("*.bru"):
        if path.name in {"folder.bru", "collection.bru"} or path.parent.name == "environments":
            continue
        source = path.read_text(encoding="utf-8")
        for method, block in _REQUEST_BLOCK.findall(source):
            url_match = _URL_LINE.search(block)
            assert url_match, f"{path.name}: {method} block has no url"
            url = url_match.group(1)
            # Requests against Supabase's own auth API (the token-minting setup
            # helpers) are not ours to cover.
            if "{{apiPrefix}}" not in url:
                continue
            url = url.replace("{{baseUrl}}{{apiPrefix}}", API_PREFIX).split("?")[0]
            for placeholder, param in _PLACEHOLDERS.items():
                url = url.replace(placeholder, param)
            found.add((method.upper(), url))
    return found


def _served_endpoints() -> set[tuple[str, str]]:
    spec = create_app().openapi()
    return {
        (method.upper(), path)
        for path, operations in spec["paths"].items()
        for method in operations
    }


def test_collection_documents_every_endpoint():
    missing = _served_endpoints() - _collection_endpoints()
    assert not missing, "endpoints served but absent from api/bruno: " + ", ".join(
        f"{m} {p}" for m, p in sorted(missing, key=lambda r: r[1])
    )


def test_collection_has_no_endpoints_we_do_not_serve():
    stale = _collection_endpoints() - _served_endpoints()
    assert not stale, "requests in api/bruno hitting routes that no longer exist: " + ", ".join(
        f"{m} {p}" for m, p in sorted(stale, key=lambda r: r[1])
    )


def test_every_request_carries_docs():
    """The `docs` block is what makes this collection the endpoint reference
    rather than a pile of URLs, so an undocumented request is a failure."""
    undocumented = [
        path.name
        for path in BRUNO_DIR.rglob("*.bru")
        if path.name not in {"folder.bru", "collection.bru"}
        and path.parent.name != "environments"
        and not re.search(r"^docs\s*\{", path.read_text(encoding="utf-8"), re.MULTILINE)
    ]
    assert not undocumented, f"requests with no docs block: {', '.join(sorted(undocumented))}"


def test_environments_agree_on_the_api_prefix():
    """Every URL in the collection is built from `{{apiPrefix}}`, so an
    environment carrying a stale prefix silently points the whole collection at
    routes that no longer exist."""
    for env in (BRUNO_DIR / "environments").glob("*.bru"):
        declared = re.search(
            r"^\s*apiPrefix:\s*(\S+)", env.read_text(encoding="utf-8"), re.MULTILINE
        )
        assert declared, f"{env.name} declares no apiPrefix"
        assert declared.group(1) == API_PREFIX, (
            f"{env.name} has apiPrefix {declared.group(1)}, expected {API_PREFIX}"
        )
