"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { IgdbSearchResult } from "@/lib/games";
import { searchGames } from "@/app/video-games/actions";
import { Button } from "@/components/ui/Button";
import { inputClass } from "./formStyles";
import { foldForSearch } from "./pipeline";

// The identity of a game for "do I already have this?", as one map key.
//
// Mirrors the server's rule (api/app/repositories/me.py, find_game_by_name):
// an IGDB game IS its igdb_id, and only a hand-entered game — which has no id
// to compare — falls back to its name. Both sides of the annotation go through
// this one function so the map and the lookup cannot disagree; the prefixes
// keep an id from ever colliding with a title that happens to be a number.
//
// `== null` catches undefined too, on purpose: the library payload is
// force-cached and tag-invalidated (libraryApi.ts), so an entry cached before
// `igdbId` existed can still arrive without it. Under `===` those all key to
// "igdb:undefined" and the annotation vanishes; under `==` they fall back to
// the name.
export function ownedKey(game: { name: string; igdbId: number | null }): string {
  return game.igdbId == null ? `name:${foldForSearch(game.name)}` : `igdb:${game.igdbId}`;
}

type GameSearchStepProps = {
  // Restores the box when the user comes back from the confirm form. This
  // component is unmounted while that form is open, so the query has to be
  // handed up at the seam and back down on return.
  initialQuery: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  // ownedKey → systems already owned under that key, for the collection being
  // added to. A hit annotates the row rather than disabling it, but it is now
  // a warning rather than a note: since the shared catalog landed, one entry
  // per game per user is enforced, so picking a matched row and submitting
  // gets a 409 whatever system you choose. A search result always has an
  // igdb id, so the only looseness left is against hand-entered games, where
  // both sides fall back to the folded name.
  ownedNames: Map<string, string[]>;
  // What a hit is called: "In your library" or "On your wishlist".
  ownedLabel: string;
  // Both report the current query up, so "Back to search" can restore it.
  onPick: (result: IgdbSearchResult, query: string) => void;
  onManual: (query: string) => void;
};

