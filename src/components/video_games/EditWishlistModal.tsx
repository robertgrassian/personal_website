"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { WishlistGame } from "@/lib/wishlist";
import {
  deleteWishlistItem,
  promoteWishlistItem,
  updateWishlistItem,
} from "@/app/video_games/actions";
import { CloseIcon } from "@/components/Icon";

const inputClass =
  "w-full bg-shelf-input border border-shelf-input-border text-shelf-input-text text-sm rounded " +
  "px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-shelf-input-ring";

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Notes buffer locally until Save — a textarea that fires a server write
  // per keystroke would be miserable. Starred toggles write immediately.
  const [notesDraft, setNotesDraft] = useState(item.notes);

  // promoteStep = the "I bought it" confirm (with system picker) is showing;
  // deleteStep = the remove confirm is showing.
  const [promoteStep, setPromoteStep] = useState(false);
  const [promoteSystem, setPromoteSystem] = useState(item.system);
  const [deleteStep, setDeleteStep] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();

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

  const patch = (fields: { starred?: boolean; notes?: string }) => {
    if (item.id === undefined) return;
    const itemId = item.id;
    startTransition(async () => {
      setError(null);
      const result = await updateWishlistItem(itemId, fields);
      if (!result.ok) setError(result.message);
    });
  };

  const promote = () => {
    if (item.id === undefined) return;
    const itemId = item.id;
    startTransition(async () => {
      setError(null);
      const result = await promoteWishlistItem(itemId, promoteSystem);
      // The item moved to the library — the wishlist row (and this dialog's
      // subject) is gone, so close.
      if (result.ok) onClose();
      else setError(result.message);
    });
  };

  const remove = () => {
    if (item.id === undefined) return;
    const itemId = item.id;
    startTransition(async () => {
      setError(null);
      const result = await deleteWishlistItem(itemId);
      if (result.ok) onClose();
      else setError(result.message);
    });
  };

  const notesDirty = notesDraft !== item.notes;

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
        aria-label={`Edit wishlist entry ${item.name}`}
        className="relative w-full max-w-sm rounded-lg border border-shelf-plank bg-shelf-bg p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-shelf-text font-semibold leading-snug">{item.name}</h2>
            <p className="text-shelf-text-muted text-xs mt-0.5">
              {item.system || "System undecided"}
              {item.dateAdded && ` · wishlisted ${item.dateAdded}`}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-shelf-text-muted hover:text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm text-shelf-text cursor-pointer">
          <input
            type="checkbox"
            checked={item.starred}
            disabled={isPending}
            onChange={(e) => patch({ starred: e.target.checked })}
            className="accent-amber-500"
          />
          Starred (priority wishlist)
        </label>

        <label className="mt-4 flex flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label">
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
            className="mt-2 rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            Save notes
          </button>
        )}

        <div className="mt-5 border-t border-shelf-plank pt-3">
          {!promoteStep ? (
            <button
              type="button"
              onClick={() => setPromoteStep(true)}
              disabled={isPending || item.id === undefined}
              className="rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              I bought it — move to library
            </button>
          ) : (
            <div>
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-shelf-label">
                System
                <input
                  type="text"
                  value={promoteSystem}
                  onChange={(e) => setPromoteSystem(e.target.value)}
                  list="promote-systems"
                  placeholder="e.g. SNES, PS5"
                  className={inputClass}
                />
              </label>
              <datalist id="promote-systems">
                {existingSystems.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="mt-1.5 text-[11px] text-shelf-text-muted">
                It lands on the Unrated shelf — rate it once you&rsquo;ve played.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={promote}
                  disabled={isPending || promoteSystem.trim() === ""}
                  className="rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  Move to library
                </button>
                <button
                  type="button"
                  onClick={() => setPromoteStep(false)}
                  disabled={isPending}
                  className="text-xs text-shelf-text-muted underline underline-offset-2 hover:text-shelf-text transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!deleteStep ? (
            <button
              type="button"
              onClick={() => setDeleteStep(true)}
              disabled={isPending}
              className="mt-3 block text-xs text-red-600 dark:text-red-400 underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50"
            >
              Remove from wishlist
            </button>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-shelf-text">
                Remove <span className="font-medium">{item.name}</span> from the wishlist?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={remove}
                  disabled={isPending}
                  className="rounded-md border border-red-600/50 dark:border-red-400/50 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-600/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteStep(false)}
                  disabled={isPending}
                  className="rounded-md border border-shelf-plank px-3 py-1.5 text-sm text-shelf-text hover:bg-shelf-input transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-500 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
