"""Per-user fixed-window rate limiting, shared by every limited operation.

The counters live in Postgres (``rate_limits``, keyed by user and bucket)
rather than in process memory: serverless instances share no memory, so an
in-process limiter would be quietly non-functional — each cold start would
begin with an empty budget.

Buckets keep independent budgets, so exhausting game searches never blocks
edits and vice versa.
"""

import uuid
from datetime import timedelta

from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.repositories import rate_limit as rate_limit_repo


class RateLimitedError(DomainError):
    """The caller exceeded the budget for a bucket in the current window.

    Carries ``retry_after_seconds`` so the HTTP layer can send a Retry-After
    header. That is the window length, not the true remaining time: a fixed
    window doesn't track when the caller's own first request landed, so this
    is an upper bound — never advises retrying too early.
    """

    status_code = status.HTTP_429_TOO_MANY_REQUESTS

    def __init__(self, message: str, retry_after_seconds: int) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds

    def headers(self) -> dict[str, str] | None:
        # The only domain error that carries a header. Previously this was
        # attached by the write guard but omitted by the two routers that
        # built their own 429, so a rate-limited IGDB search told the client
        # nothing about when to retry. Living on the error fixes all three.
        return {"Retry-After": str(self.retry_after_seconds)}


def enforce(
    db: Session,
    user_id: uuid.UUID,
    bucket: str,
    max_count: int,
    window: timedelta,
    message: str,
) -> None:
    """Charge one request against the caller's budget, raising when over.

    Charged BEFORE the work it guards, so a caller can't spend an expensive
    operation and only then be told they were over budget.
    """
    count = rate_limit_repo.increment_rate_limit(db, user_id, bucket, window)
    if count > max_count:
        raise RateLimitedError(message, int(window.total_seconds()))
