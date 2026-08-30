"use client";

import { useState } from "react";
import type { WishlistGame } from "@/lib/wishlist";
import { deleteWishlistItem, updateWishlistItem } from "@/app/video-games/actions";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { SuggestInput } from "./SuggestInput";
import { inputClass, labelClass, buttonClass, saveButtonClass } from "./formStyles";

type WishlistEditFieldsProps = {
  item: WishlistGame;
  // Every system already on a shelf, for the suggestions below.
  existingSystems: string[];
  // "Played?" — hand off to the library edit form, which owns rating, system
  // and sessions. The caller decides what that form edits: the row you already
  // own, or a promote that creates one. This form does not need to know which,
  // and deliberately does not ask: a wishlist entry for a game you already own
  // is legitimate (you want to replay it), so both answers are ordinary.
  onPlayed: () => void;
  onClose: () => void;
};

// The owner's edit form for a wishlist entry. Same commit model as
// GameEditFields: every field is a draft and one Save writes them together.
// Starred used to write on click behind useOptimistic and notes had their own
// "Save notes" button, which put two commit models on what is now one surface.
export function WishlistEditFields({
  item,
  existingSystems,
  onPlayed,
  onClose,
}: WishlistEditFieldsProps) {
  const { isPending, error, run } = useServerAction();

  const [starredDraft, setStarredDraft] = useState(item.starred);
  const [notesDraft, setNotesDraft] = useState(item.notes);
  const [systemDraft, setSystemDraft] = useState(item.system);

  const starredDirty = starredDraft !== item.starred;
  const notesDirty = notesDraft !== item.notes;
  // Unlike a library game, a wishlist entry may legitimately have no system:
  // "undecided" is a real answer here, so an empty value is a change like any
  // other rather than a missing required field.
  const systemDirty = systemDraft.trim() !== item.system;
  const canSave = (starredDirty || notesDirty || systemDirty) && !isPending;

  const save = () => {
    run(() =>
      updateWishlistItem(item.id, {
        ...(starredDirty ? { starred: starredDraft } : {}),
        ...(notesDirty ? { notes: notesDraft } : {}),
        ...(systemDirty ? { system: systemDraft.trim() } : {}),
      })
    );
  };

  const remove = () => {
    run(() => deleteWishlistItem(item.id), { onSuccess: onClose });
  };

  // Same rule as the library form: the game's own platforms when we know them,
  // every shelf system otherwise.
  const systemSuggestions = item.platforms.length > 0 ? item.platforms : existingSystems;

  return (
    <>
      <label className="mt-5 flex items-center gap-2 text-sm text-shelf-text cursor-pointer">
        <input
          type="checkbox"
          checked={starredDraft}
          onChange={(e) => setStarredDraft(e.target.checked)}
          disabled={isPending}
          className="accent-amber-500"
        />
        Starred (priority wishlist)
      </label>

      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-shelf-label">
        System
      </p>
      {/* labelHidden: the heading above is the visible label, but the field
          still needs a programmatic one. */}
      <div className="mt-2">
        <SuggestInput
          label="Console you plan to play this on"
          labelHidden
          value={systemDraft}
          onChange={setSystemDraft}
          options={systemSuggestions}
          maxLength={100}
          placeholder="e.g. SNES, PS5"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-shelf-text-muted">
        Optional. Leave it blank if you have not decided yet.
      </p>

      <label className={`mt-5 ${labelClass}`}>
        Notes
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="e.g. wait for a sale"
          disabled={isPending}
          className={`${inputClass} resize-y`}
        />
      </label>

      {/* Always present, so there is one place to look for "did this save?".
          Disabled until something is actually pending. */}
      <div className="mt-6 border-t border-shelf-plank pt-4">
        <button type="button" onClick={save} disabled={!canSave} className={saveButtonClass}>
          Save
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-shelf-danger">
            {error}
          </p>
        )}
      </div>

      {/* relative: the remove confirm anchors to this box, out of flow, so the
          card does not grow when it opens. Same reasoning as GameEditFields. */}
      <div className="relative mt-4 border-t border-shelf-plank pt-3">
        {/* One button for both cases. "Played?" is the question the wishlist
            can answer; everything that follows from it (which console, how
            was it, when did you play) belongs to the library form, which
            already asks all three. */}
        {/* Outlined, not filled: the Save above is the filled one, and the
            repo's rule is that filled means "commit a pending draft". */}
        <button type="button" onClick={onPlayed} disabled={isPending} className={buttonClass}>
          Played?
        </button>

        <ConfirmStep
          triggerLabel="Remove from wishlist"
          triggerClassName="mt-3 block"
          confirmLabel="Remove"
          layout="overlay"
          onConfirm={remove}
          disabled={isPending}
          prompt={
            <>
              Remove <span className="font-medium">{item.name}</span> from the wishlist?
            </>
          }
        />
      </div>
    </>
  );
}
