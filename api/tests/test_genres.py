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
    assert genre_service.normalize_genres(["roguelike", "Roguelike", "ROGUELIKE"]) == ["Roguelike"]


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
                            "revisions": [{"slots": {"main": {"content": GAME("Puzzle")}}}],
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
                            "revisions": [{"slots": {"main": {"content": GAME("Roguelike")}}}],
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
    """ "3DS" contains a digit but names a platform, not an entry in a series;
    treating it as one would reject the correct combined Smash Bros article."""
    assert (
        genre_service._title_similarity(
            "Super Smash Bros. for Wii U", "Super Smash Bros. for Nintendo 3DS and Wii U"
        )
        == 1.0
    )


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
    assert genre_service.normalize_genres(["Monster tamer", "monster-taming"]) == ["Monster Tamer"]


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


def test_a_series_article_loses_to_a_real_game_it_ties_with(monkeypatch):
    """A franchise overview article carries {{Infobox video game}} and its title
    is a subset of every entry's, so containment scores it a perfect 1.0 for any
    one game. "Pokémon FireRed" resolved to *Pokémon (video game series)*
    instead of *Pokémon FireRed and LeafGreen*, and nothing in the score could
    tell them apart."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {
                "Pokémon FireRed video game": [
                    "Pokémon FireRed and LeafGreen",
                    "Pokémon (video game series)",
                ]
            },
            {
                "Pokémon FireRed and LeafGreen": GAME("[[Role-playing]]"),
                "Pokémon (video game series)": GAME("[[Adventure]]"),
            },
        ),
    )
    out = genre_service.lookup_many(["Pokémon FireRed"])
    assert out["Pokémon FireRed"].article == "Pokémon FireRed and LeafGreen"


def test_the_series_article_is_still_used_when_it_is_the_only_candidate(monkeypatch):
    """Demoted, not rejected. A franchise's genre is usually right for its
    entries, so it beats storing nothing at all."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Pokémon Pinball video game": ["Pokémon (video game series)"]},
            {"Pokémon (video game series)": GAME("[[Role-playing]]")},
        ),
    )
    out = genre_service.lookup_many(["Pokémon Pinball"])
    assert out["Pokémon Pinball"].article == "Pokémon (video game series)"
    assert out["Pokémon Pinball"].genres == ["Role-Playing"]


def test_fewest_leftover_words_beats_an_untagged_franchise_article(monkeypatch):
    """*Super Mario* carries no "(series)" parenthetical, so the rule above
    cannot see it, and it is SHORTER than the real article. Comparing the titles
    as word sets is what separates them: the franchise leaves five of our words
    unaccounted for, *Super Mario 3D World* leaves three. Five and three rather
    than four and two because fold_text turns the apostrophe into a space, so
    "Bowser's" is two tokens."""
    title = "Super Mario 3D World + Bowser's Fury"
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {
                f"{title} video game": [
                    "Bowser's Fury",
                    "Super Mario 3D World",
                    "Super Mario",
                ]
            },
            {
                "Bowser's Fury": GAME("[[Adventure]]"),
                "Super Mario 3D World": GAME("[[Platform]]"),
                "Super Mario": GAME("[[Adventure]]"),
            },
        ),
    )
    assert genre_service.lookup_many([title])[title].article == "Super Mario 3D World"


def test_length_is_measured_without_the_disambiguating_parenthetical(monkeypatch):
    """ "Bomberman DS" resolved to the unrelated spinoff *Bomberman Story DS*,
    because the old tiebreak compared FULL titles and the spinoff (18 chars) is
    shorter than *Bomberman (2005 video game)* (27). Both leave exactly one word
    over, so the parenthetical is the whole difference, and it is Wikipedia's
    bookkeeping rather than part of the name."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {
                "Bomberman DS video game": [
                    "Bomberman Story DS",
                    "Bomberman (2005 video game)",
                ]
            },
            {
                "Bomberman Story DS": GAME("[[Action role-playing]]"),
                "Bomberman (2005 video game)": GAME("[[Action]], [[Maze]]"),
            },
        ),
    )
    out = genre_service.lookup_many(["Bomberman DS"])
    assert out["Bomberman DS"].article == "Bomberman (2005 video game)"


def test_an_undisambiguated_title_beats_the_same_title_plus_a_parenthetical(monkeypatch):
    """These agree on every other component of the rank key, including length
    once the parenthetical is stripped. Full article length is the last word,
    and without it the winner is whichever the search listed first."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {
                "The Legend of Zelda: Link's Awakening video game": [
                    "The Legend of Zelda: Link's Awakening (2019 video game)",
                    "The Legend of Zelda: Link's Awakening",
                ]
            },
            {
                "The Legend of Zelda: Link's Awakening (2019 video game)": GAME("[[Adventure]]"),
                "The Legend of Zelda: Link's Awakening": GAME("[[Action-adventure]]"),
            },
        ),
    )
    title = "The Legend of Zelda: Link's Awakening"
    assert genre_service.lookup_many([title])[title].article == title


