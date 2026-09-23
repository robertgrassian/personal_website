# A music app at `/music`: a decade's albums as a wall of sleeves, walked genre by genre along an authored path, played through Spotify.

_Section: **Backlog / Ideas** &middot; index: [`TODO.md`](../../TODO.md)_

Scoped out 2026-09-23 from notes written while watching the 90s/00s/10s music documentaries. The
notes proposed five overlapping ideas and argued against each; what follows is what survived the
questioning, including the alternatives that were considered and dropped, so they are not
re-proposed.

## The shape

**The spine is decade, then genre.** You enter a decade and move along an **authored** sequence of
its genres, roughly 8 per decade, hand-written rather than derived. The 00s might run garage rock
revival into indie into crunk into snap into emo. The authored order is what makes it feel like a
documentary instead of a filterable table, and it is cheap: 3 decades x ~8 genres is one afternoon
of writing.

**The unit is the album.** One sleeve on the wall is one album. A singles tab was wanted in the
original notes and is deferred, not dropped: shape the schema and the route so it slots in as a
sibling later. Note that singles cannot use the same canon source, since critic year-end *song*
lists are thin before ~2005, so that tab would end up Billboard-flavored.

**Selection is a quota per genre, not a top N per year.** This is a correction to the first
instinct. Aggregated critic consensus skews hard toward rock/indie, so a straight top-10-per-year
gives a genre path where indie rock has forty albums and soul has two. Instead: fix the decade's
genre list first, then take the top ~10 albums per genre per decade. That is ~80 per decade, ~240
total, distributed on purpose. The year stops being a bucket and becomes a property of a record,
which still lets the wall sort chronologically inside a genre.

**It is stateless.** No site accounts, no user rows, no write path, no Server Actions, no cache
tags to pair. Every visitor gets the same page. This is a deliberate reversal of the "checklist"
framing in the original ask, chosen after seeing what it costs; see _Rejected_ below for the two
checklist designs that were considered and why they lost.

**Browse and feed, both.** A wall you can dig through, plus a shuffle that plays a random full
album from whatever the current view has been narrowed to. The narrowing is the only control
shuffle needs.

**The sleeve back is a control surface, not a page.** Click a record, it flies out, you get play
and a tracklist. No liner-note essay. Written blurbs per album were considered and dropped as ~240
pieces of real writing.

## What makes it harder than it looks

_The shelf machinery is not reusable as it stands._ This is the main under-estimate. "Like my game
library" reads as an import and is not one:

- `SHELF_GROUPS` in `shelves/index.ts` is a `Record<ShelfThemeName, ...>` whose props type is
  `GameCaseInput`, and `GameCase` itself imports `Rating`, `RATINGS` and `useLibraryCard`.
- `pipeline.ts` imports `Game`, `WishlistGame`, `Filters` and `RATINGS` by name; its grouping keys
  come from `libraryConfig.ts`.
- All of it lives under `src/components/video_games/`, and the surfaces are in
  `src/app/video-games/shelf-themes.css` and `video-games.css`.

So there are two honest options, and the entry does not pick one: **generalize** the shelf seam so a
group renders any card-shaped thing (real work, and it would have to preserve the theme contract in
`shelfTheme.ts`: a name, a component, a token block), or **copy** it into a music namespace and
accept the duplication until a third consumer proves the abstraction. Copying first is the
conventional call and the one to beat. What is genuinely free either way:
`src/lib/dominant-color.ts`'s `cachedDominantColor` (album art is the ideal input for it), the
sticky-chrome pattern against `--nav-offset`, and the detail-card flight.

_Per-album genre has no good free source, and Spotify is not it._ Spotify's genres hang off the
**artist** and are career-wide, so every Radiohead record is `permanent wave, art rock, oxford
indie`. The decision is **Discogs**, whose releases carry a two-level Genre plus Style
(`Electronic` / `Trip Hop`, `Hip Hop` / `G-Funk`), curated by collectors, well covered for anything
in a critic list, free API with a token and a rate limit. MusicBrainz (flatter, thinner) and Last.fm
tags (vocabulary full of "seen live" and "favorite albums") were the alternatives; Last.fm in
particular would import the exact problem **Audit the genre vocabulary** already tracks.

_The canon has to be built, not fetched._ There is no "top albums of 1994" API. Spotify has a
per-album popularity score, but it measures streams **today**, so it flatters reissues and whatever
went viral recently. The decision is an Acclaimed-Music-style aggregation of published critic
year-end lists. **Open question:** Acclaimed Music is one person's site with no API and no reuse
license, so scraping it wholesale is legally grey and technically brittle. The clean version is
aggregating the primary published lists (Pitchfork, NME, Rolling Stone, The Wire, Spin) yourself,
which is more ingest work but is defensible and yours. Decide before writing the scraper, not after.

