# Shelf wood grain

The profiles in `tiles/` are the source of truth. `npm run grain` renders them to
`public/shelf/*.webp`, plus PNG copies in `public/shelf/og/` for the library's OG image
(Satori cannot decode WebP), all committed. No build step runs it.

**To tweak the grain, edit a profile and re-run it** (~2s for all three;
`npm run grain -- grain-h` bakes just one). Every layer paints one colour at
`gain × field + offset` alpha. The validator rejects an unknown or missing field rather than
defaulting it, so a typo is loud.

## Tried and wrong, do not re-propose

- **Putting the noise back in CSS as a data URI.** It is generated per pixel and the browser
  regenerates it whenever the raster target size changes, which blanked the whole library for
  about a second on every desktop zoom step.
- **Rasterising with sharp/librsvg.** librsvg ignores `stitchTiles`, so its tiles do not wrap and
  show a hard line at every repeat. Hence the port of the spec's `feTurbulence` in
  `turbulence.mjs`, which stitches and matches what Chrome draws.
- **Drawing wood with noise alone.** Wood is periodic and fractal noise is not, so it can only
  ever produce a smear, which is why `rings.mjs` exists.
- **SVG sources** (the format until 2026-09-05). They bought one thing: a browser could preview
  them. The ring primitive is not a filter any browser implements, so that stopped being true,
  and what was left was regex-parsed XML plus a 20-number `feColorMatrix` whose alpha gain lived
  at index 15. Every layer only ever painted one colour at a varying alpha, so the named fields
  lost no expressiveness.

## Keeping ring layers seamless

A ring layer can break the tiling in two independent ways, and `profiles.test.mjs` checks both
axes of every shipped tile against the median interior gap:

- **Its drift and jitter must come from a stitched turbulence** (they run along the grain).
- **`across` must stay measured from the tile's mid-line** (it runs the other way and is a bare
  linear ramp, saved only by entering squared and symmetric). `grain-back` shipped once measured
  from 0.42 of its width and seamed 82x worse than an interior column, which is why there is no
  `center` parameter any more.