def test_a_combined_article_still_wins_end_to_end(monkeypatch):
    """The combined-article constraint pinned through lookup_many, not only
    through _title_similarity.

    Worth having separately: similarity is one term of the rank key, and the
    three terms added below it can override a candidate it scores 1.0. A test
    at the _title_similarity level alone cannot see that.
    """
    title = "Super Smash Bros. for Wii U"
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {
                f"{title} video game": [
                    "Super Smash Bros. for Nintendo 3DS and Wii U",
                    "Super Smash Bros. Ultimate",
                ]
            },
            {
                "Super Smash Bros. for Nintendo 3DS and Wii U": GAME("[[Fighting]]"),
                "Super Smash Bros. Ultimate": GAME("[[Platform fighter]]"),
            },
        ),
    )
    out = genre_service.lookup_many([title])
    assert out[title].article == "Super Smash Bros. for Nintendo 3DS and Wii U"
    assert out[title].genres == ["Fighting"]


def test_a_bare_series_title_beats_its_combined_article_a_known_limitation(monkeypatch):
    """Documents TODAY'S behaviour, and is not an endorsement of it.

    Against the bare *Super Smash Bros.* the combined article loses: both leave
    three words over ("for", "wii", "u" on one side; "nintendo", "3ds", "and" on
    the other), so the shorter title takes it. The old rank key chose the same
    way, so this is a pre-existing limit of a title-only rule rather than a
    regression, and it does not occur in practice because the live search does
    not return the bare series article for this query.

    The fix is not to reorder the key, which would re-open the validated diff
    over the fixture library. It is the follow-up recorded in TODO.md: read
    series-ness from the {{Infobox video game series}} template already present
    in the fetched wikitext instead of guessing at it from the title.
    """
    title = "Super Smash Bros. for Wii U"
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {
                f"{title} video game": [
                    "Super Smash Bros. for Nintendo 3DS and Wii U",
                    "Super Smash Bros.",
                ]
            },
            {
                "Super Smash Bros. for Nintendo 3DS and Wii U": GAME("[[Fighting]]"),
                "Super Smash Bros.": GAME("[[Fighting]]"),
            },
        ),
    )
    assert genre_service.lookup_many([title])[title].article == "Super Smash Bros."


@pytest.mark.parametrize(
    "article,is_series",
    [
        ("Pokémon (video game series)", True),
        ("Borderlands (series)", True),
        ("God of War (franchise)", True),
        # Only a TRAILING parenthetical counts. A game whose own name contains
        # the word, or whose parenthetical is an ordinary disambiguator, is not
        # a franchise article.
        ("Portal (video game)", False),
        ("Bomberman (2005 video game)", False),
        ("Super Mario 3D World", False),
        ("Series (video game)", False),
    ],
)
def test_only_a_trailing_series_parenthetical_marks_a_franchise_article(article, is_series):
    assert bool(genre_service._SERIES_ARTICLE.search(article)) is is_series


def test_editor_annotations_are_stripped():
    """Wikipedia editors annotate the field: "Tower defense game (primary)".
    Left in, the annotation becomes part of the genre and sits in the filter
    beside the un-annotated spelling of the same one."""
    assert genre_service.normalize_genre("Tower defense game (primary)") == "Tower Defense"
    assert genre_service.normalize_genre("Puzzle (secondary)") == "Puzzle"
    assert genre_service.normalize_genres(["Tower defense game (primary)", "Tower defense"]) == [
        "Tower Defense"
    ]


def test_mood_descriptors_are_dropped():
    """Wikipedia infoboxes mix in values describing how a game feels rather
    than how it plays. Animal Crossing carries "Iyashikei" (Japanese "healing"
    media) next to Social simulation."""
    assert genre_service.normalize_genre("Iyashikei") is None
    assert genre_service.normalize_genres(["Social simulation", "Iyashikei"]) == [
        "Social Simulation"
    ]


