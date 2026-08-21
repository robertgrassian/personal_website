"use client";

import { useId, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { RATINGS, systemLabel, type Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { CloseIcon } from "@/components/Icon";
import { ModalFrame } from "./ModalFrame";
import { GameCaseBackSurface } from "./GameCaseBackSurface";
import { GameCaseSpine } from "./GameCaseSpine";
import { useCardFlight } from "./useCardFlight";
import type { CardOrigin } from "./LibraryCardContext";
import { GameEditFields } from "./GameEditFields";
import { WishlistEditFields } from "./WishlistEditFields";

/** Which of the three things the card is showing. A viewer's card is NOT a
 *  fourth kind: it is `game` with the edit region simply not rendered, so
 *  permission stays the one boolean GameLibrary already derives instead of
 *  becoming a second source of truth that can disagree with it. */
export type CardSubject =
  | { kind: "game"; game: Game }
  | { kind: "wishlist"; item: WishlistGame }
  | { kind: "promote"; item: WishlistGame };

type GameDetailCardProps = {
  subject: CardSubject;
  // Whether to render the edit region at all. A promote is owner-only by
  // construction, so the caller only ever passes that subject when true.
  canEdit: boolean;
  existingSystems: string[];
  startWithSession?: boolean;
  // "Played?" on a wishlist card. Handled by the caller, which is where both
  // collections are in hand.
  onPlayed: () => void;
  // Extracted from the cover art by the case that was clicked. null falls back
  // to the console color.
  dominantColor: string | null;
  // Whether that color is dark, which the spine text contrasts against.
  isDark: boolean;
  // Where the case was when it was clicked. null means nothing to fly from.
  origin: CardOrigin | null;
  // The source case, hidden while the card is out and re-measured on the way
  // back. null for a promote, which has no case.
  caseId: string | null;
  onClose: () => void;
};

// "2023-05-12" → "May 2023"
function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso + "T00:00:00Z"); // Z = UTC, avoids local-timezone shift
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// The back of the game case, at reading size: what used to be a 96px text
// column is now the whole detail surface, and the owner's edit form sits on it
// under a divider. This replaces both edit dialogs.
//
// The blurred cover carries the whole card, form controls included. Text is
// fixed light rather than token-driven because the overlay under it is dark in
// both color schemes, and the shelf tokens the controls are built from are
// re-pointed to match, in .game-card-surface.
//
// v2, per docs/todo/view-and-edit-sessions.md: the played-sessions list belongs
// under the divider. It needs a sessions GET that the API does not have yet.
export function GameDetailCard({
  subject,
  canEdit,
  existingSystems,
  startWithSession = false,
  onPlayed,
  dominantColor,
  isDark,
  origin,
  caseId,
  onClose,
}: GameDetailCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // `close` runs the return flight and calls onClose when it lands, so every
  // way out of the card — the X, Escape, the backdrop, a delete — flies back
  // rather than vanishing.
  const { flightRef, innerRef, phase, close } = useCardFlight({
    origin,
    caseId,
    onClosed: onClose,
  });

  const source = subject.kind === "game" ? subject.game : subject.item;
  const ratingEntry =
    subject.kind === "game" && subject.game.rating
      ? RATINGS.find((r) => r.name === subject.game.rating)
      : undefined;
  const starred = subject.kind !== "game" && subject.item.starred;

  // A promote is already gated on ownership by the caller; the other two ask.
  const editable = subject.kind === "promote" || canEdit;

  return (
    <ModalFrame onClose={close} initialFocusRef={closeButtonRef}>
      {/* The grid item, and the element the flight translates and scales. min-w-0
          because a grid item's automatic minimum size is min-content, which
          would otherwise let a long unbroken genre push the card off screen. */}
      <div
        ref={flightRef}
        data-phase={phase}
        className="game-card-flight game-card-scene pointer-events-auto min-w-0 max-h-full w-full max-w-sm"
      >
        {/* The element that rotates. Separate from the one that travels, so
            neither transform has to be composed into the other. */}
        {/* --system-fallback lives here, on the shared ancestor of both faces
            and the spines, so the whole case is one color. data-system only
            when there is no extracted color: the [data-system] rule
            out-specifies the inherited variable and would beat it. */}
        <div
          ref={innerRef}
          data-phase={phase}
          data-system={dominantColor ? undefined : source.system}
          className="game-card-inner flex min-h-0 w-full"
          style={
            dominantColor ? ({ "--system-fallback": dominantColor } as CSSProperties) : undefined
          }
        >
          {/* The case as it looked on the shelf, shown only while it turns.
              sizes="96px" on purpose: this is the image the shelf already
              loaded, and the front face is never seen much above that size
              before it rotates away. A 384px source would be a fresh fetch and
              a blank face for the length of the flight. */}
          {phase === "flight" && (
            <div className="game-card-faces" aria-hidden>
              <div
                className="game-case-front absolute inset-0 overflow-hidden rounded-lg shadow-2xl"
                style={
                  source.imageUrl === ""
                    ? { backgroundColor: "var(--system-fallback, #374151)" }
                    : undefined
                }
              >
                {source.imageUrl !== "" && (
                  <Image src={source.imageUrl} alt="" fill className="object-cover" sizes="96px" />
                )}
              </div>
              <GameCaseSpine
                name={source.name}
                system={dominantColor ? undefined : source.system}
                side="left"
                darkBackground={isDark}
              />
              <GameCaseSpine
                name={source.name}
                system={dominantColor ? undefined : source.system}
                side="right"
                darkBackground={isDark}
              />
            </div>
          )}

          {/* 96px, the size the shelf case already loaded, not the card's own
              384px. This image is blurred, so the resolution buys nothing, and
              asking for a second size means a second download that lands after
              the card has opened -- the cover visibly resolving once you are
              already looking at it. */}
          <GameCaseBackSurface
            imageUrl={source.imageUrl}
            sizes="96px"
            className="game-case-back game-card-surface flex min-h-0 w-full flex-col rounded-lg shadow-2xl"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative z-10 flex min-h-0 flex-1 flex-col"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
                <h2 id={titleId} className="min-w-0 text-lg font-bold leading-tight text-white">
                  {source.name}
                </h2>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="shrink-0 rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <CloseIcon className="w-5 h-5" aria-hidden />
                </button>
              </div>

              {/* The card's one scrolling part. overscroll-contain keeps a flick
                at the end of the form off the library behind it. */}
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                <div className="px-5 pb-5 pt-3">
                  <p className="text-sm font-medium text-gray-100">{systemLabel(source.system)}</p>
                  <p className="mt-0.5 text-xs text-gray-300">
                    Released {formatDate(source.releaseDate)}
                  </p>
                  {ratingEntry && (
                    <p className="mt-2 text-sm font-semibold text-gray-100">★ {ratingEntry.name}</p>
                  )}
                  {starred && (
                    <p className="mt-2 text-sm font-semibold text-amber-300">★ Starred</p>
                  )}
                  {/* Every genre, wrapped. The 96px face could show two and
                    counted the rest in text you could not open, which is the
                    whole reason this surface exists. */}
                  {source.genres.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {source.genres.map((genre) => (
                        <li
                          key={genre}
                          className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] text-gray-100"
                        >
                          {genre}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {editable && (
                  // Same surface as the block above, just a little deeper so the
                  // fields hold their contrast against a bright cover. The shelf
                  // tokens are re-pointed for this scrim in video-games.css, so
                  // the controls need no changes of their own.
                  <div className="border-t border-white/15 bg-black/20 px-5 pb-5 pt-1">
                    {subject.kind === "wishlist" ? (
                      <WishlistEditFields
                        item={subject.item}
                        existingSystems={existingSystems}
                        onPlayed={onPlayed}
                        onClose={close}
                      />
                    ) : (
                      <GameEditFields
                        subject={subject}
                        existingSystems={existingSystems}
                        startWithSession={startWithSession}
                        onClose={close}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </GameCaseBackSurface>
        </div>
      </div>
    </ModalFrame>
  );
}
