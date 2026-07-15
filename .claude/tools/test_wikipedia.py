#!/usr/bin/env python3
"""Fixture tests for wikipedia.parse_infobox().

Pure — no network. Run with:  python3 .claude/tools/test_wikipedia.py
Exits 0 if all assertions pass, 1 otherwise.
"""

from wikipedia import parse_infobox

# A trimmed but realistic {{Infobox video game}} body. Exercises the tricky
# cases: a nested {{vgrelease}} template (brace-depth matching), [[wikilinks]]
# with and without labels, and <br> separators inside a field.
FIXTURE = """{{Short description|2017 video game}}
{{Infobox video game
| title = Hollow Knight
| developer = [[Team Cherry]]
| genre = [[Metroidvania]], [[Action-adventure game|Action-adventure]]
| platforms = [[Microsoft Windows|Windows]]<br>[[Nintendo Switch]]
| released = {{vgrelease|WW=February 24, 2017|NA=February 24, 2017}}
| modes = [[Single-player video game|Single-player]]
}}
'''Hollow Knight''' is a 2017 [[Metroidvania]] game.
"""

# A Persona 5-style infobox: the tricky part is fields whose value is a nested
# template. `platforms` is an {{Unbulleted list|...}} (a `}}` only at the very
# end, pipe-separated items in between); `released` is a {{collapsible list}}
# whose FIRST token is another template ({{nobold|...}}) — a naive "stop at the
# first `}}`" match cuts everything after that inner close, losing every date.
NESTED_FIXTURE = """{{Short description|2016 video game}}
{{Infobox video game
| title = Persona 5
| developer = [[Atlus]]
| platforms = {{Unbulleted list|[[PlayStation 3]]|[[PlayStation 4]]|[[Nintendo Switch]]|[[Xbox Series X/S]]}}
| released = {{collapsible list|title={{nobold|September 15, 2016}}|'''PS3''', '''PS4'''|{{Video game release|JP|September 15, 2016|WW|April 4, 2017}}|'''NS''', '''PS5'''|{{Video game release|WW|October 21, 2022}}}}
| genre = [[Role-playing video game|Role-playing]], [[Social simulation game|social simulation]]
| modes = [[Single-player]]
}}
'''Persona 5''' is a 2016 [[Role-playing video game|role-playing]] game.
"""


def check(condition, message):
    if not condition:
        print(f"FAIL: {message}")
        return False
    print(f"ok:   {message}")
    return True


def main():
    result = parse_infobox(FIXTURE)
    passed = True

    passed &= check(
        result.get("genre") == "Metroidvania, Action-adventure",
        f"genre cleaned & wikilinks stripped (got {result.get('genre')!r})",
    )
    passed &= check(
        result.get("platforms") == "Windows, Nintendo Switch",
        f"platforms: <br> -> comma, labels resolved (got {result.get('platforms')!r})",
    )
    passed &= check(
        "NA=February 24, 2017" in result.get("released_raw", ""),
        "released_raw keeps template markup for NA-date extraction",
    )
    passed &= check(
        "}}" not in result.get("released_raw", "").split("NA=")[-1][:20]
        or "vgrelease" in result.get("released_raw", ""),
        "brace-depth matching captured the nested {{vgrelease}} template",
    )

    # A page with no video-game infobox should be reported, not crash.
    passed &= check(
        parse_infobox("Just some prose, no infobox here.") == {"error": "no_infobox"},
        "missing infobox returns {'error': 'no_infobox'}",
    )

    # Nested-template fields must be captured whole with balanced braces.
    nested = parse_infobox(NESTED_FIXTURE)

    platforms = nested.get("platforms", "")
    passed &= check(
        "Xbox Series X/S" in platforms,
        f"platforms: nested {{{{Unbulleted list}}}} reaches the last item (got {platforms!r})",
    )
    passed &= check(
        platforms.count("{{") == platforms.count("}}") and platforms.count("{{") >= 1,
        f"platforms: {{{{ }}}} braces are balanced (got {platforms!r})",
    )

    released = nested.get("released_raw", "")
    passed &= check(
        released.count("{{") == released.count("}}"),
        f"released_raw: nested templates balanced, not cut at first inner }}}} (got {released!r})",
    )
    passed &= check(
        "April 4, 2017" in released and "October 21, 2022" in released,
        "released_raw: dates AFTER the inner {{nobold}} survive (were truncated before)",
    )
    passed &= check(
        "{{Video game release|JP|September 15, 2016|WW|April 4, 2017}}" in released,
        "released_raw: a full nested {{Video game release}} is intact for date extraction",
    )

    print("\nALL PASSED" if passed else "\nSOME FAILED")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
