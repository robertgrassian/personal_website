"""Contrast of the destructive button's red against the detail card.

The card's backdrop is the game's own cover art (blurred, over a per-system
base color, under a 25% black overlay), so it is different for every game and
cannot be checked by eye on one screenshot. This measures the shipped tokens
against representative covers instead.

Run: python3 scripts/check-danger-contrast.py
Keep in sync with --shelf-danger* in src/app/video-games/video-games.css.
"""

# --shelf-danger and --shelf-danger-surface on .game-card-surface.
TEXT = "#f45f5f"
SURFACE = ((0, 0, 0), 0.82)  # rest
HOVER = ((0, 0, 0), 0.92)
BACK_OVERLAY = 0.25  # --back-overlay
FLOOR = 4.5  # WCAG AA, normal-size text

# Cover art dominant colors, chosen to span the range rather than to be typical:
# the pale ones are where unaided red text fails.
COVERS = {
    "dark navy": "#1a1a2e",
    "mid grey": "#808080",
    "bright red": "#d32f2f",
    "bright yellow": "#ffd54f",
    "pale cream": "#f5e6c8",
    "deep blue": "#1565c0",
}


def rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def luminance(color):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = color
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(fg, bg):
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def composite(top, alpha, bottom):
    return tuple(alpha * t + (1 - alpha) * b for t, b in zip(top, bottom, strict=True))


def main():
    text = rgb(TEXT)
    worst = None
    print(f"{'cover':16}{'rest':>8}{'hover':>8}")
    for name, cover in COVERS.items():
        backdrop = composite((0, 0, 0), BACK_OVERLAY, rgb(cover))
        rest = contrast(text, composite(*SURFACE, backdrop))
        hover = contrast(text, composite(*HOVER, backdrop))
        worst = min(x for x in (worst, rest, hover) if x is not None)
        print(f"{name:16}{rest:>8.2f}{hover:>8.2f}")

    print(f"\nworst {worst:.2f} against a floor of {FLOOR}")
    if worst < FLOOR:
        raise SystemExit(f"FAIL: {worst:.2f} is below {FLOOR}")
    print("pass")


if __name__ == "__main__":
    main()
