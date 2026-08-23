"use client";

import { useCallback, useEffect, useState } from "react";
import { useRectLog } from "./useRectLog";

// Records what the detail card's box actually does, ON THE REAL PAGE.
//
// /dev/keyboard-lab renders the real card offline and could not reproduce the
// symptom, which rules the card out and points at something the library page
// has and the lab does not: a long scrolled document, the nav and sticky
// header, and a card that flew in from a shelf rather than appearing. Rather
// than simulate any more of that, this attaches to the real thing.
//
// Mounted only when NODE_ENV is not production, and even then it renders
// nothing without ?rectlog=1 in the URL.

export function RectLogOverlay() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);

  // Read the query string after mount: deciding during render would make the
  // server send nothing and the client send a panel, which is a mismatch.
  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).has("rectlog"));
  }, []);

  const findCard = useCallback(() => document.querySelector(".game-card-flight"), []);
  const { samples, clear } = useRectLog(findCard);

  if (!on) return null;

  const changes = samples.slice(1).map((s, i) => {
    const previous = samples[i];
    return { ...s, movedBy: s.top - previous.top, resizedBy: s.height - previous.height };
  });
  const moves = changes.filter((c) => c.movedBy !== 0 && c.resizedBy === 0).length;
  const resizes = changes.filter((c) => c.resizedBy !== 0).length;

  // Most rows are frames of the 200ms padding transition. Where the box came to
  // REST between them is the part worth reading, and it fits on one line.
  const rests = samples.filter((s, i) => i === samples.length - 1 || samples[i + 1].t - s.t >= 150);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Above the card (z-60) so it is reachable without closing it, and small
        // enough not to cover the top edge, which is the thing being watched.
        className="fixed bottom-[max(0.5rem,var(--safe-bottom))] right-2 z-[100] rounded-full bg-black/80 px-3 py-2 font-mono text-[11px] text-lime-300 shadow-lg"
      >
        rect {samples.length}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/95 p-3 font-mono text-[11px] text-lime-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-sans font-semibold">Card box recorder</span>
        <span className="flex gap-2">
          <button type="button" onClick={clear} className="rounded bg-lime-300/20 px-3 py-2">
            clear
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded bg-lime-300/20 px-3 py-2"
          >
            hide
          </button>
        </span>
      </div>

      <p className="mb-2 rounded bg-lime-300/10 p-2">
        <span className="font-sans">came to rest at </span>
        {rests.map((r) => `top ${r.top} h ${r.height}`).join("  →  ") || "nothing yet"}
      </p>
      <p className="mb-2 font-sans">
        {moves} move{moves === 1 ? "" : "s"}, {resizes} resize{resizes === 1 ? "" : "s"}. A move is
        the top edge changing with the height unchanged; a resize is the height changing, which
        pulls a centred card&apos;s top edge down without the card moving.
      </p>

      <table className="w-full tabular-nums">
        <thead className="sticky top-0 bg-black text-lime-500">
          <tr>
            <th className="text-left">t</th>
            <th className="text-right">top</th>
            <th className="text-right">Δtop</th>
            <th className="text-right">h</th>
            <th className="text-right">Δh</th>
            <th className="text-right">offTop</th>
            <th className="text-right">band</th>
            <th className="text-right">layout</th>
            <th className="text-right">scrollY</th>
          </tr>
        </thead>
        <tbody>
          {samples.slice(0, 1).map((s, i) => (
            <tr key={`first-${i}`}>
              <td>{s.t}</td>
              <td className="text-right">{s.top}</td>
              <td className="text-right">-</td>
              <td className="text-right">{s.height}</td>
              <td className="text-right">-</td>
              <td className="text-right">{s.offsetTop}</td>
              <td className="text-right">{s.bandHeight}</td>
              <td className="text-right">{s.layout}</td>
              <td className="text-right">{s.scrollY}</td>
            </tr>
          ))}
          {changes.map((c, i) => (
            <tr key={i} className={c.resizedBy !== 0 ? "text-amber-300" : "text-sky-300"}>
              <td>{c.t}</td>
              <td className="text-right">{c.top}</td>
              <td className="text-right">{c.movedBy > 0 ? `+${c.movedBy}` : c.movedBy}</td>
              <td className="text-right">{c.height}</td>
              <td className="text-right">{c.resizedBy > 0 ? `+${c.resizedBy}` : c.resizedBy}</td>
              <td className="text-right">{c.offsetTop}</td>
              <td className="text-right">{c.bandHeight}</td>
              <td className="text-right">{c.layout}</td>
              <td className="text-right">{c.scrollY}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 font-sans">Amber rows resized, blue rows moved.</p>
    </div>
  );
}
