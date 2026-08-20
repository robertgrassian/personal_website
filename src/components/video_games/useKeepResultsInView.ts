import { useEffect, useRef, type RefObject } from "react";

// Breathing room between the bottom of the sticky chrome and the top of the
// results, so the first shelf does not sit flush against the filter bar.
const GAP_PX = 8;

/** Scroll the results back under the sticky chrome when a filter changes.
 *
 *  The bug this exists for: filtering 155 games down to one shelf collapses the
 *  document's height. The browser clamps `scrollY` to the new maximum, and
 *  wherever that lands is where the viewport stays -- nothing in the app ever
 *  scrolled after a filter. On a short result set that routinely leaves the one
 *  surviving shelf at the very top of the page, underneath the nav and the
 *  filter bar, so the thing you just searched for is the thing you cannot see.
 *
 *  Note what this is NOT: the shelves are in normal flow after the sticky bar,
 *  so they are never painted behind it. This is a scroll-position problem, and
 *  a z-index or padding change would not touch it.
 *
 *  Three rules keep it from becoming its own annoyance:
 *
 *  - **Only when the visitor narrowed the library differently.** `signature`
 *    must describe the FILTERS, not the shelves that came back: an owner edit
 *    changes the shelves too, and rating a game should never move the page.
 *  - **Only upward.** The early return when the results already clear the
 *    chrome is what stops this yanking the page while someone is reading.
 *  - **Never touches focus.** `window.scrollTo` moves the viewport and nothing
 *    else; `scrollIntoView` on or near the search box could dismiss the
 *    keyboard mid-search, which would trade this annoyance for a worse one.
 *
 *  The caller must build the signature from the DEFERRED filter values, not the
 *  live ones. GameShelves runs its filters through useDeferredValue, and driving
 *  this off the live value would scroll on every keystroke, fighting the
 *  typist. */
export function useKeepResultsInView(
  resultsRef: RefObject<HTMLElement | null>,
  chromeRef: RefObject<HTMLElement | null>,
  signature: string
) {
  // What we last acted on. Null until the first run, so a freshly mounted
  // library (which may legitimately arrive with filters already applied from
  // the URL) does not scroll before the visitor has done anything.
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    const isFirstRun = lastSeen.current === null;
    const changed = lastSeen.current !== signature;
    lastSeen.current = signature;
    if (isFirstRun || !changed) return;

    // One frame later, not immediately: the height collapse and the browser's
    // clamp of scrollY both happen at paint, and measuring before that reads a
    // scroll position the browser is about to overrule.
    const frame = requestAnimationFrame(() => {
      const results = resultsRef.current;
      const chrome = chromeRef.current;
      if (!results || !chrome) return;

      // The chrome's own sticky offset resolves --nav-offset to pixels for us,
      // so the nav and the header are measured rather than restated here. The
      // header is one element holding the tab strip, the filter status and the
      // filter bar, so offsetHeight already covers all of it.
      // Deliberately NOT getBoundingClientRect(): that includes the header's
      // hide-on-scroll-down transform, and the space to clear is where it sits
      // when shown, which is where it will be a moment after we scroll up.
      const stickyTop = parseFloat(getComputedStyle(chrome).top) || 0;
      const chromeBottom = stickyTop + chrome.offsetHeight;

      // With a software keyboard open the visual viewport is a band inside the
      // layout viewport, and `position: sticky` resolves against the LAYOUT one
      // -- so on a phone mid-search the bar can sit above what the user can
      // actually see. offsetTop is where the visible band starts, in the same
      // coordinates as the rect below. Read at scroll time rather than watched:
      // this corrects the landing spot while the keyboard is up, which is when
      // the scroll happens.
      const visibleTop = window.visualViewport?.offsetTop ?? 0;
      const safeTop = Math.max(chromeBottom, visibleTop) + GAP_PX;

      const top = results.getBoundingClientRect().top;
      if (top >= safeTop) return; // already clear of the chrome; leave it alone

      // Instant, not smooth, which is a deliberate reversal of the usual
      // preference. Smooth scrolling earns its cost carrying you through content
      // that stays put, so you keep your bearings -- but the results were just
      // replaced, so it would animate through a list that no longer exists.
      // Three things make it actively worse here: the filter can change on every
      // keystroke, and each change restarts the animation so the page never
      // settles while you type; the distances run to thousands of pixels; and an
      // animation can be interrupted mid-flight by a thumb or by the keyboard
      // resizing the viewport, which strands the scroll partway. A jump lands in
      // the same frame as the new results and reads as cause and effect. It is
      // also what prefers-reduced-motion would have forced anyway.
      //
      // `top - safeTop` is negative here, which is what makes this upward-only.
      window.scrollTo({ top: window.scrollY + top - safeTop, behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [signature, resultsRef, chromeRef]);
}