// The search step of the add flow: debounced IGDB search, paging, and the
// results list. Split out of AddGameModal so all of this state unmounts the
// moment a game is picked — it shares nothing with the confirm form, and used
// to re-render on every keystroke typed into it.
export function GameSearchStep({
  initialQuery,
  inputRef,
  ownedNames,
  ownedLabel,
  onPick,
  onManual,
}: GameSearchStepProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<IgdbSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Paging state for "show more". `page` is the deepest page already loaded
  // (results accumulate rather than replace); `hasMore` is the API's answer,
  // not something derived here, since only it knows the page cap.
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounced search. The timeout collapses bursts of keystrokes into one
  // request; the sequence counter drops responses that arrive after a newer
  // request fired (awaited results can land out of order).
  const searchSeq = useRef(0);
  useEffect(() => {
    const trimmed = query.trim();
    // Editing the query starts a new result set, so a "show more" fetch in
    // flight is abandoned here. Bumping the counter now, rather than leaving
    // it to the debounce timeout below, is what actually abandons it: a
    // response landing inside the 350ms gap would otherwise pass its own
    // staleness check and write page 2 over what is about to be page 1.
    searchSeq.current += 1;
    setLoadingMore(false);
    setPage(1);
    if (trimmed.length < 2) {
      setResults(null);
      setSearching(false);
      setSearchError(null);
      setHasMore(false);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      // No second bump: the effect body above already invalidated everything
      // in flight, and nothing else can fire between then and here.
      const seq = searchSeq.current;
      const res = await searchGames(trimmed);
      if (seq !== searchSeq.current) return; // a newer search superseded this one
      setSearching(false);
      if (res.ok) {
        setResults(res.results);
        setHasMore(res.hasMore);
        setSearchError(null);
      } else {
        setResults(null);
        setHasMore(false);
        setSearchError(res.message);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [query]);

  /** Append the next page of IGDB matches.
   *
   *  Deliberately not routed through the debounced effect above: typing fires
   *  that effect on its own schedule, and paging must cost exactly one search
   *  per click — every page is another charge against the server-side
   *  per-minute IGDB budget. It shares the effect's sequence counter so a
   *  keystroke mid-fetch discards this response instead of appending results
   *  from the previous query. */
  const loadMore = async () => {
    const trimmed = query.trim();
    const next = page + 1;
    if (loadingMore || !hasMore) return;
    const seq = ++searchSeq.current;
    setLoadingMore(true);
    const res = await searchGames(trimmed, next);
    if (seq !== searchSeq.current) return; // the query changed under us
    setLoadingMore(false);
    if (!res.ok) {
      setSearchError(res.message);
      setHasMore(false);
      return;
    }
    setPage(next);
    setHasMore(res.hasMore);
    // Deduped by igdbId: the fallback queries on the API side can surface a
    // game already shown, and a repeated key would break the list.
    //
    // `results` from this render is safe to read directly rather than through
    // an updater: the only other writer is the debounced search, and the
    // sequence guard above has already returned if one landed.
    const shown = results ?? [];
    const seen = new Set(shown.map((r) => r.igdbId));
    const fresh = res.results.filter((r) => !seen.has(r.igdbId));
    if (fresh.length === 0) return;
    // Appending only, so no row already on screen moves.
    setResults([...shown, ...fresh]);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        // Matches the server action's upper bound, so pasting a long
        // string can't produce a query the action refuses outright.
        maxLength={100}
        placeholder="Search IGDB…"
        aria-label="Search IGDB for a game"
        className={`${inputClass} mt-4 shrink-0`}
      />

      {searching && (
        <p className="mt-3 shrink-0 text-xs text-shelf-text-muted italic">Searching…</p>
      )}
      {searchError && (
        <p role="alert" className="mt-3 shrink-0 text-xs text-shelf-danger">
          {searchError}
        </p>
      )}

      {/* The only scrolling part of the dialog. `min-h-0` is the
          non-obvious half: a flex item's default `min-height: auto`
          refuses to shrink below its content, so without it the list
          would push the dialog past its max height instead of
          scrolling inside it.

          Rendered while a new search is in flight rather than being
          unmounted and rebuilt: the previous matches dim in place, so
          the list no longer collapses under you mid-word, and React
          reconciles up to 100 rows of cover art instead of remounting
          them on every keystroke. */}
      {results !== null && (
        <ul
          aria-busy={searching}
          className={`mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain transition-opacity ${
            searching ? "opacity-50" : ""
          }`}
        >
          {results.length === 0 && (
            <li className="text-xs text-shelf-text-muted italic">No matches.</li>
          )}
          {results.map((r) => {
            // Two lookups, matching the two ways the server can call this the
            // same game: the id first, then the name — which only hits a
            // hand-entered entry, since anything with an id is filed under it.
            //
            // undefined = not owned. An empty array means owned with no system
            // recorded, which the wishlist allows, so the two cases are
            // distinguished by presence rather than by length.
            const ownedOn =
              ownedNames.get(ownedKey(r)) ?? ownedNames.get(`name:${foldForSearch(r.name)}`);
            return (
              <li key={r.igdbId}>
                <button
                  type="button"
                  onClick={() => onPick(r, query)}
                  className="flex w-full items-center gap-3 rounded-md border border-transparent p-2 text-left hover:border-shelf-border hover:bg-shelf-input transition-colors cursor-pointer"
                >
                  {r.coverUrl ? (
                    <Image
                      src={r.coverUrl}
                      alt=""
                      width={40}
                      height={54}
                      className="h-[54px] w-10 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-[54px] w-10 shrink-0 rounded bg-shelf-input"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-shelf-text">{r.name}</span>
                    <span className="block truncate text-xs text-shelf-text-muted">
                      {[r.releaseDate.slice(0, 4), r.platforms.join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {/* A third line rather than a badge beside the title: the
                      systems make it long, and the two lines above are already
                      truncated, so there is no horizontal room to take. Only
                      matched rows grow, and they stay inside the 54px cover. */}
                    {ownedOn !== undefined && (
                      <span className="text-link block truncate text-xs">
                        {ownedOn.length > 0 ? `${ownedLabel}: ${ownedOn.join(", ")}` : ownedLabel}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}

          {/* Inside the scroll area, deliberately: as the last row it is
              only reachable once you have read to the bottom of the
              list, which is the only point at which wanting more makes
              sense. No scroll listener needed to get that behaviour. */}
          {hasMore && (
            <li className="pt-1">
              {/* size="none" so the call site can set text-xs: this is the
                  least important control in the list and should not match the
                  dialog's real buttons. */}
              <Button
                size="none"
                className="w-full py-1.5 text-xs"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Show more results"}
              </Button>
            </li>
          )}
        </ul>
      )}

      <Button
        variant="ghost"
        onClick={() => onManual(query)}
        // self-start because a flex column stretches its children:
        // without it this underlined link would span the full width.
        className="mt-4 shrink-0 self-start"
      >
        Can&rsquo;t find it? Add it manually
      </Button>
    </>
  );
}
