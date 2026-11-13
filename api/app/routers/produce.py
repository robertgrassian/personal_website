"""The produce tracker's endpoints: the caller's own tastings.

Owner-only and never cached, so there is no public mirror under /users. Unlike
most of routers/me.py, none of these needs a game-library profile: they take
``CurrentUser`` and nothing else.
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.core.auth import CurrentUser
from app.core.db import DbSession
from app.core.guards import WRITE_GUARDS
from app.models.produce_tasting import EARLIEST_EATEN_ON, MAX_SLUG_LENGTH, SLUG_PATTERN
from app.schemas.produce import TastingRead, TastingWrite
from app.services import produce as produce_service

router = APIRouter(tags=["produce"])

# The upper bound keeps the value inside both date.year and the smallint column,
# so an absurd year is a 422 here rather than a 500 from the driver.
_YEAR_BOUNDS = {"ge": EARLIEST_EATEN_ON.year, "le": 9999}
YearParam = Annotated[int, Path(**_YEAR_BOUNDS)]
SlugParam = Annotated[str, Path(pattern=SLUG_PATTERN, max_length=MAX_SLUG_LENGTH)]


@router.get("/me/produce/tastings")
def read_my_tastings(
    user: CurrentUser, db: DbSession, year: Annotated[int, Query(**_YEAR_BOUNDS)]
) -> list[TastingRead]:
    """What the caller has eaten in one calendar year."""
    return produce_service.list_my_tastings(db, user, year)


@router.put("/me/produce/tastings/{year}/{slug}", dependencies=WRITE_GUARDS)
def write_my_tasting(
    user: CurrentUser, db: DbSession, year: YearParam, slug: SlugParam, payload: TastingWrite
) -> TastingRead:
    """Mark an item eaten. Idempotent: a repeat moves the date.

    Status mapping:
    - 409 the caller is at the per-user tasting limit
    - 422 malformed slug, or a date outside the path's year or in the future
    """
    return produce_service.set_my_tasting(db, user, year, slug, payload)


@router.delete(
    "/me/produce/tastings/{year}/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=WRITE_GUARDS,
)
def delete_my_tasting(user: CurrentUser, db: DbSession, year: YearParam, slug: SlugParam) -> None:
    """Unmark an item. 204 whether or not it was marked."""
    produce_service.delete_my_tasting(db, user, year, slug)
