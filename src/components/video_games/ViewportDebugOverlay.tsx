"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  clearViewportSamples,
  getViewportSamples,
  isViewportDebugOn,
  recordViewportSample,
  subscribeViewportDebug,
} from "./viewportDebug";

// Renders the recorded visualViewport timeline over the dialog, for reading off
// a phone. Temporary; see viewportDebug.ts.

export function ViewportDebugOverlay() {
  // The React way to read a store living outside React. Same getter for both
  // snapshots: the buffer is empty during prerender either way.
  const samples = useSyncExternalStore(
    subscribeViewportDebug,
    getViewportSamples,
    getViewportSamples
  );

  // The gate reads window.location, so deciding it during render would make the
  // server send nothing and the client send a table: a hydration mismatch.
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isViewportDebugOn()), []);

  // The raw events are recorded HERE rather than inside useVisibleViewportInsets
  // because two components call that hook (this frame and SuggestInput), and
  // recording per instance logged every event twice.
  useEffect(() => {
    if (!on) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => recordViewportSample("resize");
    const onScroll = () => recordViewportSample("scroll");
    viewport.addEventListener("resize", onResize);
    viewport.addEventListener("scroll", onScroll);
    return () => {
      viewport.removeEventListener("resize", onResize);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [on]);

  if (!on) return null;

  // Only the frame's commits move the dialog, so the summary counts those and
  // says which way each one went. This is the line to read first.
  const moves = samples.filter((s) => s.kind === "commit" && s.label === "frame");
  const directions = moves
    .map((s, i) => (i === 0 ? "first" : s.center < moves[i - 1].center ? "UP" : "DOWN"))
    .join(" > ");

  return (
    <div className="pointer-events-auto fixed inset-x-0 top-0 z-[100] max-h-[45vh] overflow-y-auto bg-black/90 p-2 font-mono text-[10px] leading-tight text-lime-300">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span>
          {moves.length} frame moves{directions && `: ${directions}`}
        </span>
        <button
          type="button"
          onClick={clearViewportSamples}
          className="rounded bg-lime-300/20 px-2 py-1"
        >
          clear
        </button>
      </div>
      <table className="w-full tabular-nums">
        <thead>
          <tr className="text-lime-500">
            <th className="text-left">t</th>
            <th className="text-left">event</th>
            <th className="text-right">offTop</th>
            <th className="text-right">height</th>
            <th className="text-right">layout</th>
            <th className="text-right">center</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s, i) => (
            <tr key={i} className={s.kind === "commit" ? "text-white" : undefined}>
              <td>{s.t}</td>
              <td>{s.kind === "commit" ? `commit:${s.label}` : s.kind}</td>
              <td className="text-right">{s.offsetTop}</td>
              <td className="text-right">{s.height}</td>
              <td className="text-right">{s.layout}</td>
              <td className="text-right">{s.center}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
