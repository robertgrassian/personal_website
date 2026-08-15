"use client";

import { useOptimistic, useState } from "react";
import type { WishlistGame } from "@/lib/wishlist";
import {
  deleteWishlistItem,
  promoteWishlistItem,
  updateWishlistItem,
} from "@/app/video-games/actions";
import { ModalShell } from "./ModalShell";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import {
  buttonClass,
  ghostButtonClass,
  inputClass,
  labelClass,
  saveButtonClass,
} from "./formStyles";
import { SuggestInput } from "./SuggestInput";
import { systemLabel } from "@/lib/games";

type EditWishlistModalProps = {
  item: WishlistGame;
  // Shelf-system suggestions for the promote step's system picker.
  existingSystems: string[];
  onClose: () => void;
};

// Owner-only wishlist edit dialog (the wishlist-view counterpart of
// EditGameModal): star toggle, notes, and the two exits — promote to the
// library ("I bought it") or remove. Same mount-only lifecycle: scroll lock
// and Escape bind on mount, focus returns to the opener on unmount.
export function EditWishlistModal({ item, existingSystems, onClose }: EditWishlistModalProps) {
  const { isPending, error, run } = useServerAction();

  // Optimistic star: the checkbox flips on click instead of after the
  // round-trip, converges on the prop once revalidation delivers fresh data,
  // and reverts itself if the write fails. Right here because one click is the
  // whole interaction; the notes field below buffers to a draft instead.
  const [optimisticStarred, setOptimisticStarred] = useOptimistic<boolean>(item.starred);

  // Notes buffer locally until Save — a textarea that fires a server write
  // per keystroke would be miserable. Starred toggles write immediately.
  const [notesDraft, setNotesDraft] = useState(item.notes);

  // promoteStep = the "I bought it" confirm (with system picker) is showing.
  // The remove confirm's own step state lives inside ConfirmStep.
  const [promoteStep, setPromoteStep] = useState(false);
  const [promoteSystem, setPromoteSystem] = useState(item.system);

  const patch = (fields: { starred?: boolean; notes?: string }) => {
    run(() => updateWishlistItem(item.id, fields));
  };

  const toggleStarred = (next: boolean) => {
    // The optimistic set goes in `optimistic`, which run() calls inside the
    // transition — that's what ties the optimistic value's lifetime to the
    // write, so a failure reverts it automatically.
    run(() => updateWishlistItem(item.id, { starred: next }), {
      optimistic: () => setOptimisticStarred(next),
    });
  };

  const promote = () => {
    // The item moved to the library — the wishlist row (and this dialog's
    // subject) is gone, so close.
    run(() => promoteWishlistItem(item.id, promoteSystem), { onSuccess: onClose });
  };

  const remove = () => {
    run(() => deleteWishlistItem(item.id), { onSuccess: onClose });
  };

  const notesDirty = notesDraft !== item.notes;

  return (
    <ModalShell
      label={`Edit wishlist entry ${item.name}`}
      title={item.name}
      subtitle={
        <>
          {item.system ? systemLabel(item.system) : "System undecided"}
          {item.dateAdded && ` · wishlisted ${item.dateAdded}`}
        </>
      }
      onClose={onClose}
      error={error}
    >
      <>
        <label className="mt-5 flex items-center gap-2 text-sm text-shelf-text cursor-pointer">
          <input
            type="checkbox"
            checked={optimisticStarred}
            onChange={(e) => toggleStarred(e.target.checked)}
            className="accent-amber-500"
          />
          Starred (priority wishlist)
        </label>

        <label className={`mt-4 ${labelClass}`}>
          Notes
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g. wait for a sale"
            className={`${inputClass} resize-y`}
          />
        </label>
        {notesDirty && (
          <button
            type="button"
            onClick={() => patch({ notes: notesDraft })}
            disabled={isPending}
            className={`mt-2 ${saveButtonClass}`}
          >
            Save notes
          </button>
        )}

        <div className="mt-5 border-t border-shelf-plank pt-3">
          {!promoteStep ? (
            <button
              type="button"
              onClick={() => setPromoteStep(true)}
              disabled={isPending}
              className={buttonClass}
            >
              I bought it, move to library
            </button>
          ) : (
            <div>
              <SuggestInput
                label="System"
                value={promoteSystem}
                onChange={setPromoteSystem}
                options={item.platforms.length > 0 ? item.platforms : existingSystems}
                placeholder="e.g. SNES, PS5"
              />
              <p className="mt-1.5 text-[11px] text-shelf-text-muted">
                It lands on the Unrated shelf. Rate it once you&rsquo;ve played.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={promote}
                  disabled={isPending || promoteSystem.trim() === ""}
                  className={buttonClass}
                >
                  Move to library
                </button>
                <button
                  type="button"
                  onClick={() => setPromoteStep(false)}
                  disabled={isPending}
                  className={ghostButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ConfirmStep
            triggerLabel="Remove from wishlist"
            triggerClassName="mt-3 block"
            confirmLabel="Remove"
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
    </ModalShell>
  );
}
