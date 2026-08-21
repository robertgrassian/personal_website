// On-screen frame timing for the detail card's flight.
//
// Development only, and off unless ?flightdebug is in the URL. The animation is
// smooth on some machines and not others, and there is no console on a phone,
// so this reports what the device actually did rather than what a desktop
// browser can be talked into reproducing.
//
// Deliberately not React: it builds its own DOM node and writes to it directly,
// so measuring the flight cannot itself cause a render during the flight.

type Sample = { label: string; frames: number[] };

// Which cards have been opened already this page load. The first open of a
// given card has to build its blurred texture at card size; every open after
// that can reuse it. If the stutter only ever lands on a first open, the fix is
// to pay that cost before the click rather than during it.
const opened = new Set<string>();

let enabled: boolean | null = null;

function isEnabled(): boolean {
  if (enabled === null) {
    enabled =
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("flightdebug");
    if (enabled) applyPromotionVariant();
  }
  return enabled;
}

// Lets the compositing strategy be A/B'd from the URL, because the machines
// that see the flight stutter are not the one this was written on, and one
// round trip per hypothesis is slow.
//
//   ?flightdebug        the shipped behaviour: the blurred cover is promoted
//   ?flightdebug=none   nothing promoted, for a baseline
//   ?flightdebug=all    the whole rotating subtree promoted
//   ?flightdebug=noblur the cover's blur is off for the flight
//
// noblur is the one that tells us the most. Gecko does not cache a
// filter: blur() as a texture the way Blink does, so a blurred element that
// scales can have its filter recomputed as it grows — which would land as
// periodic dropped frames rather than uniform slowness. If noblur is the only
// smooth variant, the fix is to stop using a runtime filter here at all.
//
// The CSS for each lives beside the flight rules in video-games.css.
function applyPromotionVariant(): void {
  const value = new URLSearchParams(window.location.search).get("flightdebug");
  if (value === "none" || value === "all" || value === "noblur") {
    document.documentElement.dataset.flightPromote = value;
  }
}

function panel(): HTMLElement {
  const existing = document.getElementById("flight-debug");
  if (existing !== null) return existing;
  const el = document.createElement("div");
  el.id = "flight-debug";
  el.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:99999;max-width:min(92vw,420px);" +
    "background:rgba(0,0,0,.86);color:#e5e7eb;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;" +
    "padding:8px 10px;border-radius:6px;white-space:pre;pointer-events:none;";
  document.body.appendChild(el);
  return el;
}

function report({ label, frames }: Sample): void {
  const deltas: number[] = [];
  for (let i = 1; i < frames.length; i++) deltas.push(frames[i] - frames[i - 1]);
  if (deltas.length === 0) return;

  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const fix = (n: number) => n.toFixed(1);
  // 20ms is the useful threshold at 60Hz: a 16.7ms budget plus slack. A frame
  // over it is one the compositor missed.
  const long = deltas.filter((d) => d > 20).length;
  const span = frames[frames.length - 1] - frames[0];

  panel().textContent =
    `${label}  ${fix(span)}ms, ${deltas.length} frames\n` +
    `median ${fix(at(0.5))}  p90 ${fix(at(0.9))}  worst ${fix(sorted[sorted.length - 1])}\n` +
    `over 20ms: ${long}/${deltas.length} (${Math.round((long / deltas.length) * 100)}%)\n` +
    `deltas: ${deltas.map((d) => Math.round(d)).join(" ")}`;
}

/** Starts sampling frames; the returned function stops and reports. A no-op
 *  unless this is a dev build with ?flightdebug in the URL. */
export function recordFlight(label: string, subject = ""): () => void {
  if (!isEnabled()) return () => {};
  const key = `${label}:${subject}`;
  const frames: number[] = [];
  let raf = requestAnimationFrame(function tick(t) {
    frames.push(t);
    raf = requestAnimationFrame(tick);
  });
  return () => {
    cancelAnimationFrame(raf);
    // Marked here rather than on the way in: React re-invokes the effect that
    // starts this in development, and the discarded first run would otherwise
    // claim the "first" label and leave every real open reported as a repeat.
    // A cancelled run never reaches this line.
    const firstTime = !opened.has(key);
    opened.add(key);
    const age = Math.round(performance.now() / 1000);
    report({
      label: `${label} ${subject} [${firstTime ? "FIRST open" : "repeat"}, page ${age}s old]`,
      frames,
    });
  };
}
