"""Business rules for produce tastings.

Nothing here asks for a profile: these act on the authenticated account alone,
so there is deliberately no OnboardingRequiredError on any path.
"""

from datetime import UTC, date, datetime, timedelta

from fastapi import status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser
from app.core.errors import DomainError
from app.models.produce_tasting import EARLIEST_EATEN_ON, MAX_TASTINGS_PER_USER
from app.repositories import produce as produce_repo
from app.schemas.produce import TastingRead, TastingWrite


class TastingDateError(DomainError):
    """The date does not belong to the year in the path, or is out of range."""

    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class TastingLimitError(DomainError):
    status_code = status.HTTP_409_CONFLICT

    def __init__(self) -> None:
        super().__init__(
            f"You have reached the limit of {MAX_TASTINGS_PER_USER} tastings. "
            "Remove one before adding another."
        )


def _to_read(row) -> TastingRead:
    return TastingRead(slug=row.produce_slug, year=row.year, eaten_on=row.eaten_on)


def list_my_tastings(db: Session, user: AuthenticatedUser, year: int) -> list[TastingRead]:
    return [_to_read(row) for row in produce_repo.list_tastings(db, user.id, year)]


def _check_eaten_on(eaten_on: date, year: int, today_utc: date) -> None:
    if eaten_on.year != year:
        raise TastingDateError(f"{eaten_on.isoformat()} is not in {year}.")
    if eaten_on < EARLIEST_EATEN_ON:
        raise TastingDateError(f"Dates before {EARLIEST_EATEN_ON.isoformat()} are not accepted.")
    # Tomorrow in UTC, not today: the caller's own "today" runs up to 14 hours
    # ahead of UTC, and the client sends the date in its region's zone.
    if eaten_on > today_utc + timedelta(days=1):
        raise TastingDateError("That date is in the future.")


def set_my_tasting(
    db: Session, user: AuthenticatedUser, year: int, slug: str, payload: TastingWrite
) -> TastingRead:
    """Idempotent: a repeat moves the date and is never a conflict."""
    _check_eaten_on(payload.eaten_on, year, datetime.now(UTC).date())

    # Only a NEW row can hit the cap, or a user at the limit could not correct
    # the date on a row they already have.
    #
    # Count-then-insert can overshoot by a request or two under concurrency.
    # Accepted: this bounds abuse, it is not an invariant anything reads.
    if (
        not produce_repo.tasting_exists(db, user.id, slug, year)
        and produce_repo.count_tastings(db, user.id) >= MAX_TASTINGS_PER_USER
    ):
        raise TastingLimitError()

    return _to_read(produce_repo.upsert_tasting(db, user.id, slug, year, payload.eaten_on))


def delete_my_tasting(db: Session, user: AuthenticatedUser, year: int, slug: str) -> None:
    produce_repo.delete_tasting(db, user.id, slug, year)
