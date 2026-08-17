import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

// Minimum scroll distance (px) before toggling visibility. Filters out
// micro-reversals from slow or momentum scrolling.
const MIN_SCROLL_DELTA = 10;

/** Mobile-only hide-on-scroll-down for a sticky element.
 *
 *  Returns whether the element should be shown; the caller applies the
 *  transform. Desktop (>= 640px) never registers a scroll listener and always
 *  returns true, so there is zero per-scroll JS on the width where screen space
 *  is not scarce.
 *
 *  Lifted out of FilterBar when the tab strip and the filter bar became one
 *  sticky block: the thing that hides is now the whole header, and this measures
 *  whatever ref it is given. */
export function useHideOnScrollDown(ref: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);
  // Mirror of `visible` so the scroll handler reads the current value instead of
  // a stale closure.
  const visibleRef = useRef(true);
  // Scroll position at the last visibility toggle, not at every scroll event, so
  // the delta measures "how far since the bar last changed state". Prevents
  // flip-flopping on jittery scrolls.
  const scrollYAtLastToggle = useRef(0);
  const stickyThresholdRef = useRef(0);

  visibleRef.current = visible;

  // useLayoutEffect so the measurement happens before paint, while the element
  // is still in its natural flow position. Once `position: sticky` is active
  // some browsers report offsetTop as the visual position (0), hence
  // getBoundingClientRect().top + scrollY rather than offsetTop.
  useLayoutEffect(() => {
    if (ref.current) {
      stickyThresholdRef.current = ref.current.getBoundingClientRect().top + window.scrollY;
    }
  }, [ref]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Above the point where sticky engages: always show, and keep the anchor
      // current so the delta starts fresh on re-entering the sticky zone.
      if (currentScrollY < stickyThresholdRef.current) {
        if (!visibleRef.current) setVisible(true);
        scrollYAtLastToggle.current = currentScrollY;
        return;
      }

      const delta = currentScrollY - scrollYAtLastToggle.current;
      if (delta > MIN_SCROLL_DELTA) {
        setVisible(false);
        scrollYAtLastToggle.current = currentScrollY;
      } else if (delta < -MIN_SCROLL_DELTA) {
        // Scrolling up means the user is reaching for the controls.
        setVisible(true);
        scrollYAtLastToggle.current = currentScrollY;
      }
    };

    // Created once and reused: `change` fires only when the viewport crosses
    // 640px, never on a scroll tick.
    const mql = window.matchMedia("(min-width: 640px)");
    let scrollAttached = false;

    const attachScroll = () => {
      if (scrollAttached) return;
      // Measure the delta from here, not from a stale value left by a previous
      // mobile session.
      scrollYAtLastToggle.current = window.scrollY;
      setVisible(true);
      // passive: this handler never calls preventDefault, so the browser need
      // not wait on JS before scrolling.
      window.addEventListener("scroll", handleScroll, { passive: true });
      scrollAttached = true;
    };

    const detachScroll = () => {
      if (!scrollAttached) return;
      window.removeEventListener("scroll", handleScroll);
      scrollAttached = false;
    };

    const onBreakpointChange = () => {
      if (mql.matches) {
        detachScroll();
        setVisible(true);
      } else {
        attachScroll();
      }
    };

    mql.addEventListener("change", onBreakpointChange);
    onBreakpointChange(); // run once for the initial viewport width

    return () => {
      mql.removeEventListener("change", onBreakpointChange);
      detachScroll();
    };
  }, []);

  return visible;
}
