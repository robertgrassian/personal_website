"use client";

import { useOptimistic, useState } from "react";
import type { WishlistGame } from "@/lib/wishlist";
import { deleteWishlistItem, updateWishlistItem } from "@/app/video-games/actions";
import { ModalShell } from "./ModalShell";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { inputClass, labelClass, saveButtonClass } from "./formStyles";
import { systemLabel } from "@/lib/games";

type EditWishlistModalProps = {
  item: WishlistGame;
  // "Played?" — hand off to the library edit dialog, which owns rating, system
  // and sessions. GameLibrary decides what that dialog edits: the row you
  // already own, or a promote that creates one. This dialog does not need to
  // know which, and deliberately does not ask: a wishlist entry for a game you
  // already own is legitimate (you want to replay it), so both answers are
  // ordinary.
  onPlayed: () => void;
  onClose: () => void;
};

// Owner-only wishlist edit dialog (the wishlist-view counterpart of
// EditGameModal): star toggle, notes, and the two exits — promote to the
// library or remove. Same mount-only lifecycle: scroll lock and Escape bind
// on mount, focus returns to the opener on unmount.
export function EditWishlistModal({ item, onPlayed, onClose }: EditWishlistModalProps) {
  const { isPending, error, run } = useServerAction();

  // Optimistic star: the checkbox flips on click instead of after the
  // round-trip, converges on the prop once revalidation delivers fresh data,
  // and reverts itself if the write fails. Right here because one click is the
  // whole interaction; the notes field below buffers to a draft instead.
  const [optimisticStarred, setOptimisticStarred] = useOptimistic<boolean>(item.starred);

  // Notes buffer locally until Save — a textarea that fires a server write
  // per keystroke would be miserable. Starred toggles write immediately.
  const [notesDraft, setNotesDraft] = useState(item.notes);

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
          {/* One button for both cases. "Played?" is the question the wishlist
              can answer; everything that follows from it (which console, how
              was it, when did you play) belongs to the library dialog, which
              already asks all three. */}
          {/* Filled, not outlined: this is the dialog's primary action, and the
              one thing a wishlist entry exists to stop being. */}
          <button
            type="button"
            onClick={onPlayed}
            disabled={isPending}
            className={`mb-3 ${saveButtonClass}`}
          >
            Played?
          </button>

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
