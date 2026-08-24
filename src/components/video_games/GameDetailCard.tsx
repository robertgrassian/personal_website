"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { RATINGS, systemLabel, type Game } from "@/lib/games";
import type { WishlistGame } from "@/lib/wishlist";
import { ArrowLeftIcon, CloseIcon } from "@/components/Icon";
import { ModalFrame } from "./ModalFrame";
import { GameCaseBackSurface } from "./GameCaseBackSurface";
import { GameCaseSpine } from "./GameCaseSpine";
import { DURATION_MS, useCardFlight } from "./useCardFlight";
import type { CardOrigin } from "./LibraryCardContext";
import { GameEditFields } from "./GameEditFields";
import { WishlistEditFields } from "./WishlistEditFields";
import { GamePlayHistory } from "./GamePlayHistory";
import { GameNotesEditor, GameNotesPreview } from "./GameNotes";
import { useGameNote } from "./useGameNote";
import { sessionsByGame } from "@/lib/sessions";
import type { PlayHistoryState } from "./usePlayHistory";

/** Which of the three things the card is showing. A viewer's card is NOT a
 *  fourth kind: it is `game` with the edit region simply not rendered, so
 *  permission stays the one boolean GameLibrary already derives instead of
 *  becoming a second source of truth that can disagree with it. */
/** Which face of the card is showing. The detail face is `null` rather than a
 *  third variant: it is the default, and every branch below asks "is a face
 *  open?" far more often than it asks which one. */
