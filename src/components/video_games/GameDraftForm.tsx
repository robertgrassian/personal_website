"use client";

import Image from "next/image";
import { localToday, type NewGame } from "@/lib/games";
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
  // Existing shelves first (the value you usually want), then the pick's own
  // IGDB platform names, deduped.
  const systemSuggestions = [...new Set([...existingSystems, ...draft.platforms])];

  // An IGDB id resolves to the SHARED game_metadata row for that id, so name,
  // genres and release date are either dropped silently (the row exists) or
  // written on everyone's behalf (it doesn't) — read-only either way. A
  // hand-entered game gets a private row, so it stays fully editable.
  const fromIgdb = draft.igdbId !== null;

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
          overscroll-contain keeps a flick from chaining to the page behind. */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
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
          {fromIgdb ? (
            // Boxed so the note below reads as covering all three fields.
            <div className="flex flex-col gap-3 rounded-md border border-shelf-plank p-3">
              <ReadOnlyField label="Name" value={draft.name} />
              <ReadOnlyField label="Genres" value={draft.genresText} />
              <ReadOnlyField label="Release date" value={formatReleaseDate(draft.releaseDate)} />
              <p className="text-xs text-shelf-text-muted">
                These come from IGDB and are shared by everyone who has this game, so they are the
                same in every library and cannot be edited here.
              </p>
            </div>
          ) : (
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

          {/* Manual path only; the IGDB path shows these read-only above. */}
          {!fromIgdb && (
            <>
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

// A catalog field rendered as a value. Text, not a disabled <input>: a greyed
// box reads as a control that is off, and invites hunting for the switch.
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={labelClass}>
      {label}
      <p className="text-base pointer-fine:text-sm normal-case tracking-normal text-shelf-text">
        {/* IGDB has no genres or release date for some entries. */}
        {value.trim() === "" ? "—" : value}
      </p>
    </div>
  );
}

// "2023-05-12" → "May 12, 2023". UTC-pinned like GameCaseBack's formatDate:
// the ISO string parses as midnight UTC, a day earlier in negative offsets.
function formatReleaseDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
