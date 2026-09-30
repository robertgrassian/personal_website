"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import type { GameCaseInput } from "./GameCase";

// "How does a shelf case open its detail card?" — one answer, read directly by
// the card that needs it.
//
// It used to travel as an optional `onEditGame`/`onEdit` prop threaded through
// the shelf group, and GameCase re-derived permission from the prop's
// *presence* (`onEdit !== undefined`). That put the rule in three places and
// forced the group — otherwise purely presentational — to carry an editing
// concern through to every card.
//
// A React context is the counterpart to prop drilling, not to state management:
// it changes how a value reaches a descendant, not who owns it. GameLibrary
// still owns the state.
//
// Unlike the `openEditor` this replaced, it is never null: every viewer can
// open a card, and whether that card shows the edit region is decided by
// GameLibrary, which renders it. GameCase no longer knows about permission.
type LibraryCard = {
  openCard: (game: GameCaseInput, launch: CardLaunch) => void;
  // Which collection the cases on screen came from. Here rather than a
  // GameCase prop so the shelf group stays purely presentational: it is the same
  // answer for every case in the view, and it is GameLibrary that knows it.
  kind: CardKind;
};

export type CardKind = "game" | "wishlist";

export type CardOrigin = { top: number; left: number; width: number; height: number };

/** What the clicked case hands the card so it can fly out of it and match its
 *  colors: where the case is on screen, and what its cover art looks like. */
export type CardLaunch = {
  origin: CardOrigin;
  dominantColor: string | null;
  // Whether that color is dark, which is what the spine text contrasts against.
  isDark: boolean;
};

const LibraryCardContext = createContext<LibraryCard>({ openCard: () => {}, kind: "game" });

// Provided by GameLibrary rather than LibraryPage, because the handler is
// view-aware: the active tab decides whether a case resolves to a library game
// or a wishlist entry, and LibraryPage does not know which tab that is.
export function LibraryCardProvider({
  openCard,
  kind,
  children,
}: {
  openCard: LibraryCard["openCard"];
  kind: CardKind;
  children: ReactNode;
}) {
  // Memoized on the callback: a fresh object literal here would give every
  // consumer a new context value on every render, which is exactly the
  // re-render the React.memo on GameCase exists to prevent.
  const value = useMemo(() => ({ openCard, kind }), [openCard, kind]);
  return <LibraryCardContext.Provider value={value}>{children}</LibraryCardContext.Provider>;
}

export function useLibraryCard(): LibraryCard {
  return useContext(LibraryCardContext);
}

// ── Opening a game's card from outside GameLibrary ─────────────────────────
//
// The CRT renders beside GameLibrary rather than inside it, so it cannot reach
// the provider above. The card's state stays in GameLibrary, which registers
// its opener here; this provider only relays the request up and across.

/** A launch from something that is not a shelf case, so it names what the card
 *  should fly back to: the `data-case-id` of an element to land on. */
export type ExternalCardLaunch = CardLaunch & { returnTo: string };

type ExternalOpener = (gameId: number, launch: ExternalCardLaunch, onClosed: () => void) => void;

type GameCardOpener = {
  /** Called by GameLibrary. Returns the unregister, for an effect cleanup. */
  register: (opener: ExternalOpener) => () => void;
  /** False when nothing is registered yet (GameLibrary still suspended), so
   *  the caller knows no card, and so no `onClosed`, is coming. */
  open: (gameId: number, launch: ExternalCardLaunch, onClosed: () => void) => boolean;
};

const GameCardOpenerContext = createContext<GameCardOpener>({
  register: () => () => {},
  open: () => false,
});

export function GameCardOpenerProvider({ children }: { children: ReactNode }) {
  // A ref, not state: registering must not re-render the page, and `open`
  // only needs whichever opener is current at the moment it is called.
  const openerRef = useRef<ExternalOpener | null>(null);
  const value = useMemo<GameCardOpener>(
    () => ({
      register: (opener) => {
        openerRef.current = opener;
        return () => {
          if (openerRef.current === opener) openerRef.current = null;
        };
      },
      open: (gameId, launch, onClosed) => {
        const opener = openerRef.current;
        if (opener === null) return false;
        opener(gameId, launch, onClosed);
        return true;
      },
    }),
    []
  );
  return <GameCardOpenerContext.Provider value={value}>{children}</GameCardOpenerContext.Provider>;
}

export function useGameCardOpener(): GameCardOpener {
  return useContext(GameCardOpenerContext);
}
