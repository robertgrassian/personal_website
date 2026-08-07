"""Cross-cutting request guards, applied as FastAPI route dependencies."""

from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.services import rate_limit

# One shared budget across every write. Deliberately not per-endpoint: the
# thing worth bounding is total damage per user per minute, and a caller who
# splits their spree across adds, ratings, and wishlist edits should not get
# three times the allowance. Generous enough that no human editing their
# library will ever see it — this bounds scripts, not people.
WRITE_RATE_LIMIT_BUCKET = "writes"
WRITE_RATE_LIMIT_MAX = 60
WRITE_RATE_LIMIT_WINDOW = timedelta(seconds=60)


def forbid_in_preview(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    """Refuse mutations when APP_ENV=preview.

    Vercel preview deploys point at production through a read-only Postgres
    role and must never write. Without this, a write on a preview URL would
    surface as an ugly DB-permission 500; the guard makes it a clean,
    intentional 503 instead. Attach to every mutating route via the route's
    ``dependencies=[Depends(forbid_in_preview)]``.
    """
    if settings.app_env == "preview":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Writes are disabled in preview environments.",
        )


def rate_limit_writes(user: CurrentUser, db: Annotated[Session, Depends(get_db)]) -> None:
    """Charge one write against the caller's per-minute budget.

    A dependency rather than a call inside each service function, for the same
    reason ``forbid_in_preview`` is one: there are a dozen mutating routes and
    the guard has to be on all of them. Declaring it in the route decorator
    puts it where it can be seen and reviewed, next to the preview guard, and
    means a new write endpoint is one obvious line away from being covered.

    RateLimitedError propagates rather than being translated here: it is a
    DomainError carrying its own 429 and Retry-After, and the app-wide handler
    sits outside the router, so it catches what a dependency raises just as it
    catches what a handler does.
    """
    rate_limit.enforce(
        db,
        user.id,
        WRITE_RATE_LIMIT_BUCKET,
        WRITE_RATE_LIMIT_MAX,
        WRITE_RATE_LIMIT_WINDOW,
        f"Too many changes at once — limited to {WRITE_RATE_LIMIT_MAX} per minute. "
        "Wait a moment and try again.",
    )
