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
  // Status of the Wikipedia/Wikidata genre lookup, purely so the field can say
  // why it changed under the user a moment after picking.
  const [genreLookup, setGenreLookup] = useState<"idle" | "loading" | "done" | "none">("idle");
  // Bumped per lookup, and again when the field is hand-edited, so a slow
  // response knows it has been superseded. Same counter pattern the IGDB
  // search uses.
  const genreSeq = useRef(0);

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
  useEffect(() => {
    if (lookupGenresFor === null) {
      // Manual entry has no picked game to look up, so no status to report.
      setGenreLookup("idle");
      return;
    }
    const name = lookupGenresFor;
    const seq = ++genreSeq.current;
    setGenreLookup("loading");
    void (async () => {
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
    })();
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
            {genreLookup === "loading" && (
              <span className="ml-2 font-normal text-shelf-text-muted">checking Wikipedia...</span>
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
