"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { localToday, type NewGame } from "@/lib/games";
import { lookupGameGenres } from "@/app/video-games/actions";
import { buttonClass, ghostButtonClass, inputClass, labelClass } from "./formStyles";
import { RatingPicker } from "./RatingPicker";

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
  // The picked game's name, or null when the user came here via "add it
  // manually" and there is nothing to look up. Read once, on mount: this
  // component is mounted fresh per draft, so the lookup fires exactly once
  // per picked game.
  lookupGenresFor: string | null;
  isPending: boolean;
  onBack: () => void;
  onSave: () => void;
};

// The confirm step of the add flow: edit the picked game's details and submit.
// Split out of AddGameModal, which now owns only the shell and the draft.
// Nothing here is shared with the search step — that was the seam.
export function GameDraftForm({
  target,
  draft,
  setDraft,
  existingSystems,
  lookupGenresFor,
  isPending,
  onBack,
  onSave,
}: GameDraftFormProps) {
  // Whether the genre lookup is still in flight. The field renders a
  // placeholder rather than a value while this is true, so the genres the user
  // sees are the ones that were actually settled on.
  //
  // Initialized from `lookupGenresFor` rather than to false: effects run after
  // paint, so starting false would paint one frame of IGDB's genres before the
  // effect below could flip it, which is the flash this state exists to
  // prevent. Sound because the component is mounted fresh per draft, so the
  // prop cannot change from null under a live instance.
  const [genresLoading, setGenresLoading] = useState(lookupGenresFor !== null);
  // Bumped per lookup so a slow response knows it has been superseded. Same
  // counter pattern the IGDB search uses.
  const genreSeq = useRef(0);

  /** Replace the picked game's genres with the Wikipedia/Wikidata ones.
   *
   *  IGDB identifies the game well but describes it poorly: its genre field has
   *  no roguelike on Hades II and no metroidvania on Animal Well. This is the
   *  same lookup the genre backfill script uses, so games added here and games
   *  already on the shelves end up speaking one vocabulary.
   *
   *  Deliberately best-effort: a miss or an outage leaves IGDB's genres in
   *  place rather than blocking the add, and the field becomes editable either
   *  way once it settles. Which source won is not something the user is told --
   *  both answers are just "the genres".
   *
   *  It must not strand the field on its loading placeholder when the call
   *  throws: the Server Action can reject on the 15s timeout, which left it
   *  spinning forever. Every path out of the request therefore clears
   *  `genresLoading`, except the superseded one, where whoever superseded it
   *  owns the flag.
   *
   *  The cleanup is load-bearing, and is the one thing this owes to having
   *  moved out of AddGameModal. `genreSeq` used to live for the whole modal's
   *  life, so every path bumped one shared counter; it now resets with this
   *  component, which unmounts on "Back to search". Without the bump, a lookup
   *  still in flight from a previous mount holds a counter nobody will ever
   *  advance, so its staleness check passes unconditionally and it writes into
   *  a draft it knows nothing about. `setDraft` belongs to AddGameModal and
   *  outlives us, so the write really does land. Picking the SAME game again is
   *  the case that needs it: the `current.name !== name` guard below passes,
   *  because the names do match, leaving the counter as the only thing that can
   *  tell the abandoned response from the live one. */
  useEffect(() => {
    if (lookupGenresFor === null) {
      // Manual entry has no picked game to look up, so nothing to wait for.
      setGenresLoading(false);
      return;
    }
    const name = lookupGenresFor;
    const seq = ++genreSeq.current;
    setGenresLoading(true);
    void (async () => {
      try {
        const res = await lookupGameGenres(name);
        // A newer pick, or an unmount, has superseded this response.
        if (seq !== genreSeq.current) return;
        if (res.ok && res.genres.length > 0) {
          setDraft((current) =>
            current === null || current.name !== name
              ? current
              : { ...current, genresText: res.genres.join(", ") }
          );
        }
        // Cleared after the write is queued, not before: both land in the same
        // React batch, so the field goes from placeholder straight to the final
        // list without a frame of IGDB's in between.
        setGenresLoading(false);
      } catch {
        setGenresLoading(false);
      }
    })();
    return () => {
      genreSeq.current += 1;
    };
  }, [lookupGenresFor, setDraft]);

  // Existing shelves first (the value you usually want), then the pick's own
  // IGDB platform names, deduped.
  const systemSuggestions = [...new Set([...existingSystems, ...draft.platforms])];

  // Wishlist entries may leave the system undecided; library games can't.
  const saveDisabled =
    isPending || !draft.name.trim() || (target === "library" && !draft.system.trim());

  return (
    // Fragment, not one element: the scrolling body and the pinned buttons have
    // to be flex siblings of the dialog for only the body to scroll.
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
            <input
              type="text"
              // While the lookup is in flight the field shows its placeholder
              // instead of the draft's genres. The draft still carries IGDB's
              // list the whole time -- it is the fallback, and saving mid-lookup
              // submits it -- but showing it first meant the user watched the
              // genres rewrite themselves a second later, which reads as a bug
              // even when both lists are right.
              value={genresLoading ? "" : draft.genresText}
              // Not merely cosmetic: an uneditable field during the lookup is
              // what lets the response be applied unconditionally. The previous
              // version had to track whether the user had typed since the
              // request went out, because it could land on top of them.
              disabled={genresLoading}
              onChange={(e) => setDraft({ ...draft, genresText: e.target.value })}
              placeholder={genresLoading ? "finding genres..." : "e.g. RPG, Adventure"}
              // No dimming: the box is already empty while it loads, and fading
              // an empty box reads as broken rather than as busy. The cursor is
              // the whole disabled treatment.
              className={`${inputClass} disabled:cursor-default`}
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
