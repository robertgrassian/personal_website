"""Response DTO for the genre lookup endpoint.

Same wire conventions as schemas/igdb.py: camelCase keys and "" (never null)
for absent scalars.
"""

from app.schemas.users import CamelModel


class GenreLookupResult(CamelModel):
    """Genres found for one game title.

    ``genres`` empty means Wikipedia had no usable match -- an ordinary outcome
    for an obscure or misspelled title, which the add-game picker handles by
    falling back to IGDB's own genres.
    """

    genres: list[str]
    # The Wikipedia article the genres came from, or "" when nothing matched.
    # Surfaced so the picker can show which game it actually read, since a
    # search can land on the wrong entry in a series.
    article: str
