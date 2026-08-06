"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { localToday, RATINGS, type IgdbSearchResult, type NewGame, type Rating } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";
import { addGame, addWishlistItem, lookupGameGenres, searchGames } from "@/app/video-games/actions";
import { ModalShell } from "./ModalShell";
import { inputClass, labelClass } from "./formStyles";

// The confirm form's working copy: NewGame except genres, which stay a raw
// comma-separated string while typing (splitting on every keystroke would
// fight the user mid-word). `platforms` keeps the pick's IGDB platform list
// around as system suggestions; it is not part of the POST payload.
type Draft = Omit<NewGame, "genres"> & {
  genresText: string;
  platforms: string[];
  starred: boolean;
};

type AddGameModalProps = {
  // Where the confirmed game goes. Same search/confirm flow either way;
  // "wishlist" swaps the rating picker for a star checkbox and makes the
  // system optional (wishlist entries may not have picked a platform yet).
  target: "library" | "wishlist";
  // The library's current shelf systems, offered as suggestions so new games
  // land on existing shelves ("SNES") instead of IGDB's names ("Super
  // Nintendo Entertainment System").
  existingSystems: string[];
  onClose: () => void;
};

// Owner-only "add a game" dialog: IGDB search → pick a result → confirm/edit
// its details → POST. A manual path (blank form) covers games IGDB doesn't
// know. Same mount-only lifecycle as EditGameModal: scroll lock and Escape
// bind on mount, focus returns to the opener on unmount.
export function AddGameModal({ target, existingSystems, onClose }: AddGameModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IgdbSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Paging state for "show more". `page` is the deepest page already loaded
  // (results accumulate rather than replace); `hasMore` is the API's answer,
  // not something derived here, since only it knows the page cap.
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // null = search step; set = confirm step.
  const [draft, setDraft] = useState<Draft | null>(null);
  // Status of the Wikipedia/Wikidata genre lookup for the picked game, purely
  // so the field can say why it changed under the user a moment after picking.
  const [genreLookup, setGenreLookup] = useState<"idle" | "loading" | "done" | "none">("idle");
  // Bumped per lookup, and again when the field is hand-edited, so a slow
  // response knows it has been superseded. Same counter pattern the IGDB search
  // above uses.
  const genreSeq = useRef(0);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Handed to ModalShell as the initial focus target, so this dialog opens
  // ready to type instead of focused on its close button.
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const pickResult = (r: IgdbSearchResult) => {
    setError(null);
    setDraft({
      name: r.name,
      // Best guess; the field is editable and existing shelves are suggested.
      system: r.platforms[0] ?? "",
      platforms: r.platforms,
      // IGDB's genres, shown immediately so the field is never empty, then
      // replaced below by the Wikipedia/Wikidata answer when it arrives.
      genresText: r.genres.join(", "),
      releaseDate: r.releaseDate || null,
      imageUrl: r.coverUrl,
      igdbId: r.igdbId,
      rating: "",
      starred: false,
    });
    void fetchGenres(r.name);
  };

  /** Replace the picked game's genres with the Wikipedia/Wikidata ones.
   *
   *  IGDB identifies the game well but describes it poorly: its genre field has
   *  no roguelike on Hades II and no metroidvania on Animal Well. This is the
   *  same lookup the genre backfill script uses, so games added here and games
   *  already on the shelves end up speaking one vocabulary.
   *
   *  Deliberately best-effort: a miss or an outage leaves IGDB's genres in
   *  place rather than blocking the add, and the field stays editable either
   *  way.
   *
   *  Two things it must not do, both of which it once did. It must not clobber
   *  what the user has typed: the lookup takes a second or two, which is long
   *  enough to start editing the genre field, so a response is discarded unless
   *  it is still the newest one AND the field has not been touched since. And
   *  it must not strand the status label on "checking" when the call throws --
   *  the Server Action can reject on the 15s timeout, which left it spinning
   *  forever. */
  const fetchGenres = async (name: string) => {
    const seq = ++genreSeq.current;
    setGenreLookup("loading");
    try {
      const res = await lookupGameGenres(name);
      // A newer pick has superseded this response, or the user has edited the
      // field by hand (which resets the status to "idle").
      if (seq !== genreSeq.current) return;
      let applied = false;
      setDraft((current) => {
        if (current === null || current.name !== name) return current;
        if (!res.ok || res.genres.length === 0) return current;
        applied = true;
        return { ...current, genresText: res.genres.join(", ") };
      });
      setGenreLookup(applied ? "done" : "none");
    } catch {
      setGenreLookup("none");
    }
  };

  const startManual = () => {
    setError(null);
    // Manual entry has no picked game to look up, so no status to report.
    setGenreLookup("idle");
    setDraft({
      name: query.trim(),
      system: "",
      platforms: [],
      genresText: "",
      releaseDate: null,
      imageUrl: "",
      igdbId: null,
      rating: "",
      starred: false,
    });
  };

  const save = () => {
    if (draft === null) return;
    const genres = draft.genresText
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    startTransition(async () => {
      setError(null);
      let result;
      if (target === "library") {
        const game: NewGame = {
          name: draft.name,
          system: draft.system,
          genres,
          releaseDate: draft.releaseDate,
          imageUrl: draft.imageUrl,
          igdbId: draft.igdbId,
          rating: draft.rating,
        };
        result = await addGame(game);
      } else {
        const item: NewWishlistItem = {
          name: draft.name,
          system: draft.system,
          genres,
          releaseDate: draft.releaseDate,
          imageUrl: draft.imageUrl,
          igdbId: draft.igdbId,
          starred: draft.starred,
          // Browser-local date — the API's default is UTC "today".
          dateAdded: localToday(),
        };
        result = await addWishlistItem(item);
      }
      if (result.ok) onClose();
      else setError(result.message);
    });
  };

  // Existing shelves first (the value you usually want), then the pick's own
  // IGDB platform names, deduped.
  const systemSuggestions = [...new Set([...existingSystems, ...(draft?.platforms ?? [])])];

  // Wishlist entries may leave the system undecided; library games can't.
  const saveDisabled =
    isPending ||
    draft === null ||
    !draft.name.trim() ||
    (target === "library" && !draft.system.trim());

  const heading = target === "library" ? "Add a game" : "Add to wishlist";

  return (
    <ModalShell
      label={heading}
      title={heading}
      onClose={onClose}
      error={error}
      // A flex column capped at 80% of the viewport, with only the middle
      // section scrolling: the heading, the search box and the buttons under
      // it stay put however many results come back. dvh rather than vh so
      // mobile browser chrome is excluded from the 80%. The cap is a max, so
      // a two-result search still renders a short dialog.
      panelClassName="flex max-h-[80dvh] w-full max-w-md flex-col"
      // The search box, not the close button: this dialog opens ready to type.
      initialFocusRef={searchInputRef}
    >
      <>
        {draft === null ? (
          <>
            <input
              ref={searchInputRef}
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
                      onClick={() => pickResult(r)}
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
              onClick={startManual}
              // self-start because a flex column stretches its children:
              // without it this underlined link would span the full width.
              className="mt-4 shrink-0 self-start text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer"
            >
              Can&rsquo;t find it? Add it manually
            </button>
          </>
        ) : (
          // Fragment, not one element: the scrolling body and the pinned
          // buttons have to be flex siblings of the dialog for only the body
          // to scroll.
          <>
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              {draft.imageUrl && (
                <Image
                  src={draft.imageUrl}
                  alt={`Cover of ${draft.name}`}
                  width={80}
                  height={107}
                  className="mb-3 h-[107px] w-20 rounded object-cover"
                />
              )}

              <div className="flex flex-col gap-3">
                <label className={labelClass}>
                  Name
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className={inputClass}
                  />
                </label>

                <label className={labelClass}>
                  {target === "library" ? "System" : "System (optional)"}
                  <input
                    type="text"
                    value={draft.system}
                    onChange={(e) => setDraft({ ...draft, system: e.target.value })}
                    list="known-systems"
                    placeholder="e.g. SNES, PS5"
                    className={inputClass}
                  />
                </label>
                {/* Native autocomplete: shelf systems appear as suggestions
                  under the input, but any free-text value is allowed. */}
                <datalist id="known-systems">
                  {systemSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>

                <label className={labelClass}>
                  Genres (comma-separated)
                  {genreLookup === "loading" && (
                    <span className="ml-2 font-normal text-shelf-text-muted">
                      checking Wikipedia...
                    </span>
                  )}
                  {genreLookup === "none" && (
                    <span className="ml-2 font-normal text-shelf-text-muted">
                      Wikipedia had no match, showing IGDB&apos;s genres
                    </span>
                  )}
                  <input
                    type="text"
                    value={draft.genresText}
                    onChange={(e) => {
                      setDraft({ ...draft, genresText: e.target.value });
                      // Hand-editing both stales the status note and cancels any
                      // in-flight lookup, so it cannot overwrite the typing.
                      genreSeq.current += 1;
                      setGenreLookup("idle");
                    }}
                    placeholder="e.g. RPG, Adventure"
                    className={inputClass}
                  />
                </label>

                <label className={labelClass}>
                  Release date
                  {/* Capped at today for the library (you can't have played a
                    game that isn't out yet) but uncapped for the wishlist,
                    where unreleased games are the normal case. */}
                  <input
                    type="date"
                    value={draft.releaseDate ?? ""}
                    max={target === "library" ? localToday() : undefined}
                    onChange={(e) => setDraft({ ...draft, releaseDate: e.target.value || null })}
                    className={inputClass}
                  />
                </label>

                {target === "library" ? (
                  <div>
                    <p className={labelClass}>Rating (optional)</p>
                    <div className="mt-1 grid grid-cols-5 gap-1.5">
                      {RATINGS.map((r) => {
                        const active = r.name === draft.rating;
                        return (
                          <button
                            key={r.letter}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setDraft({ ...draft, rating: active ? "" : (r.name as Rating) })
                            }
                            title={active ? "Remove rating" : `Rate ${r.name}`}
                            aria-label={active ? "Remove rating" : `Rate ${r.name}`}
                            className={`rounded-md border py-1.5 text-sm font-bold transition-colors cursor-pointer ${
                              active
                                ? "border-transparent text-black/80"
                                : "border-shelf-plank hover:bg-shelf-input"
                            }`}
                            style={active ? { backgroundColor: r.color } : { color: r.color }}
                          >
                            {r.letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-shelf-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.starred}
                      onChange={(e) => setDraft({ ...draft, starred: e.target.checked })}
                      className="accent-amber-500"
                    />
                    Star it (priority wishlist)
                  </label>
                )}
              </div>
            </div>

            {/* Pinned below the scroll area, so "Add to library" is reachable
                without scrolling to the bottom of a long form. */}
            <div className="mt-4 flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saveDisabled}
                className="rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                {target === "library" ? "Add to library" : "Add to wishlist"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={isPending}
                className="text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50"
              >
                Back to search
              </button>
            </div>
          </>
        )}
      </>
    </ModalShell>
  );
}
