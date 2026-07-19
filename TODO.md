# Project TODO

## Up Next

## Recently Completed

- [x] Game library page now uses the photorealistic CRT (`components/crt/CrtTv.tsx`, relocated out of `currently_playing/` since it's shared by two routes) instead of the wood-paneled TV; `/currently_playing` still works standalone. Old wood TV (`components/video_games/CurrentlyPlaying.tsx`) and its `crt-*` styles in `video_games.css` are left in place, unused
- [x] Dedicated `/currently_playing` route rendering a photorealistic '90s black-plastic CRT (hand-built CSS/SVG: molded cabinet, phosphor RGB mask, scanlines, roll bar, glare, speaker grille, dials, power LED) with the `▶ PLAY`/`CH 0N` OSD and channel-flicking; permanent "NO SIGNAL" snow when nothing is playing. Unlinked for now (URL-only). New component `components/currently_playing/CrtTv.tsx`; existing library TV untouched
- [x] Multiple currently-playing games on the CRT: channel-flicking — auto-cycle between in-progress games with a static/noise burst and `CH 0N` OSD, plus a clickable channel knob to advance manually and channel pips in the metadata (CurrentlyPlaying is now a client component)
- [x] Fix `.claude/tools/wikipedia.py` truncating nested templates (platforms/released_raw cut off mid-`{{collapsible list}}`) + add-game guidance for enhanced editions/ports (original NA date wins)

## Backlog / Ideas

- [ ] "Current Hobbies" section on `/about` — start with currently-playing games (reusing the CRT/session data from the game library), with room to extend to books currently being read and other hobbies later. Design not decided yet (what it looks like, whether it reuses `CrtTv` directly or needs its own compact treatment).
- [ ] Alternate "currently playing" display: Marquee Banner (Option 2 from the mockups) — full-width banner using the game's blurred cover as the backdrop (same recipe as GameCaseBack: dominant color base + blurred art + dark overlay), sharp cover on the left, system/genre chips and "last played" on the right. Build it as a sibling of `CurrentlyPlaying` (same `Game` prop) and add a display-mode switch (config const, or URL param for fun) to swap between the CRT and the marquee. Mockups: https://claude.ai/code/artifact/2e891385-8fc9-4c9b-b8da-469658de243d
- [ ] Make an "improve" skill that runs a code review on recent changes, follows up on obviously actionable items, cleans up comments, and ensures code is clean / using best practices
- [ ] Fun interactive game/toy page for fun and for learning TypeScript — e.g. a DVD logo bouncing around with controls (size, speed, visuals) and a hit counter, or an bouncy ball game where you launch a ball (angry birds style) to bounce off platforms into a goal zones. The bouncy ball game could have cool "items" added to it (like portals, calls to other video games, etc)
- [ ] Start filling in last_played dates (ISO format YYYY-MM-DD) for recently played games; build a "recently played" feature on stats page
- [ ] test that my linting on prs is working
- [ ] Dark mode toggle
- [ ] A fun game to make could be a "shift" inspired game... i liked that one a lot
- [ ] Stats page: average rating per genere? Any other cool ones? Maybe average rating per X, ie ranked genres, ranked consoles, etc
- [ ] Game library "want to play"
- [ ] Movie library want to watch list, maybe a whole movie's seen section too...
- [ ] similar to the movie library idea, book library would be cool too. I wonder, if i had that many, maybe the route would just become "Library" and then i have my 3 sub libraries (games, movies, books) as sub routes of it. If I did, I would have to think how that library landing page would look like. would i: default to game library, have a page that has a card for all 3 (but then the user needs to make an extra click to start seeing, which i think is an issue), something else?
