import { useEffect, useRef, type RefObject } from "react";
import { lockScroll, preventRevealScroll } from "./scrollLock";

// Shared chrome for the owner dialogs. Locks body scroll, moves focus into the
// dialog (to initialFocusRef), closes on Escape, and restores focus to whatever
// opened it when it closes.
//
// Two lifecycles, one hook. The mount-only dialogs (AddGameModal,
// the detail card, AddGameModal) render only while open, so they leave
// `enabled` at its default and the effects run on mount and clean up on unmount
// — no isOpen plumbing. StatsPanel cannot work that way: it slide-animates in
// via `translate-x-full` and so stays mounted while closed, which is why it
// passes `enabled={isOpen}` and the effect body bails when false.
//
// Generic over the focus target's element type so callers can pass a
// `useRef<HTMLButtonElement>`/`useRef<HTMLInputElement>` without a variance
// cast.

// How long to wait for the click a focus belongs to before escalating anyway.
// Long enough to outlast a slow tap, short enough to beat the reveal scroll that
// escalating exists to prevent — and if it loses that race, stage two undoes the
// scroll rather than freezing it (see scrollLock).
const FOCUS_WITHOUT_CLICK_MS = 400;

// Whether focusing this element will raise a software keyboard. Deliberately
// narrow: a `select` opens a picker rather than a keyboard, and the button-like
// input types raise nothing at all, so none of them should pay for stage two of
// the lock.
const NO_KEYBOARD_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

// Whether this DEVICE has a software keyboard, as opposed to whether the
// focused element would raise one. Both halves of stage two are answers to a
// software keyboard: WebKit's reveal scroll of a field inside a fixed dialog,
// and Safari's URL bar. A mouse-driven pointer raises neither, so escalating
// there takes the document out of flow for nothing -- and a document out of
// flow has no scroll range, which is a real change to a page whose library
// header is `position: sticky`.
//
// Both conditions, so only an unambiguous mouse-driven desktop opts out: a
// touchscreen laptop reports a coarse primary pointer or no hover and keeps
// today's behavior.
function hasSoftwareKeyboard(): boolean {
  return !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function wantsKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NO_KEYBOARD_INPUT_TYPES.has(target.type);
}

// The scroll lock lives in scrollLock.ts, because anything that still needs to
// scroll the page has to go through it: a locked page is out of flow and
// `window.scrollTo` has nothing to move.
export function useModalChrome<T extends HTMLElement>(
  onClose: () => void,
  initialFocusRef: RefObject<T | null>,
  enabled = true
): void {
  // Latest-ref pattern: the Escape listener reads onClose through a ref so the
  // mount effect below never needs onClose in its deps (and never re-runs).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;

    const unlockScroll = lockScroll();

    // Stage two of the lock, deferred to the thing that needs it. Focus alone is
    // not the trigger: a dialog focuses something the moment it opens, and the
    // checkboxes and radios inside one raise no keyboard, while escalating
    // costs Safari its collapsed URL bar for as long as the dialog is up.
    //
    // And not on the focus itself either. A touch focuses the field between its
    // own pointerdown and its click, and escalating there re-lays out the
    // document, after which WebKit does not deliver that click at all: tapping
    // the System field focused it but never opened its suggestion list, and it
    // took a second tap. So it waits for the click that focus belongs to, with a
    // timeout for the focus that never has one (Tab, or a programmatic focus).
    let pendingEscalation: ReturnType<typeof setTimeout> | undefined;

    const escalateNow = () => {
      if (pendingEscalation === undefined) return;
      clearTimeout(pendingEscalation);
      pendingEscalation = undefined;
      preventRevealScroll();
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!wantsKeyboard(e.target) || !hasSoftwareKeyboard()) return;
      if (pendingEscalation !== undefined) return;
      pendingEscalation = setTimeout(escalateNow, FOCUS_WITHOUT_CLICK_MS);
    };
    // Bubble phase, so it runs after the focused control's own click handler in
    // the same dispatch: by then the click has been delivered and the layout is
    // free to change.
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("click", escalateNow);
    // Remember what opened the dialog so focus can return to it on close
    // instead of dropping to <body>.
    const previouslyFocused = document.activeElement;
    initialFocusRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(pendingEscalation);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("click", escalateNow);
      unlockScroll();
      window.removeEventListener("keydown", handleKey);
      // isConnected guards against the opener having been unmounted (e.g. the
      // game moved shelves after a rating change re-rendered the grid).
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
    // initialFocusRef is a stable ref object, so for a mount-only dialog this
    // runs once on mount. For a stays-mounted one it re-runs when `enabled`
    // flips, which is what makes open/close behave like mount/unmount.
  }, [initialFocusRef, enabled]);
}
