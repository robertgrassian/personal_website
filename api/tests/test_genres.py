"""Unit tests for the Wikipedia/Wikidata genre source.

No database and no network: the module's single ``_get`` seam is monkeypatched,
so the search parsing, the SPARQL batching and the normalization rules all run
for real. Same seam-stubbing approach as test_igdb_api.py.
"""

import httpx
import pytest

from app.services import genres as genre_service


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=None)


# --- normalization ---------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        # The qualifier suffix is what separates Wikidata's vocabulary from the
        # library's; stripping it is the whole point.
        ("puzzle video game", "Puzzle"),
        ("role-playing video game", "Role-Playing"),
        ("turn-based strategy video game", "Turn-Based Strategy"),
        ("first-person shooter", "First-Person Shooter"),
        ("action-adventure game", "Action-Adventure"),
        # Already short and correctly shaped.
        ("roguelike", "Roguelike"),
        ("soulslike", "Soulslike"),
        ("Metroidvania", "Metroidvania"),
        # Minor words stay lowercase mid-phrase.
        ("hack and slash", "Hack and Slash"),
        # Conventional casing that Title Case alone would destroy.
        ("4X", "4X"),
        # Whitespace is collapsed, not merely trimmed.
        ("  life   simulation game ", "Life Simulation"),
    ],
)
def test_normalize_genre(raw, expected):
    assert genre_service.normalize_genre(raw) == expected


@pytest.mark.parametrize(
    "theme",
    [
        "science fiction video game",
        "post-apocalyptic video game",
        "cyberpunk video game",
        "crossover fiction",
        "LGBT-themed video game",
    ],
)
def test_themes_are_dropped_not_stored_as_genres(theme):
    """P136 mixes setting into genre. Those describe a game's world, not its
    form, and must not reach the shelf filter's genre dropdown."""
    assert genre_service.normalize_genre(theme) is None


def test_normalize_genres_drops_themes_and_dedupes_preserving_order():
    # Portal 2's real P136 payload: two genres and two themes, and a duplicate
    # that only becomes one after the suffix is stripped.
    raw = [
        "first-person shooter",
        "puzzle video game",
        "post-apocalyptic video game",
        "science fiction video game",
        "Puzzle game",
    ]
    assert genre_service.normalize_genres(raw) == ["First-Person Shooter", "Puzzle"]


def test_normalize_genres_is_case_insensitive_when_deduping():
    assert genre_service.normalize_genres(["roguelike", "Roguelike", "ROGUELIKE"]) == [
        "Roguelike"
    ]


def test_empty_and_blank_values_are_dropped():
    assert genre_service.normalize_genres(["", "   ", "puzzle video game"]) == ["Puzzle"]


@pytest.mark.parametrize(
    "raw,expected",
    [
        # "game" is part of the genre's name here, not a qualifier -- stripping
        # it would store "God", "Board", "War".
        ("god game", "God Game"),
        ("board game", "Board Game"),
        ("war game", "War Game"),
        ("art game", "Art Game"),
    ],
)
def test_suffix_stripping_spares_genres_that_end_in_game(raw, expected):
    assert genre_service.normalize_genre(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        # ...while the ordinary qualifier case still strips, including the
        # bare " game" form.
        ("puzzle game", "Puzzle"),
        ("party game", "Party"),
        ("sandbox game", "Sandbox"),
        ("rhythm game", "Rhythm"),
    ],
)
def test_bare_game_suffix_still_strips_when_the_remainder_stands_alone(raw, expected):
    assert genre_service.normalize_genre(raw) == expected


def test_bare_wikidata_ids_are_dropped():
    """WDQS returns the raw Q-id as the label when an item has no English one;
    storing that would put "Q108919152" in the shelf's genre filter."""
    assert genre_service.normalize_genre("Q108919152") is None
    assert genre_service.normalize_genres(["Q1", "roguelike"]) == ["Roguelike"]
    # A real genre that merely starts with Q is unaffected.
    assert genre_service.normalize_genre("Quiz game") == "Quiz"


# --- infobox parsing -------------------------------------------------------


def test_parses_a_simple_infobox_genre():
    text = (
        "{{Infobox video game\n| title = X\n"
        "| genre = [[Action-adventure game|Action-adventure]]\n}}"
    )
    assert genre_service.parse_infobox_genres(text) == ["Action-adventure"]


def test_parses_multiple_genres():
    text = (
        "{{Infobox video game\n| genre = [[Roguelike]], [[action role-playing game|"
        "action role-playing]], [[hack and slash]]\n| modes = Single-player\n}}"
    )
    assert genre_service.parse_infobox_genres(text) == [
        "Roguelike",
        "action role-playing",
        "hack and slash",
    ]


