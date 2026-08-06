"""Text folding shared by the services that match user-typed strings against
names from an upstream source (Wikipedia article titles, IGDB platform names).

One definition rather than one per service: the two callers were folding
slightly differently, and the difference showed up as a platform whose accented
name ("Pokémon mini") could never be matched by a query typed in ASCII.
"""

import re
import unicodedata

_NON_ALNUM = re.compile(r"[^a-z0-9 ]+")


def fold_text(value: str) -> str:
    """Lowercase, strip accents and punctuation, collapse whitespace.

    Accent folding matters: the shelf says "Pokemon", Wikipedia and IGDB both
    say "Pokémon", and without this the two never compare equal.
    """
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(_NON_ALNUM.sub(" ", stripped.lower()).split())
