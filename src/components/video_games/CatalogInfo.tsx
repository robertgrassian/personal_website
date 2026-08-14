"use client";

import { useEffect, useState } from "react";
import { InfoIcon } from "@/components/Icon";
import type { CatalogPreview, NewGame } from "@/lib/games";
import type { NewWishlistItem } from "@/lib/wishlist";
import { previewGameCatalog } from "@/app/video-games/actions";

type CatalogInfoProps = {
  // The draft as it would be posted. Passed whole because the API wants the
  // same fallbacks an add would use, not just the name.
  game: NewGame | NewWishlistItem;
};

// The add form's "what is this game, actually?" affordance: an info icon next
// to the picked game's title that reveals the catalog fields the form no
// longer offers (genres, release date).
//
// The fetch is fired on mount and never awaited by anything, which is the
// whole design. A browser-side genre lookup used to gate the Save button and
// was removed for it; here nothing waits, so a slow or failed lookup costs a
// line of text in a popover instead of an unusable form.
//
// Positioning note: the panel is `absolute ... w-full`, so the CALLER must be
// the positioned ancestor. It is anchored to the whole header row rather than
// to the icon so it can never overflow the dialog's `overflow-x-hidden` body.
export function CatalogInfo({ game }: CatalogInfoProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The standard React cleanup for an async effect: a result that arrives
    // after this component has moved on (Back to search, then a different
    // pick) must not be written to state. Without it the popover can show the
    // previous game's genres.
    let ignore = false;
    // Clear first: on a dep change the previous game's answer would otherwise
    // stay on screen until the new one lands, and a previous error would win
    // over it forever (the render branches on error before preview).
    setPreview(null);
    setError(null);
    previewGameCatalog(game)
      .then((result) => {
        if (ignore) return;
        if (result.ok) setPreview(result.preview);
        else setError(result.message);
      })
      // previewGameCatalog turns transport failures into {ok: false}, so the
      // only way here is the Server Action RPC itself failing (offline, a 500,
      // deployment skew). Without this the panel says "Loading" forever.
      .catch(() => {
        if (!ignore) setError("Could not load this game's details.");
      });
    return () => {
      ignore = true;
    };
    // Deliberately keyed on the game's identity rather than the object: the
    // parent rebuilds `game` on every keystroke in the System field, and a
    // dependency on the object itself would re-fetch on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.igdbId, game.name]);

  return (
    <>
      <button
        type="button"
        // Hover for a mouse, tap for a finger. Branching on pointerType rather
        // than a breakpoint: a touchscreen laptop is wide AND has no hover, and
        // an icon that only opens on hover is unusable there.
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        // :focus-visible, not plain focus. A tap on Chrome for Android fires
        // focus THEN click, so opening on any focus meant the tap opened the
        // panel and the click immediately toggled it shut — the affordance
        // flashed and vanished, on touch only. focus-visible is false for the
        // focus that follows a pointer press and true for keyboard tabbing,
        // which is exactly the distinction wanted.
        onFocus={(e) => e.target.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-controls="catalog-info-panel"
        aria-label="Game details"
        className="ml-1.5 inline-flex shrink-0 cursor-pointer align-middle text-shelf-text-muted hover:text-shelf-text transition-colors"
      >
        <InfoIcon className="h-4 w-4" aria-hidden={true} />
      </button>

      {open && (
        <div
          id="catalog-info-panel"
          // role="status" rather than "tooltip": the content arrives
          // asynchronously, so a screen reader should hear it when it lands
          // rather than only on hover.
          role="status"
          // bg-shelf-bg, matching ModalShell's own panel. NOT bg-shelf-input:
          // that token is a translucent fill (4% white in dark mode) meant to
          // sit on an opaque surface, so the System field underneath showed
          // straight through this text.
          className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border border-shelf-plank bg-shelf-bg p-3 text-xs text-shelf-text shadow-lg"
        >
          {error !== null ? (
            <p className="text-shelf-text-muted">{error}</p>
          ) : preview === null ? (
            <p className="text-shelf-text-muted">Loading game data...</p>
          ) : (
            <dl className="flex flex-col gap-2">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-shelf-label">Genres</dt>
                <dd>{preview.genres.length > 0 ? preview.genres.join(", ") : "None found"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-shelf-label">
                  Release date
                </dt>
                <dd>{formatReleaseDate(preview.releaseDate)}</dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </>
  );
}

// "2023-05-12" → "May 12, 2023". UTC-pinned like GameCaseBack's formatDate:
// the ISO string parses as midnight UTC, a day earlier in negative offsets.
function formatReleaseDate(iso: string | null): string {
  if (!iso) return "Not known";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
