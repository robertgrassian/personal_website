"use client";

import { useEffect, useState } from "react";
import type { WishlistGame } from "@/lib/wishlist";
import {
  deleteWishlistItem,
  getWishlistNotes,
  updateWishlistItem,
} from "@/app/video-games/actions";
import { ConfirmStep } from "./ConfirmStep";
import { useServerAction } from "./useServerAction";
import { SuggestInput } from "./SuggestInput";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass } from "./formStyles";

type WishlistEditFieldsProps = {
  item: WishlistGame;
  // Every system already on a shelf, for the suggestions below.
  existingSystems: string[];
  // "Played?" — hand off to the library edit form, which owns rating, system
  // and sessions. The caller decides what that form edits: the row you already
  // own, or a promote that creates one. This form does not need to know which,
  // because both answers now end the same way — the entry leaves the wishlist
  // on Save either way. It used to matter: the owned branch kept the entry, on
  // the reasoning that wanting to replay a game you own is legitimate. Having
  // one button do opposite things to the wishlist is what retired that.
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

  // Mirrors ConfirmStep's own step, because the sheet covers the form without
  // being able to retire it: this drives the inert region below and the one
  // control that sits outside it.
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const [starredDraft, setStarredDraft] = useState(item.starred);
  const [systemDraft, setSystemDraft] = useState(item.system);

  // Notes are the one field not on `item`: they are private to the owner, so
  // the public read this card is drawn from does not carry them (see
  // WishlistGame in lib/wishlist.ts) and they are fetched per entry here.
  //
  // null means "not read yet", which is deliberately NOT the same as "". An
  // empty note is something a Save may legitimately write; an unread one is
  // not, and collapsing the two is how a Save would blank a note nobody had
  // seen. Everything below therefore waits for a non-null value.
  const [savedNotes, setSavedNotes] = useState<string | null>(null);
  const [notesFailed, setNotesFailed] = useState(false);

  // null while the owner has not touched the field, so the loaded value shows
  // through when it lands. Seeding this from a prop instead would freeze it at
  // whatever was there on mount, which for notes is nothing at all.
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  useEffect(() => {
    // Guards a card reopened on a different entry before this answers: without
    // it, the first entry's notes would land in the second one's field, and a
    // Save would write them there.
    let cancelled = false;
    setSavedNotes(null);
    setNotesFailed(false);
    setNotesDraft(null);
    void getWishlistNotes(item.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setSavedNotes(result.notes);
      else setNotesFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const notesValue = notesDraft ?? savedNotes ?? "";

  const starredDirty = starredDraft !== item.starred;
  const notesDirty = savedNotes !== null && notesDraft !== null && notesDraft !== savedNotes;
  // Unlike a library game, a wishlist entry may legitimately have no system:
  // "undecided" is a real answer here, so an empty value is a change like any
  // other rather than a missing required field.
  const systemDirty = systemDraft.trim() !== item.system;
  const canSave = (starredDirty || notesDirty || systemDirty) && !isPending;

  const save = () => {
    run(() =>
      updateWishlistItem(item.id, {
        ...(starredDirty ? { starred: starredDraft } : {}),
        ...(notesDirty ? { notes: notesValue } : {}),
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
      {/* inert while the remove confirm is up. See GameEditFields: the sheet
          covers this region but cannot make it unreachable by Tab, and one
          attribute on the region covers a field added later. "Played?" below is
          the exception, being the sheet's own sibling. */}
      <div inert={confirmingRemove}>
        <label className="mt-5 flex items-center gap-2 text-sm text-shelf-text cursor-pointer">
          <input
            type="checkbox"
            checked={starredDraft}
            onChange={(e) => setStarredDraft(e.target.checked)}
            disabled={isPending}
            className="accent-link"
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
            value={notesValue}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={savedNotes === null ? "" : "e.g. wait for a sale"}
            // Disabled until the real value is in hand, so nothing typed into
            // an empty-looking box can be saved over a note still in flight.
            disabled={isPending || savedNotes === null}
            className={`${inputClass} resize-y`}
          />
        </label>
        {savedNotes === null && (
          <p
            className="mt-1.5 text-[11px] text-shelf-text-muted"
            // The failure is worth announcing; the ordinary wait is not.
            role={notesFailed ? "alert" : undefined}
          >
            {notesFailed
              ? "Could not load your notes, so they cannot be edited right now."
              : "Loading your notes..."}
          </p>
        )}

        {/* Always present, so there is one place to look for "did this save?".
          Disabled until something is actually pending. */}
        <div className="mt-6 border-t border-shelf-border pt-4">
          <Button variant="primary" onClick={save} disabled={!canSave}>
            Save
          </Button>
          {/* Not while the remove confirm is up: it renders the same error
            itself, and the sheet covers this line anyway. */}
          {error && !confirmingRemove && (
            <p role="alert" className="mt-2 text-xs text-shelf-danger">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-shelf-border pt-3">
        {/* One button for both cases. "Played?" is the question the wishlist
            can answer; everything that follows from it (which console, how
            was it, when did you play) belongs to the library form, which
            already asks all three. */}
        {/* Outlined, not filled: this surface's one fill belongs to the Save
            above. */}
        <Button onClick={onPlayed} disabled={isPending || confirmingRemove}>
          Played?
        </Button>

        <ConfirmStep
          triggerLabel="Remove"
          triggerClassName="mt-3 block"
          confirmLabel="Remove"
          layout="sheet"
          onConfirmingChange={setConfirmingRemove}
          onConfirm={remove}
          disabled={isPending}
          // The sheet covers the error line in the Save block above, so a
          // failed remove has to report itself inside the sheet instead.
          error={confirmingRemove ? error : null}
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
