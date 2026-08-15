"use client";

import Image from "next/image";
import { localToday, type NewGame } from "@/lib/games";
import { buttonClass, ghostButtonClass, inputClass, labelClass } from "./formStyles";
import { SuggestInput } from "./SuggestInput";
import { RatingPicker } from "./RatingPicker";
import { CatalogInfo } from "./CatalogInfo";

// The confirm step's working copy: NewGame except genres, which stay a raw
// comma-separated string while typing (splitting on every keystroke would
// fight the user mid-word). `platforms` keeps the pick's IGDB platform list
// around as system suggestions; it is not part of the POST payload.
export type Draft = Omit<NewGame, "genres"> & {
  genresText: string;
  platforms: string[];
  starred: boolean;
};

type GameDraftFormProps = {
  target: "library" | "wishlist";
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  // The library's current shelf systems, offered as suggestions so new games
  // land on existing shelves ("SNES") instead of IGDB's names.
  existingSystems: string[];
  isPending: boolean;
  onBack: () => void;
  onSave: () => void;
};

// The confirm step of the add flow: settle the picked game's details and
// submit. Which details are editable depends on `fromIgdb` below. Split out of
// AddGameModal, which now owns only the shell and the draft. Nothing here is
// shared with the search step — that was the seam.
export function GameDraftForm({
  target,
  draft,
  setDraft,
  existingSystems,
  isPending,
  onBack,
  onSave,
}: GameDraftFormProps) {
  // An IGDB id resolves to the SHARED game_metadata row for that id: its name
  // and release date are the catalog's, and the API sources its genres from
  // Wikipedia. None of the three is this form's to set, so none of them is a
  // field — the picked game's identity shows as a header instead. A
  // hand-entered game gets a private row and keeps the full form.
  const fromIgdb = draft.igdbId !== null;

  // A picked game suggests the platforms it released on; the old union with
  // every shelf offered "PS5" for a SNES-only game. Falls back to the shelves
  // when there is no pick, or a pick IGDB has no platforms for.
  //
  // These are the STORED names (IGDB's own, per migration d1a83f6c25e7), not
  // systemLabel() output: what the suggestion writes is what gets POSTed, and a
  // display label would create a second shelf beside the real one.
  const systemSuggestions =
    fromIgdb && draft.platforms.length > 0 ? draft.platforms : existingSystems;

  // The draft in the shape the API takes. Rebuilt every render, which is why
  // CatalogInfo's effect keys on the game's identity rather than this object.
  const postedShape: NewGame = {
    name: draft.name,
    system: draft.system,
    genres: draftGenres(draft),
    releaseDate: draft.releaseDate,
    imageUrl: draft.imageUrl,
    igdbId: draft.igdbId,
    rating: draft.rating,
  };

  // Wishlist entries may leave the system undecided; library games can't.
  const saveDisabled =
    isPending || !draft.name.trim() || (target === "library" && !draft.system.trim());

  return (
    // Fragment, not one element: the scrolling body and the pinned buttons have
    // to be flex siblings of the dialog for only the body to scroll.
    <>
      {/* overflow-x-hidden is not redundant: per CSS, one axis set to anything
          but `visible` computes the other to `auto`, so `overflow-y-auto` alone
          made this scrollable sideways whenever a child was a pixel too wide.
          overscroll-contain keeps a flick from chaining to the page behind.

          -mx-1 px-1 is what keeps the focus ring visible. A Tailwind ring is a
          box-shadow drawn OUTSIDE the border box, and the fields are w-full, so
          against a bare clip edge the left and right sides of the ring were cut
          off while the top and bottom survived on the scrolling axis. Widening
          this box by 4px a side and padding the content back in restores the
          fields to their old width with clip-free room around them. The panel's
          p-5 absorbs the negative margin. The alternative, focus:ring-inset in
          formStyles, would have changed the ring everywhere it is used,
          including the filter bar, which is not clipped and has no bug. */}
      <div className="mt-4 -mx-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1">
        {/* Which game you picked, not a field: without it the form is a system
            box with no subject. `relative` is load-bearing — CatalogInfo
            anchors its panel to this row. Manual entries skip it because their
            name IS a field, directly below. */}
        {fromIgdb ? (
          <div className="relative mb-3 flex items-center gap-3">
            {draft.imageUrl && (
              <Image
                src={draft.imageUrl}
                alt={`Cover of ${draft.name}`}
                width={60}
                height={80}
                className="h-20 w-[60px] shrink-0 rounded object-cover"
              />
            )}
            {/* A div, not a p: CatalogInfo renders its panel as a sibling of
                the icon, and a <div> inside a <p> is invalid nesting that
                React warns about. */}
            <div className="min-w-0 font-medium text-shelf-text">
              {draft.name}
              <CatalogInfo game={postedShape} />
            </div>
          </div>
        ) : (
          draft.imageUrl && (
            <Image
              src={draft.imageUrl}
              alt={`Cover of ${draft.name}`}
              width={80}
              height={107}
              className="mb-3 h-[107px] w-20 rounded object-cover"
            />
          )
        )}

        <div className="flex flex-col gap-3">
          {!fromIgdb && (
            <label className={labelClass}>
              Name
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputClass}
              />
            </label>
          )}

          {/* No wrapping <label> here: SuggestInput renders its own, because a
              listbox inside a label breaks the input's accessible name. */}
          <SuggestInput
            label={target === "library" ? "System" : "System (optional)"}
            value={draft.system}
            onChange={(system) => setDraft({ ...draft, system })}
            options={systemSuggestions}
          />

          {/* Manual path only. Leave genres blank and the API tries Wikipedia
              on the typed name; whatever is typed here wins over that. */}
          {!fromIgdb && (
            <>
              <label className={labelClass}>
                Genres (comma-separated, optional)
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
            </>
          )}

          {target === "library" ? (
            <div>
              <p className={labelClass}>Rating (optional)</p>
              <div className="mt-1">
                <RatingPicker
                  value={draft.rating}
                  onPick={(rating) => setDraft({ ...draft, rating })}
                />
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
        <button type="button" onClick={onSave} disabled={saveDisabled} className={buttonClass}>
          {target === "library" ? "Add to library" : "Add to wishlist"}
        </button>
        <button type="button" onClick={onBack} disabled={isPending} className={ghostButtonClass}>
          Back to search
        </button>
      </div>
    </>
  );
}

// genresText as the API takes it. Exported because AddGameModal builds its POST
// body from the same conversion, and two copies of the split would drift.
export function draftGenres(draft: Draft): string[] {
  return draft.genresText
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}
