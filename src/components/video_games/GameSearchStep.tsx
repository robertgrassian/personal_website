"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { IgdbSearchResult } from "@/lib/games";
import { searchGames } from "@/app/video-games/actions";
import { ghostButtonClass, inputClass } from "./formStyles";

type GameSearchStepProps = {
  // Restores the box when the user comes back from the confirm form. This
  // component is unmounted while that form is open, so the query has to be
  // handed up at the seam and back down on return.
  initialQuery: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  // Both report the current query up, so "Back to search" can restore it.
  onPick: (result: IgdbSearchResult, query: string) => void;
  onManual: (query: string) => void;
};

// The search step of the add flow: debounced IGDB search, paging, and the
// results list. Split out of AddGameModal so all of this state unmounts the
// moment a game is picked — it shares nothing with the confirm form, and used
// to re-render on every keystroke typed into it.
export function GameSearchStep({ initialQuery, inputRef, onPick, onManual }: GameSearchStepProps) {
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
        <p role="alert" className="mt-3 shrink-0 text-xs text-red-500 dark:text-red-400">
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
          className={`mt-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto transition-opacity ${
            searching ? "opacity-50" : ""
          }`}
        >
          {results.length === 0 && (
            <li className="text-xs text-shelf-text-muted italic">No matches.</li>
          )}
          {results.map((r) => (
            <li key={r.igdbId}>
              <button
                type="button"
                onClick={() => onPick(r, query)}
                className="flex w-full items-center gap-3 rounded-md border border-transparent p-2 text-left hover:border-shelf-plank hover:bg-shelf-input transition-colors cursor-pointer"
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
                </span>
              </button>
            </li>
          ))}

          {/* Inside the scroll area, deliberately: as the last row it is
              only reachable once you have read to the bottom of the
              list, which is the only point at which wanting more makes
              sense. No scroll listener needed to get that behaviour. */}
          {hasMore && (
            <li className="pt-1">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-md border border-shelf-plank py-1.5 text-xs text-shelf-text-muted hover:bg-shelf-input hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                {loadingMore ? "Loading…" : "Show more results"}
              </button>
            </li>
          )}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onManual(query)}
        // self-start because a flex column stretches its children:
        // without it this underlined link would span the full width.
        className={`mt-4 shrink-0 self-start ${ghostButtonClass}`}
      >
        Can&rsquo;t find it? Add it manually
      </button>
    </>
  );
}
