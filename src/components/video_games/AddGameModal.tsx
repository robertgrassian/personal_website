"use client";

import { useRef, useState } from "react";
import { localToday, type IgdbSearchResult, type NewGame } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";
import { addGame, addWishlistItem } from "@/app/video-games/actions";
import { ModalShell } from "./ModalShell";
import { useServerAction } from "./useServerAction";
import type { MutateResult } from "@/lib/meApi";
import { GameSearchStep } from "./GameSearchStep";
import { GameDraftForm, type Draft } from "./GameDraftForm";

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
//
// The two steps are separate components because they share no state and no
// handlers — the seam was already visible in the JSX as `draft === null`.
// Keeping them in one component meant seven search state slots stayed alive
// and re-rendered on every keystroke typed into the confirm form, and the
// genre-lookup state was dead weight during search. Each now unmounts when the
// other is showing.
export function AddGameModal({ target, existingSystems, onClose }: AddGameModalProps) {
  // null = search step; set = confirm step.
  const [draft, setDraft] = useState<Draft | null>(null);
  // Remembered at hand-off, not on every keystroke, so "Back to search" can
  // restore the box.
  //
  // The box is all it restores, and that is the price of unmounting the search
  // step: going back drops the result list, any "Show more" pages already
  // loaded, and the error state, then re-runs the query after the 350ms
  // debounce — one more charge against the server-side per-minute IGDB budget.
  // Accepted because the alternative is keeping the whole result list mounted
  // behind the confirm form, which is the cost this split exists to remove.
  const [lastQuery, setLastQuery] = useState("");
  // The name to look up genres for, or null on the manual path. Passed down
  // rather than fetched here so the lookup lives with the field it writes to.
  const [lookupGenresFor, setLookupGenresFor] = useState<string | null>(null);

  const { isPending, error, setError, run } = useServerAction();

  // Handed to ModalShell as the initial focus target, so this dialog opens
  // ready to type instead of focused on its close button. Created here because
  // ModalShell is here, and forwarded into the search step.
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pickResult = (r: IgdbSearchResult, query: string) => {
    setError(null);
    setLastQuery(query);
    setDraft({
      name: r.name,
      // Best guess; the field is editable and existing shelves are suggested.
      system: r.platforms[0] ?? "",
      platforms: r.platforms,
      // IGDB's genres, as the fallback for when the Wikipedia/Wikidata lookup
      // misses. Held but not shown until that lookup settles: the confirm form
      // renders the field as loading until then, so the user sees one genre
      // list rather than IGDB's being overwritten in front of them.
      genresText: r.genres.join(", "),
      releaseDate: r.releaseDate || null,
      imageUrl: r.coverUrl,
      igdbId: r.igdbId,
      rating: "",
      starred: false,
    });
    setLookupGenresFor(r.name);
  };

  const startManual = (query: string) => {
    setError(null);
    setLastQuery(query);
    setLookupGenresFor(null);
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
    // The two targets share every field except the last one, so the common
    // shape is built once and each branch adds only what is its own: a rating
    // for the library, starred + dateAdded for the wishlist.
    const shared = {
      name: draft.name,
      system: draft.system,
      genres,
      releaseDate: draft.releaseDate,
      imageUrl: draft.imageUrl,
      igdbId: draft.igdbId,
    };
    const submit = (): Promise<MutateResult> => {
      if (target === "library") {
        const game: NewGame = { ...shared, rating: draft.rating };
        return addGame(game);
      }
      const item: NewWishlistItem = {
        ...shared,
        starred: draft.starred,
        // Browser-local date — the API's default is UTC "today".
        dateAdded: localToday(),
      };
      return addWishlistItem(item);
    };
    run(submit, { onSuccess: onClose });
  };

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
      {draft === null ? (
        <GameSearchStep
          initialQuery={lastQuery}
          inputRef={searchInputRef}
          onPick={pickResult}
          onManual={startManual}
        />
      ) : (
        <GameDraftForm
          target={target}
          draft={draft}
          setDraft={setDraft}
          existingSystems={existingSystems}
          lookupGenresFor={lookupGenresFor}
          isPending={isPending}
          onBack={() => setDraft(null)}
          onSave={save}
        />
      )}
    </ModalShell>
  );
}