def test_genre_field_stops_at_the_next_parameter():
    """Anchoring on "rest of the line" leaked the following field: Ball x Pit's
    genre is followed by "| modes = Single-player", which became a genre."""
    text = "{{Infobox video game\n| genre =\n| modes = Single-player\n| platforms = PC\n}}"
    assert genre_service.parse_infobox_genres(text) == []


def test_strips_refs_and_comments():
    text = (
        "{{Infobox video game\n| genre = Roguelike<ref name=x>Cite</ref>"
        "<!-- do not change -->\n| modes = Single\n}}"
    )
    assert genre_service.parse_infobox_genres(text) == ["Roguelike"]


def test_handles_hlist_and_br_separated_genres():
    text = "{{Infobox video game\n| genre = {{hlist|[[Puzzle video game|Puzzle]]|Platform}}\n}}"
    assert genre_service.parse_infobox_genres(text) == ["Puzzle", "Platform"]


def test_missing_genre_field_returns_nothing():
    assert genre_service.parse_infobox_genres("{{Infobox video game\n| title = X\n}}") == []


def test_is_video_game_detects_the_template():
    assert genre_service.is_video_game("{{Infobox video game\n|title=X}}") is True
    assert genre_service.is_video_game("{{Infobox  video game|title=X}}") is True
    # The Twilight Princess manga carries a different infobox entirely.
    assert genre_service.is_video_game("{{Infobox animanga/Header\n|title=X}}") is False


# --- the search -> infobox cascade ------------------------------------------


def build_stub(search_hits, articles):
    """A _get stub: `search_hits` maps a query to article titles, `articles`
    maps an article title to its lead wikitext."""

    def fake_get(url, params):
        if params.get("list") == "search":
            return FakeResponse(
                {"query": {"search": [{"title": t} for t in search_hits[params["srsearch"]]]}}
            )
        if params.get("prop") == "revisions":
            pages = []
            for title in params["titles"].split("|"):
                if title in articles:
                    pages.append(
                        {
                            "title": title,
                            "revisions": [{"slots": {"main": {"content": articles[title]}}}],
                        }
                    )
                else:
                    pages.append({"title": title, "missing": True})
            return FakeResponse({"query": {"pages": pages}})
        return FakeResponse({"query": {"pages": []}})

    return fake_get


def GAME(genre):
    """A minimal game article. Built by replace, not str.format: format() reads
    the template's doubled braces as escapes and emits "{Infobox video game}"."""
    return "{{Infobox video game\n| genre = GENRE\n| modes = Single-player\n}}".replace(
        "GENRE", genre
    )


MANGA = "{{Infobox animanga/Print\n| genre = [[Adventure (genre)|Adventure]]\n}}"


def test_rejects_a_non_game_article_ranked_first(monkeypatch):
    """Searching Twilight Princess ranks the MANGA first; its genres are
    "adventure anime and manga". The infobox check is what rejects it."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Twilight Princess video game": ["Twilight Princess (manga)", "Twilight Princess"]},
            {
                "Twilight Princess (manga)": MANGA,
                "Twilight Princess": GAME("[[Action-adventure]]"),
            },
        ),
    )
    out = genre_service.lookup_many(["Twilight Princess"])
    assert out["Twilight Princess"].article == "Twilight Princess"
    assert out["Twilight Princess"].genres == ["Action-Adventure"]


def test_prefers_the_best_matching_game_not_the_first(monkeypatch):
    """Taking the first game candidate resolved "Hades II" to Hades and
    "Animal Well" to Animal Crossing."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Hades II video game": ["Hades (video game)", "Hades II"]},
            {
                "Hades (video game)": GAME("[[Roguelike]]"),
                "Hades II": GAME("[[Roguelike]], [[hack and slash]]"),
            },
        ),
    )
    out = genre_service.lookup_many(["Hades II"])
    assert out["Hades II"].article == "Hades II"
    assert out["Hades II"].genres == ["Roguelike", "Hack and Slash"]


def test_no_game_candidate_is_a_clean_miss(monkeypatch):
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Obscure Thing video game": ["Some Album"]},
            {"Some Album": "{{Infobox album}}"},
        ),
    )
    out = genre_service.lookup_many(["Obscure Thing"])
    assert out["Obscure Thing"].found is False
    assert out["Obscure Thing"].article is None


