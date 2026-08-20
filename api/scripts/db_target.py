"""Point a maintenance script at a database other than the one in .env.

Everything in the API reads DATABASE_URL through app/core/config, which loads
the gitignored repo-root .env -- locally, the Supabase CLI stack. A production
pass needs the prod URL for one command, and exporting it into the shell leaves
it aimed at prod for every later command in that session, which is precisely
when a "quick re-run" of something else goes somewhere it shouldn't.

So the URL is an argument, injected into the environment before anything reads
settings. pydantic-settings ranks real environment variables above the .env
file, so this wins without editing or shadowing the file. The lru_caches are
cleared as well, in case settings were read during import.

Only the database moves. The Twitch credentials are the same in every
environment and .env already supplies them, so there is nothing to pass.
"""

import os
from urllib.parse import urlsplit

from app.core.config import get_settings
from app.core.db import get_engine, get_sessionmaker


def add_database_url_arg(parser) -> None:
    parser.add_argument(
        "--database-url",
        metavar="URL",
        help="database to act on (default: DATABASE_URL from the repo-root .env)",
    )


def redact(url: str) -> str:
    """user@host/dbname, with the password removed.

    Printed before every run: the one thing worth being certain of before a
    write is which database is about to take it.
    """
    parts = urlsplit(url)
    host = parts.hostname or "?"
    port = f":{parts.port}" if parts.port else ""
    user = f"{parts.username}@" if parts.username else ""
    return f"{user}{host}{port}{parts.path}"


def apply_database_url(url: str | None) -> str:
    """Switch the process to `url` if given. Returns the target, for printing."""
    if url:
        os.environ["DATABASE_URL"] = url
        get_settings.cache_clear()
        get_engine.cache_clear()
        get_sessionmaker.cache_clear()
    current = get_settings().database_url
    if not current:
        raise SystemExit(
            "No database. Pass --database-url or set DATABASE_URL in the repo-root .env."
        )
    return redact(current)