@pytest.mark.parametrize(
    "genre",
    ["Horror", "Psychological horror", "Survival horror", "Cozy", "Adventure"],
)
def test_real_genres_that_read_like_themes_are_kept(genre):
    """Guarding against padding the theme list with plausible neighbours: these
    sound like moods and are genres, and the library already shelves Survival
    Horror."""
    assert genre_service.normalize_genre(genre) is not None


def test_card_game_keeps_its_noun():
    """ "Game" is part of the name here; stripping leaves "Digital Collectible
    Card", which is not a thing."""
    assert (
        genre_service.normalize_genre("Digital collectible card game")
        == "Digital Collectible Card Game"
    )


def test_genre_field_stops_when_the_infobox_closes_on_the_same_line():
    """The very common shape: "}}" trailing the last value rather than starting
    its own line. Requiring a line-initial "}}" missed it, and the field ran on
    into the article lead -- the same swallow the Majora's Mask fix targeted."""
    text = (
        "{{Infobox video game\n| title = X\n| genre = [[Action game|Action]]}}\n\n"
        "'''Some Game''' is a 2019 game.\nIt was praised for its music.\n"
        "A sequel followed in 2021.\n"
    )
    assert genre_service.parse_infobox_genres(text) == ["Action"]


def test_inner_templates_still_parse_after_the_brace_terminator():
    """Terminating at any "}}" must not break {{hlist|...}}, whose own closer
    lands exactly where the value ends."""
    text = "{{Infobox video game\n| genre = {{hlist|[[Puzzle video game|Puzzle]]|Platform}}\n}}"
    assert genre_service.parse_infobox_genres(text) == ["Puzzle", "Platform"]


def test_genre_count_is_capped():
    """A malformed or vandalized article must not write hundreds of genres."""
    many = ", ".join(f"Genre{i}" for i in range(60))
    text = "{{Infobox video game\n| genre = " + many + "\n| modes = X\n}}"
    assert len(genre_service.parse_infobox_genres(text)) == genre_service.MAX_GENRES


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Minor words stay lowercase inside hyphenated compounds too, or
        # "point-and-click" becomes "Point-And-Click".
        ("point-and-click", "Point-and-Click"),
        ("point-and-click adventure game", "Point-and-Click Adventure"),
        # ...while ordinary hyphenated compounds still capitalize both halves.
        ("turn-based strategy", "Turn-Based Strategy"),
        ("action-adventure", "Action-Adventure"),
    ],
)
def test_title_case_handles_minor_words_inside_hyphens(raw, expected):
    assert genre_service.normalize_genre(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Infoboxes pluralize; without this the plural is a second dropdown entry.
        ("role-playing games", "Role-Playing"),
        ("puzzle games", "Puzzle"),
        ("racing video games", "Racing"),
    ],
)
def test_plural_qualifiers_are_stripped_too(raw, expected):
    assert genre_service.normalize_genre(raw) == expected


@pytest.mark.parametrize("raw", ["game", "games", "video game", "video games"])
def test_a_bare_qualifier_is_not_a_genre(raw):
    assert genre_service.normalize_genre(raw) is None


# --- lookup_one: the add-game write path ------------------------------------


def test_lookup_one_returns_the_infobox_genres(monkeypatch):
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Hades II video game": ["Hades II"]},
            {"Hades II": GAME("[[Roguelike]], [[Action role-playing game|Action RPG]]")},
        ),
    )
    assert genre_service.lookup_one("Hades II") == ["Roguelike", "Action RPG"]


def test_lookup_one_skips_the_wikidata_fallback(monkeypatch):
    """The write path trades the P136 backstop for a bounded wait: two requests,
    never the 20s SPARQL leg. An empty infobox is simply a miss here, where
    lookup_many would go on to ask Wikidata."""
    urls: list[str] = []

    def fake_get(url, params):
        urls.append(url)
        if params.get("list") == "search":
            return FakeResponse({"query": {"search": [{"title": "Ball x Pit"}]}})
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

    monkeypatch.setattr(genre_service, "_get", fake_get)
    assert genre_service.lookup_one("Ball x Pit") == []
    assert genre_service.WIKIDATA_SPARQL not in urls
    assert len(urls) == 2


def test_lookup_one_never_raises(monkeypatch):
    """A third-party outage must not fail an add, so every failure is a miss."""

    def explode(url, params):
        raise RuntimeError("wikipedia is down")

    monkeypatch.setattr(genre_service, "_get", explode)
    assert genre_service.lookup_one("Anything") == []


