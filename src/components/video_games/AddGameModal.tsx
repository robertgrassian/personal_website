"use client";

import { useRef, useState } from "react";
import { localToday, type IgdbSearchResult, type NewGame } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";
import { addGame, addWishlistItem } from "@/app/video-games/actions";
import { ModalShell } from "./ModalShell";
import { useServerAction } from "./useServerAction";
import type { MutateResult } from "@/lib/meApi";
import { GameSearchStep } from "./GameSearchStep";
import { GameDraftForm, draftGenres, type Draft } from "./GameDraftForm";
import { usePlayDraft } from "./usePlayDraft";

type AddGameModalProps = {
  // Where the confirmed game goes. Same search/confirm flow either way;
  // "wishlist" swaps the rating picker for a star checkbox and makes the
  // system optional (wishlist entries may not have picked a platform yet).
  target: "library" | "wishlist";
  // The library's current shelf systems, offered as suggestions so new games
  // land on existing shelves ("SNES") instead of IGDB's names ("Super
  // Nintendo Entertainment System").
  existingSystems: string[];
  // Folded name → the systems that name is already on, for whichever collection
  // this dialog is adding to. Built in GameLibrary, which holds both lists.
  ownedNames: Map<string, string[]>;
  // Called when the add also logged a playthrough, so the library's one copy of
  // the play history can re-read. Without it the new game's dates are missing
  // from the card and the stats panel until a reload.
  onSessionLogged: () => void;
  onClose: () => void;
};

// Owner-only "add a game" dialog: IGDB search → pick a result → confirm/edit
// its details → POST. A manual path (blank form) covers games IGDB doesn't
// know. Same mount-only lifecycle as the detail card: scroll lock and Escape
// bind on mount, focus returns to the opener on unmount.
//
// The two steps are separate components because they share no state and no
// handlers — the seam was already visible in the JSX as `draft === null`.
// Keeping them in one component meant seven search state slots stayed alive
// and re-rendered on every keystroke typed into the confirm form. Each now
// unmounts when the other is showing.
export function AddGameModal({
  target,
  existingSystems,
  ownedNames,
  onSessionLogged,
  onClose,
}: AddGameModalProps) {
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

  const { isPending, error, setError, run } = useServerAction();

  // Held here rather than in the confirm step, for the same reason `draft` is:
  // the step unmounts on "Back to search", and dates typed before going back
  // should still be there on the way forward. Created on both targets because
  // hooks cannot be conditional; only the library branch of `save` reads it.
  const play = usePlayDraft();

  // Handed to ModalShell as the initial focus target, so this dialog opens
  // ready to type instead of focused on its close button. Created here because
  // ModalShell is here, and forwarded into the search step.
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pickResult = (r: IgdbSearchResult, query: string) => {
    setError(null);
    setLastQuery(query);
    setDraft({
      name: r.name,
      // Only prefilled when IGDB knows of exactly one platform, where there is
      // nothing to guess. With two or more, picking the first is arbitrary and
      // wrong most of the time, and a wrong prefilled value is worse than an
      // empty one: it reads as confirmed and gets saved unread. Left blank
      // instead, with the platforms offered as suggestions on the field.
      system: r.platforms.length === 1 ? r.platforms[0] : "",
      platforms: r.platforms,
      // Still sent, but only as the fallback: the API re-sources genres from
      // Wikipedia when it creates the catalog row, and uses these if it misses.
      genresText: r.genres.join(", "),
      releaseDate: r.releaseDate || null,
      imageUrl: r.coverUrl,
      igdbId: r.igdbId,
      rating: "",
      starred: false,
    });
  };

  const startManual = (query: string) => {
    setError(null);
    setLastQuery(query);
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
    const genres = draftGenres(draft);
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
    const session = target === "library" ? play.session.value : undefined;
    const submit = (): Promise<MutateResult> => {
      if (target === "library") {
        const game: NewGame = { ...shared, rating: draft.rating };
        // Two writes behind one press: the game, then a playthrough against
        // the id its 201 returns. addGame owns that sequencing, including what
        // to say when the game lands and the dates do not.
        return addGame(game, session ? { session } : {});
      }
      const item: NewWishlistItem = {
        ...shared,
        starred: draft.starred,
        // Browser-local date — the API's default is UTC "today".
        dateAdded: localToday(),
      };
      return addWishlistItem(item);
    };
    run(submit, {
      onSuccess: () => {
        if (session) onSessionLogged();
        onClose();
      },
    });
  };

  const heading = target === "library" ? "Add a game" : "Add to wishlist";

  return (
    <ModalShell
      label={heading}
      title={heading}
      onClose={onClose}
      error={error}
      // A flex column with only the middle section scrolling: the heading, the
      // search box and the buttons under it stay put however many results come
      // back. The cap is a max, so a two-result search renders a short dialog.
      //
      // Both caps are a % of the shell's grid row, which is its content box:
      // the gutter and the device safe areas are already subtracted, so these
      // cannot drift out of sync with them the way the hand-copied
      // calc(100dvh - 1.5rem) they replaced did. Full height on a phone, where
      // the dialog splits a sub-400px band with the keyboard and every pixel
      // recovered is another visible result; 80% from `sm` up, where a
      // full-height dialog reads as a page instead.
      panelClassName="flex max-h-full sm:max-h-[80%] w-full max-w-md flex-col"
      // This dialog's two steps are flex columns that scroll their own results
      // list, so the shell must not wrap them in a scrolling body of its own.
      scrollBody={false}
      // The search box, not the close button: this dialog opens ready to type.
      initialFocusRef={searchInputRef}
    >
      {draft === null ? (
        <GameSearchStep
          initialQuery={lastQuery}
          inputRef={searchInputRef}
          ownedNames={ownedNames}
          ownedLabel={target === "library" ? "Already in your library" : "Already on your wishlist"}
          onPick={pickResult}
          onManual={startManual}
        />
      ) : (
        <GameDraftForm
          target={target}
          draft={draft}
          setDraft={setDraft}
          existingSystems={existingSystems}
          play={play}
          isPending={isPending}
          onBack={() => setDraft(null)}
          onSave={save}
        />
      )}
    </ModalShell>
  );
}