_In-page playback has a hard 25-user ceiling._ The Web Playback SDK requires every listener to have
Spotify **Premium**, and a new app stays in development mode, capped at 25 users added by email in
the dashboard. Extended quota is granted case by case and aimed at organizations, not personal
sites. This collides directly with the Up Next organizing goal of **sharing the site with people**,
and the resolution is that the *site* is public and *playback* is the private layer: everyone gets
the full wall, the decades, the genre path and the art; pressing play prompts a Spotify login and
only works in-page for whitelisted Premium accounts. Everyone else gets an "open in Spotify" deep
link, which needs no auth and works for 100% of visitors.

_The obvious fallback no longer exists._ Spotify's late-2024 API cut removed `preview_url` (the
30-second clip), audio-features, audio-analysis, recommendations and related-artists for new apps.
So "logged-out visitors get a preview" is not buildable. Confirm the current state of that policy at
build time rather than trusting this paragraph, since it is the fastest-moving fact here.

_Cover art may not be croppable._ **Speculative, verify before designing the sleeve.** Spotify's
developer policy requires content be attributed and not altered. Rendering unmodified cover art
inside a sleeve frame is very likely fine; a circular crop onto a spinning record label plausibly is
not. This constrains the visual, so check it before the design depends on it. Discogs release
images carry their own terms and are a second option.

## Where it lives

`/music`, owning its prefix the way the library owns `/video-games`, per the convention in
`CLAUDE.md`. This is the **first real test of** **Decide the routing/namespace strategy**, which is
half-settled toward per-app route prefixes on one domain (option a) on the strength of a single app.
A second app is exactly the case that entry says is still open, so settling it is a prerequisite,
not a side effect. Auth stays top-level either way. Note the music app needs no site auth at all,
which is a data point *for* option (a): the cross-app SSO argument that makes subdomains expensive
does not apply here.

Storage is Postgres in the existing FastAPI app, ingested by a **standalone script writing straight
to the DB**, so there is queryability (and a home for a checklist if that ever comes back) without
building any write surface. A committed JSON dataset was the alternative and is a reasonable
fallback if the backend stack feels like too much for data that never changes.

## Staged build

1. **The authored data, no code.** The genre sequence per decade, and the ~10 albums per genre per
   decade. Everything downstream is worthless if this list is not good, and it is the only part that
   cannot be automated.
2. **Ingest script.** Resolve each album to Discogs (genre, style, year, label) and Spotify (album
   id, cover art, tracklist), write to Postgres. Fuzzy matching is the real work: expect a
   hand-corrected exceptions list.
3. **Migration and read path.** Tables, repository/service/router per `api/README.md`, and a
   `src/lib/musicApi.ts` mirroring `libraryApi.ts` as the `server-only` boundary.
4. **The wall.** `/music`, decade nav, genre sections in authored order, the sleeve component.
   Decide generalize-vs-copy here.
5. **Playback.** Spotify OAuth for playback scopes, the Web Playback SDK, deep-link fallback for
   everyone else.
6. **Shuffle.**

Stages 1 and 2 are worth doing alone: they produce a dataset that is interesting even if the site
never gets built, and they are where the project fails if it fails.

## Rejected

- _An explicit checklist with progress bars._ The literal reading of the original ask. Dropped in
  favor of statelessness. It needs accounts, a write path and cache tags, which is most of the game
  library's machinery for a site whose value is the browsing.
- _A checklist sourced from Spotify with no database._ Genuinely clever and still dropped: ask
  Spotify which of the albums on screen are in the listener's saved albums, and mark those. Zero
  persistence, no accounts, real checklist. Rejected because it only works for the 25 whitelisted
  Premium users, so it is a feature almost no visitor can see. Revisit if extended quota is ever
  granted.
- _Documentary artists as the catalog._ The original notes' smaller idea: only artists named in the
  episodes. Dropped for a broad critic-consensus catalog. A "featured in the documentary" badge over
  the broad catalog was the middle option and is still available cheaply if the urge returns.
- _Year-by-year chronology as the spine, and a genre-adjacency map._ Both lost to decade-then-genre.
  Chronology cannot express "this genre answered that one"; an adjacency graph is hard to make
  defensible and trades the story for wandering.
- _Singles as the primary unit._ Breaks the vinyl-wall visual, and "top songs of 2004" is a playlist
  that Spotify already does well.