def test_lookup_one_rejects_a_match_that_is_not_the_game(monkeypatch):
    """The reason the floor exists. Wikipedia's search always returns SOMETHING,
    and lookup_many hands back the best of it however unrelated -- fine for a
    backfill a human reviews, wrong for a write that defines the shared catalog
    row. A game nobody has heard of resolves to a real but different game, and
    the caller must be told nothing was found."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Homebrew Quest video game": ["Cosmic Blaster"]},
            {"Cosmic Blaster": GAME("[[Shoot 'em up]]")},
        ),
    )
    assert genre_service.lookup_one("Homebrew Quest") == []


def test_lookup_many_still_takes_the_weak_match(monkeypatch):
    """The floor is lookup_one's alone: backfill_genres.py prints its matches
    for review, so a weak one there is a suggestion rather than a silent write."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Homebrew Quest video game": ["Cosmic Blaster"]},
            {"Cosmic Blaster": GAME("[[Shoot 'em up]]")},
        ),
    )
    out = genre_service.lookup_many(["Homebrew Quest"])
    assert out["Homebrew Quest"].genres == ["Shoot 'em Up"]


def test_lookup_one_keeps_a_combined_article(monkeypatch):
    """The floor must not undo _title_similarity's containment rule. Wikipedia
    covers many games in a combined article, which scores badly as raw text and
    is exactly right; this is the case that would break if the floor were
    applied to a plain sequence ratio."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Pokemon Violet video game": ["Pokémon Scarlet and Violet"]},
            {"Pokémon Scarlet and Violet": GAME("[[Role-playing video game|Role-playing]]")},
        ),
    )
    assert genre_service.lookup_one("Pokemon Violet") == ["Role-Playing"]


def test_lookup_one_rejects_the_wrong_entry_in_a_series(monkeypatch):
    """The case that decides where the floor sits. A wrong sequel is one
    character from correct -- "Octopath Traveller" scores 0.895 against
    *Octopath Traveler II* -- so any mid-range floor admits it while still
    rejecting correct abbreviations that score far lower. Hence a floor just
    below an exact match, the same place backfill_genres.py puts AUTO_ACCEPT."""
    monkeypatch.setattr(
        genre_service,
        "_get",
        build_stub(
            {"Octopath Traveller video game": ["Octopath Traveler II"]},
            {"Octopath Traveler II": GAME("[[Role-playing video game|Role-playing]]")},
        ),
    )
    assert genre_service.lookup_one("Octopath Traveller") == []


def test_ref_containing_a_cite_template_does_not_truncate_the_genre_field():
    """The real shape of a Wikipedia citation, which the older test missed.

    ``<ref name=x>Cite</ref>`` has no ``{{...}}`` in it, so it never exercised
    the interaction that matters: _INFOBOX_FIELD ends the value at any ``}}``,
    and a ``{{cite web}}`` inside the ref closes long before the infobox does.

    Both spellings of the ref tag are here because they failed differently on
    the real articles: the unnamed one left "action-adventure<ref>cite web" as
    a genre, while the named one carried an "=" and was dropped, losing
    Action-Adventure entirely.
    """
    unnamed = (
        "{{Infobox video game\n"
        "| genre = [[Platformer|Platform]], [[Action-adventure game|action-adventure]]"
        "<ref>{{cite web|url=http://example.com|title=T|date=December 8, 2017"
        "|access-date=December 22, 2017}}</ref>\n"
        "| modes = Single-player\n}}"
    )
    named = unnamed.replace("<ref>", '<ref name="dice">')
    for text in (unnamed, named):
        assert genre_service.parse_infobox_genres(text) == ["Platform", "action-adventure"]


def test_a_self_closing_ref_does_not_swallow_the_rest_of_the_field():
    """_REF ends at "/>" OR "</ref>", whichever comes first, so <ref name=x />
    closes itself. If that alternation is ever reduced to just "</ref>", a
    self-closing tag would run on to the next real citation anywhere later in
    the article and take the genres in between with it.
    """
    text = (
        "{{Infobox video game\n"
        "| genre = Puzzle<ref name=x />, Platform\n"
        "| modes = Single\n}}\n"
        "Prose about the game.<ref>{{cite web|title=T}}</ref>"
    )
    assert genre_service.parse_infobox_genres(text) == ["Puzzle", "Platform"]
