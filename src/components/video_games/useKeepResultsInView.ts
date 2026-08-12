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
 *  - **Only when the result set actually changed.** `signature` describes the
 *    shelves' contents, so re-sorting inside the same shelves is not a change.
 *  - **Only upward.** The early return when the results already clear the
 *    chrome is what stops this yanking the page while someone is reading.
 *  - **Never touches focus.** `window.scrollTo` moves the viewport and nothing
 *    else; `scrollIntoView` on or near the search box could dismiss the
 *    keyboard mid-search, which would trade this annoyance for a worse one.
 *
 *  The caller must pass a signature derived from the DEFERRED pipeline output,
 *  not from the raw input value. GameShelves runs its filters through
 *  useDeferredValue, and driving this off the live value would scroll on every
 *  keystroke, fighting the typist. */
export function useKeepResultsInView(
  resultsRef: RefObject<HTMLElement | null>,
  barRef: RefObject<HTMLElement | null>,
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
      const bar = barRef.current;
      if (!results || !bar) return;

      // The bar's own sticky offset resolves --nav-height to pixels for us, so
      // the two halves of the chrome are measured rather than restated here.
      // Deliberately NOT getBoundingClientRect(): that includes the bar's
      // hide-on-scroll-down transform, and the space to clear is where the bar
      // sits when shown, which is where it will be a moment after we scroll up.
      const stickyTop = parseFloat(getComputedStyle(bar).top) || 0;
      const chromeBottom = stickyTop + bar.offsetHeight;

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

      // `top - safeTop` is negative here, which is what makes this upward-only.
      window.scrollTo({
        top: window.scrollY + top - safeTop,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [signature, resultsRef, barRef]);
}