export type CardFace = { kind: "history"; stopping: boolean } | { kind: "notes" };

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
  // Owned by GameLibrary so one copy serves every surface; narrowed here to
  // the game on screen.
  playHistory: PlayHistoryState;
  // Triggers the fetch. See usePlayHistory.
  onRequestHistory: () => void;
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
// Two faces, not two dialogs: the play history swaps this card's scrolling
// region for a session list plus an add form. A second ModalFrame would mean
// two focus traps, two Escape handlers and a backdrop over a backdrop.
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
  playHistory,
  onRequestHistory,
  onClose,
}: GameDetailCardProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const source = subject.kind === "game" ? subject.game : subject.item;

  // null = the detail face; anything else swaps the card's scrolling region.
  // `stopping` remembers which button opened the history, so "Stop Playing"
  // arrives with the close staged. Answering "Played?" on a game already owned
  // opens straight into it: that IS a session.
  const [face, setFace] = useState<CardFace | null>(
    startWithSession && subject.kind === "game" ? { kind: "history", stopping: false } : null
  );
  const openHistory = ({ stopping }: { stopping: boolean }) => {
    onRequestHistory();
    setFace({ kind: "history", stopping });
  };

  // Owner-only and library-only: a wishlist entry keeps its own short notes
  // field, and a promote has no game row to hang one off yet.
  const gameId = subject.kind === "game" ? subject.game.id : 0;
  const notesEnabled = subject.kind === "game" && canEdit;
  // Fetched when the card opens rather than when the notes face does, so the
  // preview below has something to show without a spinner on the way in.
  const note = useGameNote(gameId, notesEnabled);

  // Set when a close was refused because the notes draft is unsaved. Living on
  // the card, not the editor: the card is what gets closed, and every way out
  // (the X, Escape, the backdrop) funnels through requestClose below.
  const [closeBlocked, setCloseBlocked] = useState(false);

  // The initializer covers a card that MOUNTS on "Played?". This covers the
  // other way in: for a game already owned the subject swaps from wishlist to
  // game IN PLACE, so nothing remounts and no initializer re-runs.
  useEffect(() => {
    if (!startWithSession || subject.kind !== "game") return;
    onRequestHistory();
    setFace({ kind: "history", stopping: false });
  }, [startWithSession, subject.kind, onRequestHistory]);

  // `close` runs the return flight and calls onClose when it lands, so every
  // way out of the card — the X, Escape, the backdrop, a delete — flies back
  // rather than vanishing.
  const { flightRef, innerRef, phase, close, closing } = useCardFlight({
    origin,
    caseId,
    onClosed: onClose,
  });

  // Every exit runs through here so an unsaved note cannot be lost to a stray
  // Escape or a tap on the backdrop. Going BACK to the detail face is not
  // guarded and does not need to be: the draft lives in useGameNote, which
  // outlives this face.
  const requestClose = () => {
    if (face?.kind === "notes" && note.isDirty) {
      setCloseBlocked(true);
      return;
    }
    close();
  };
  const ratingEntry =
    subject.kind === "game" && subject.game.rating
      ? RATINGS.find((r) => r.name === subject.game.rating)
      : undefined;
  const starred = subject.kind !== "game" && subject.item.starred;

  // A promote is already gated on ownership by the caller; the other two ask.
  const editable = subject.kind === "promote" || canEdit;

  return (
    <ModalFrame
      onClose={requestClose}
      // The dialog itself, not the close button. Focusing a control
      // programmatically leaves :focus-visible up to each engine's heuristics,
      // and WebKit resolves it as keyboard focus, so the X opened with a ring
      // that then rode the focus restore into the next card. A container has no
      // focus ring to mis-fire, and focusing the labelled dialog is what makes a
      // screen reader announce it on open.
      initialFocusRef={dialogRef}
      backdropBlur={false}
      // The dim arrives with the card and leaves with it, rather than cutting
      // on at the click and off once the case has already landed. Only when
      // there is a flight to match: a promote has no case to fly from, so its
      // card simply appears and so does its dim.
      backdropFadeMs={origin === null ? null : DURATION_MS}
      backdropFadingOut={closing}
    >
      {/* The grid item, and the element the flight translates and scales. min-w-0
          because a grid item's automatic minimum size is min-content, which
          would otherwise let a long unbroken genre push the card off screen.

          Below sm it matches the shelf plank exactly, which is the page
          container's own inset: `max-w-7xl mx-auto px-6` puts every shelf at
          100vw - 3rem. At the 340 this replaced, the card came up 1px short of
          the plank on a 390px phone and left a sliver of shelf showing down
          each side, which reads as a near miss rather than a choice. Change
          the container's px-6 and this has to follow.

          Above sm the card is 448 instead, which is what buys exact case
          proportions there; a phone cannot have those at any width, since the
          form pins it at 670 tall and 2:3 would need 415px of card. */}
      <div
        ref={flightRef}
        data-phase={phase}
        className="game-card-flight game-card-scene pointer-events-auto min-w-0 max-h-full w-full max-w-[calc(100vw-3rem)] sm:max-w-md"
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
              ref={dialogRef}
              // Focusable only from script: -1 keeps it out of the tab order, so
              // Tab still goes straight from here to the close button.
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative z-10 flex min-h-0 flex-1 flex-col focus:outline-none"
            >
              {/* Three slots, the left one always present and as wide as the
                  close button, so the title stays centred whether or not the
                  back arrow shows. The negative margins buy a 44px touch target
                  without growing the header row. */}
              <div className="flex shrink-0 items-start gap-2 px-5 pt-4">
                <div className="-my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center sm:-my-1 sm:-ml-1 sm:h-9 sm:w-9">
                  {face !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        // Leaving the notes face keeps the draft (useGameNote
                        // owns it), so this needs no guard — but a refusal
                        // staged against the card's close does not survive the
                        // trip, or "Close anyway?" would still be sitting there
                        // when you came back.
                        setCloseBlocked(false);
                        setFace(null);
                      }}
                      aria-label="Back to game details"
                      className="flex h-full w-full items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      <ArrowLeftIcon className="h-6 w-6 sm:h-5 sm:w-5" aria-hidden />
                    </button>
                  )}
                </div>
                {/* min-w-0 so a long title wraps instead of pushing the close
                    button off the card. */}
                <h2
                  id={titleId}
                  className="min-w-0 flex-1 text-center text-lg font-bold leading-tight text-white"
                >
                  {source.name}
                </h2>
                {/* 44px touch target on phones; the negative margins keep it
                    from growing the header row. */}
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Close"
                  className="-mr-2 -mb-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:-mr-1 sm:-mb-1 sm:-mt-1 sm:h-9 sm:w-9"
                >
                  <CloseIcon className="h-6 w-6 sm:h-5 sm:w-5" aria-hidden />
                </button>
              </div>

              {/* The card's one scrolling part. overscroll-contain keeps a flick
                at the end of the form off the library behind it.

                Except for the notes face, which turns the scrolling off here so
                it can own the height: its textarea is the thing that scrolls,
                and a scroll container around a full-height field gives you two
                nested scrollers and a growing card. */}
              <div
                className={`min-h-0 flex-1 overflow-x-hidden overscroll-contain ${
                  face?.kind === "notes" ? "overflow-y-hidden" : "overflow-y-auto"
                }`}
              >
                {face?.kind === "notes" && subject.kind === "game" ? (
                  <GameNotesEditor
                    note={note}
                    closeBlocked={closeBlocked}
                    onKeepEditing={() => setCloseBlocked(false)}
                    onDiscardAndClose={close}
                  />
                ) : face?.kind === "history" && subject.kind === "game" ? (
                  // Reached only from the owner-only region below, so no
                  // permission check here. Sessions are narrowed from the one
                  // whole-library fetch, so this costs no extra request.
                  <div className="px-5 pb-4 pt-1">
                    <GamePlayHistory
                      game={subject.game}
                      sessions={sessionsByGame(playHistory.sessions).get(subject.game.id) ?? []}
                      isLoading={playHistory.isLoading}
                      error={playHistory.error}
                      startToday={startWithSession}
                      startStopping={face.stopping}
                      onSaved={playHistory.refresh}
                    />
                  </div>
                ) : (
                  <>
                    <div className="px-5 pb-4 pt-2">
                      <p className="text-sm font-medium text-gray-100">
                        {systemLabel(source.system)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-300">
                        Released {formatDate(source.releaseDate)}
                      </p>
                      {ratingEntry && (
                        <p className="mt-2 text-sm font-semibold text-gray-100">
                          ★ {ratingEntry.name}
                        </p>
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
                      // One surface all the way down. The fields carry their own
                      // translucent backgrounds (the shelf tokens are re-pointed
                      // for this scrim in video-games.css), so a second, darker
                      // panel behind them only split the card into two halves. If
                      // a bright cover ever costs the labels their contrast,
                      // --back-overlay is the lever, not another layer.
                      <div className="border-t border-white/15 px-5 pb-4 pt-1">
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
                            onOpenHistory={openHistory}
                            onClose={close}
                            // A slot rather than GameEditFields owning the
                            // notes state: the card holds the hook (both faces
                            // read it) and owns which face is showing, and
                            // threading either through the form would put the
                            // card's business in it.
                            //
                            // `notesEnabled`, not `editable`: a promote is
                            // editable without having a game row to hang a note
                            // on yet, so its slot stays empty.
                            notesSlot={
                              notesEnabled ? (
                                <GameNotesPreview
                                  note={note}
                                  onOpen={() => setFace({ kind: "notes" })}
                                />
                              ) : null
                            }
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </GameCaseBackSurface>
        </div>
      </div>
    </ModalFrame>
  );
}
