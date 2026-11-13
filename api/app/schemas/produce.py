"""DTOs for the produce tracker's /me endpoints (src/lib/produce/tastings.ts)."""

from datetime import date

from app.schemas.me import FORBID_EXTRA
from app.schemas.users import CamelModel


class TastingRead(CamelModel):
    slug: str
    year: int
    eaten_on: date  # serialized YYYY-MM-DD


class TastingWrite(CamelModel):
    """Body of the PUT. The year and slug are in the path."""

    model_config = FORBID_EXTRA

    # A calendar day the caller chose, in their region's zone. Required: see
    # ProduceTasting.eaten_on for why the server cannot supply it.
    eaten_on: date
