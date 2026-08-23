import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  initialHideOnScrollState,
  nextHideOnScrollState,
  type HideOnScrollState,
  type ScrollReading,
} from "./hideOnScroll";

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
  const stateRef = useRef<HideOnScrollState | null>(null);
  const stickyThresholdRef = useRef(0);

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
    const read = (): ScrollReading => ({
      scrollY: window.scrollY,
      // Rounded: some devices report a fractional innerHeight that drifts by
      // hundredths, which would read as a resize on every sample.
      viewportHeight: Math.round(window.innerHeight),
    });

    const handleScroll = () => {
      const reading = read();
      const previous = stateRef.current ?? initialHideOnScrollState(reading);
      const next = nextHideOnScrollState(previous, reading, stickyThresholdRef.current);
      stateRef.current = next;
      // Only on a change: this runs on every scroll event, and React would
      // otherwise be asked to check a re-render sixty times a second.
      if (next.visible !== previous.visible) setVisible(next.visible);
    };

    // Created once and reused: `change` fires only when the viewport crosses
    // 640px, never on a scroll tick.
    const mql = window.matchMedia("(min-width: 640px)");
    let scrollAttached = false;

    const attachScroll = () => {
      if (scrollAttached) return;
      // Measure from here, not from a stale value left by a previous mobile
      // session.
      stateRef.current = initialHideOnScrollState(read());
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
