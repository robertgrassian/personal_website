"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { localToday, RATINGS, type IgdbSearchResult, type NewGame, type Rating } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";
import { addGame, addWishlistItem, searchGames } from "@/app/video_games/actions";
import { CloseIcon } from "@/components/Icon";

const inputClass =
  "w-full bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

const labelClass = "flex flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label";

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

  // null = search step; set = confirm step.
  const [draft, setDraft] = useState<Draft | null>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement;
    searchInputRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Debounced search. The timeout collapses bursts of keystrokes into one
  // request; the sequence counter drops responses that arrive after a newer
  // request fired (awaited results can land out of order).
  const searchSeq = useRef(0);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const seq = ++searchSeq.current;
      const res = await searchGames(trimmed);
      if (seq !== searchSeq.current) return; // a newer search superseded this one
      setSearching(false);
      if (res.ok) {
        setResults(res.results);
        setSearchError(null);
      } else {
        setResults(null);
        setSearchError(res.message);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [query]);

  const pickResult = (r: IgdbSearchResult) => {
    setError(null);
    setDraft({
      name: r.name,
      // Best guess; the field is editable and existing shelves are suggested.
      system: r.platforms[0] ?? "",
      platforms: r.platforms,
      genresText: r.genres.join(", "),
      releaseDate: r.releaseDate || null,
      imageUrl: r.coverUrl,
      igdbId: r.igdbId,
      rating: "",
      starred: false,
    });
  };

  const startManual = () => {
    setError(null);
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg border border-shelf-plank bg-shelf-bg p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-shelf-text font-semibold leading-snug">{heading}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-shelf-text-muted hover:text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {draft === null ? (
          <>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search IGDB…"
              aria-label="Search IGDB for a game"
              className={`${inputClass} mt-4`}
            />

            {searching && <p className="mt-3 text-xs text-shelf-text-muted italic">Searching…</p>}
            {searchError && (
              <p role="alert" className="mt-3 text-xs text-red-500 dark:text-red-400">
                {searchError}
              </p>
            )}

            {!searching && results !== null && (
              <ul className="mt-3 flex flex-col gap-1">
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
              </ul>
            )}

            <button
              type="button"
              onClick={startManual}
              className="mt-4 text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer"
            >
              Can&rsquo;t find it? Add it manually
            </button>
          </>
        ) : (
          <div className="mt-4">
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
                <input
                  type="text"
                  value={draft.genresText}
                  onChange={(e) => setDraft({ ...draft, genresText: e.target.value })}
                  placeholder="e.g. RPG, Adventure"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Release date
                <input
                  type="date"
                  value={draft.releaseDate ?? ""}
                  max={localToday()}
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

            <div className="mt-4 flex items-center gap-3">
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
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