def test_candidate_wikitext_is_fetched_in_batches(monkeypatch):
    """Several hundred candidates across a library must not be one request
    each; MediaWiki takes 50 titles at a time."""
    calls = {"search": 0, "wikitext": 0}

    def fake_get(url, params):
        if params.get("list") == "search":
            calls["search"] += 1
            return FakeResponse(
                {"query": {"search": [{"title": f"{params['srsearch'][:1]}-article"}]}}
            )
        calls["wikitext"] += 1
        return FakeResponse(
            {
                "query": {
                    "pages": [
                        {
                            "title": t,
                            "revisions": [
                                {"slots": {"main": {"content": GAME("Puzzle")}}}
                            ],
                        }
                        for t in params["titles"].split("|")
                    ]
                }
            }
        )

    monkeypatch.setattr(genre_service, "_get", fake_get)
    genre_service.lookup_many([f"Game {i}" for i in range(10)])
    assert calls["search"] == 10
    # One shared wikitext request, not ten.
    assert calls["wikitext"] == 1


def test_survives_a_malformed_search_response(monkeypatch):
    """Wikimedia can serve an HTML error page with a 200, so the failure is a
    JSON/KeyError rather than an HTTPError."""

    def fake_get(url, params):
        if params.get("list") == "search":
            if "Bad" in params["srsearch"]:
                return FakeResponse({"unexpected": "shape"})
            return FakeResponse({"query": {"search": [{"title": "Good"}]}})
        return FakeResponse(
            {
                "query": {
                    "pages": [
                        {
                            "title": "Good",
                            "revisions": [
                                {"slots": {"main": {"content": GAME("Roguelike")}}}
                            ],
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr(genre_service, "_get", fake_get)
    out = genre_service.lookup_many(["Bad Game", "Good"])
    assert out["Bad Game"].found is False
    assert out["Good"].genres == ["Roguelike"]


def test_falls_back_to_wikidata_when_the_infobox_has_no_genre(monkeypatch):
    """Some articles carry the template but leave `genre` empty."""

    def fake_get(url, params):
        if params.get("list") == "search":
            return FakeResponse({"query": {"search": [{"title": "Ball x Pit"}]}})
        if params.get("prop") == "revisions":
            return FakeResponse(
                {
                    "query": {
                        "pages": [
                            {
                                "title": "Ball x Pit",
                                "revisions": [
                                    {"slots": {"main": {"content": "{{Infobox video game\n}}"}}}
                                ],
                            }
                        ]
                    }
                }
            )
        if params.get("prop") == "pageprops":
            return FakeResponse(
                {
                    "query": {
                        "pages": [
                            {
                                "title": "Ball x Pit",
                                "pageprops": {"wikibase_item": "Q7"},
                            }
                        ]
                    }
                }
            )
        return FakeResponse(
            {
                "results": {
                    "bindings": [
                        {
                            "item": {"value": "http://www.wikidata.org/entity/Q7"},
                            "genreLabel": {"value": "action roguelike"},
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr(genre_service, "_get", fake_get)
    out = genre_service.lookup_many(["Ball x Pit"])
    assert out["Ball x Pit"].genres == ["Action Roguelike"]


def test_user_agent_is_descriptive():
    """Wikimedia 429s generic User-Agents; a bare default gets rate-limited
    within a dozen requests, which is how this was found."""
    assert "personal-website" in genre_service.USER_AGENT
    assert "http" in genre_service.USER_AGENT


# --- title confidence ------------------------------------------------------


@pytest.mark.parametrize(
    "name,article",
    [
        # Wikipedia covers many games in ONE combined article. These are correct
        # matches that a plain sequence ratio scores 0.62-0.79 and rejects.
        ("Pokemon Violet", "Pokémon Scarlet and Violet"),
        ("Pokemon Omega Ruby", "Pokémon Omega Ruby and Alpha Sapphire"),
        ("Super Smash Bros. for Wii U", "Super Smash Bros. for Nintendo 3DS and Wii U"),
        # An edition suffix on our side, the plain article on Wikipedia's.
        ("Persona 5 Royal: Launch Edition", "Persona 5 Royal"),
        ("Mario Kart 8 Deluxe", "Mario Kart 8"),
        # Accents: the shelf says Pokemon, every article says Pokémon.
        ("Pokemon Colosseum", "Pokémon Colosseum"),
        ("God of War Ragnarok", "God of War Ragnarök"),
        # A shortened series prefix is still the same game.
        ("Zelda: Link's Awakening", "The Legend of Zelda: Link's Awakening"),
    ],
)
def test_confident_on_correct_matches(name, article):
    assert genre_service._title_similarity(name, article) >= 0.97


@pytest.mark.parametrize(
    "name,article",
    [
        # The guard that makes word-containment safe. Without it each of these
        # scores a perfect 1.0, because one title's words really are a subset of
        # the other's -- they differ only by a series number.
        ("Hades II", "Hades (video game)"),
        ("Hades", "Hades II"),
        ("Super Smash Bros 4", "Super Smash Bros. (video game)"),
        ("Grand Theft Auto", "Grand Theft Auto V"),
        # Close strings, wrong game: a sequence ratio scores these ~0.9.
        ("Call of Duty: Black Ops II", "Call of Duty: Black Ops 7"),
        ("Octopath Traveller", "Octopath Traveler II"),
        # Genuinely unrelated.
        ("Civ 6", "CivCity: Rome"),
    ],
)
def test_not_confident_on_wrong_matches(name, article):
    assert genre_service._title_similarity(name, article) < 0.97


def test_platform_tokens_are_not_treated_as_series_markers():
    """"3DS" contains a digit but names a platform, not an entry in a series;
    treating it as one would reject the correct combined Smash Bros article."""
    assert genre_service._title_similarity(
        "Super Smash Bros. for Wii U", "Super Smash Bros. for Nintendo 3DS and Wii U"
    ) == 1.0


def test_confidence_is_symmetric():
    a = genre_service._title_similarity("Hades", "Hades II")
    b = genre_service._title_similarity("Hades II", "Hades")
    assert a == b < 0.97


def test_genre_field_stops_at_the_end_of_the_template():
    """A genre that is the infobox's LAST parameter must not swallow the article
    prose after it. Majora's Mask picked up Japanese title text and the phrase
    "and quality of life changes" as genres."""
    text = (
        "{{Infobox video game\n| title = X\n| genre = [[Action-adventure]]\n}}\n"
        "'''The Legend of Zelda: Majora's Mask 3D''' is a game, released "
        "{{nihongo|ゼルダの伝説|Zeruda}} to positive reviews, with enhanced "
        "graphics, and quality of life changes.\n"
    )
    assert genre_service.parse_infobox_genres(text) == ["Action-adventure"]


def test_genre_field_still_stops_at_the_next_parameter():
    text = "{{Infobox video game\n| genre = Roguelike\n| modes = Single-player\n}}"
    assert genre_service.parse_infobox_genres(text) == ["Roguelike"]


def test_source_spelling_conflicts_are_normalized():
    """Wikipedia gives one concept two names: the Pokemon infoboxes say
    "Monster tamer", Palworld's says "monster-taming". Both must land on one
    value or the shelf filter offers them as separate options."""
    assert genre_service.normalize_genre("monster-taming") == "Monster Tamer"
    assert genre_service.normalize_genre("Monster tamer") == "Monster Tamer"
    assert genre_service.normalize_genres(["Survival", "monster-taming"]) == [
        "Survival",
        "Monster Tamer",
    ]


def test_the_synonym_table_is_not_a_preference_map():
    """It exists only for source self-contradictions. Terms the library might
    prefer stylistically are deliberately left as the source wrote them."""
    assert genre_service.normalize_genre("role-playing video game") == "Role-Playing"
    assert genre_service.normalize_genre("platformer") == "Platformer"


def test_conflicting_spellings_on_one_game_collapse_to_one():
    assert genre_service.normalize_genres(["Monster tamer", "monster-taming"]) == [
        "Monster Tamer"
    ]


def test_an_exact_article_beats_one_that_merely_contains_the_name(monkeypatch):
    """Several candidates routinely tie at 1.0, because word-containment says
    yes to any article whose title extends ours. "Kinect Adventures" matched
    both "Kinect Adventures!" and "Kinect: Disneyland Adventures", and taking
    the first maximum picked the Disneyland game and its "Open world"."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {
                "Kinect Adventures video game": [
                    "Kinect: Disneyland Adventures",
                    "Kinect Adventures!",
                ]
            },
            {
                "Kinect: Disneyland Adventures": GAME("[[Open world]]"),
                "Kinect Adventures!": GAME("[[Adventure]], [[Sports]]"),
            },
        ),
    )
    out = genre_service.lookup_many(["Kinect Adventures"])
    assert out["Kinect Adventures"].article == "Kinect Adventures!"
    assert out["Kinect Adventures"].genres == ["Adventure", "Sports"]


def test_the_shorter_title_wins_when_neither_is_exact(monkeypatch):
    """Between two articles that both contain our name, the one adding least is
    likeliest to be the game."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Some Game video game": ["Some Game Deluxe Anniversary Edition", "Some Game HD"]},
            {
                "Some Game Deluxe Anniversary Edition": GAME("[[Puzzle]]"),
                "Some Game HD": GAME("[[Platform]]"),
            },
        ),
    )
    assert genre_service.lookup_many(["Some Game"])["Some Game"].article == "Some Game HD"
