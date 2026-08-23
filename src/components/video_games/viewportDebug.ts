// Temporary instrumentation for the dialog-jumps-on-keyboard bug. Every fix to
// that so far (#146, #151, #164) was validated against a simulated keyboard in
// Chromium, because no desktop browser can produce the iOS event timeline that
// actually drives it. This records that timeline on the device itself.
//
// Gated on ?vvdebug=1 and inert otherwise: nothing is recorded, nothing
// rendered. Delete this file and its two call sites once the bug is understood.

/** One visualViewport event, plus what the hook decided to do about it. */
export type ViewportSample = {
  /** ms since the first sample, which is the tap that raised the keyboard. */
  t: number;
  kind: "resize" | "scroll" | "commit";
  /** Which consumer committed. Only "frame" moves the dialog; "list" is
   *  SuggestInput's own copy of the hook, which only re-scrolls its options. */
  label?: string;
  offsetTop: number;
  height: number;
  /** documentElement.clientHeight, the layout viewport a keyboard should NOT change. */
  layout: number;
  /** Where a centered panel lands: the visible band's midpoint. Movement in this
   *  is exactly the movement the user sees. */
  center: number;
};

const MAX_SAMPLES = 60;

let samples: ViewportSample[] = [];
let origin = 0;
let enabled: boolean | null = null;
const listeners = new Set<() => void>();

export function isViewportDebugOn(): boolean {
  if (enabled === null) {
    enabled =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("vvdebug");
  }
  return enabled;
}

export function recordViewportSample(kind: ViewportSample["kind"], label?: string): void {
  if (!isViewportDebugOn()) return;
  const viewport = window.visualViewport;
  if (!viewport) return;

  const now = performance.now();
  // A gap this long means the keyboard finished and a new interaction started,
  // so the clock restarts and the reading stays a single legible burst.
  if (samples.length === 0 || now - origin > 4000) {
    samples = [];
    origin = now;
  }

  // A new array rather than push/shift: useSyncExternalStore compares snapshots
  // by identity and would skip a re-render if this one were mutated in place.
  samples = [
    ...samples,
    {
      t: Math.round(now - origin),
      kind,
      label,
      offsetTop: Math.round(viewport.offsetTop),
      height: Math.round(viewport.height),
      layout: Math.round(document.documentElement.clientHeight),
      center: Math.round(viewport.offsetTop + viewport.height / 2),
    },
  ].slice(-MAX_SAMPLES);
  listeners.forEach((notify) => notify());
}

export function getViewportSamples(): ViewportSample[] {
  return samples;
}

export function subscribeViewportDebug(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function clearViewportSamples(): void {
  samples = [];
  listeners.forEach((notify) => notify());
}
