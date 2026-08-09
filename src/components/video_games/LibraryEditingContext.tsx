"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { GameCaseInput } from "./GameCase";

// "May this viewer edit this library, and how do they open the editor?" — one
// answer, read directly by the card that needs it.
//
// It used to travel as an optional `onEditGame`/`onEdit` prop threaded through
// ShelfSection, and GameCase re-derived permission from the prop's *presence*
// (`onEdit !== undefined`). That put the rule in three places and forced
// ShelfSection — otherwise purely presentational — to carry an editing concern
// through to every card.
//
// A React context is the counterpart to prop drilling, not to state management:
// it changes how a value reaches a descendant, not who owns it. GameLibrary
// still owns the state.
type LibraryEditing = {
  // null when the viewer does not own this library. Not "a no-op function":
  // null is what the pencil is gated on, and a callable value that quietly did
  // nothing would render an affordance that lies.
  openEditor: ((game: GameCaseInput) => void) | null;
};

const LibraryEditingContext = createContext<LibraryEditing>({ openEditor: null });

// Provided by GameLibrary rather than LibraryPage, because the handler is
// view-aware: it picks EditGameModal or EditWishlistModal from the active tab,
// and LibraryPage does not know which tab that is.
export function LibraryEditingProvider({
  openEditor,
  children,
}: {
  openEditor: ((game: GameCaseInput) => void) | null;
  children: ReactNode;
}) {
  // Memoized on the callback: a fresh object literal here would give every
  // consumer a new context value on every render, which is exactly the
  // re-render the React.memo on GameCase exists to prevent.
  const value = useMemo(() => ({ openEditor }), [openEditor]);
  return <LibraryEditingContext.Provider value={value}>{children}</LibraryEditingContext.Provider>;
}

export function useLibraryEditing(): LibraryEditing {
  return useContext(LibraryEditingContext);
}
