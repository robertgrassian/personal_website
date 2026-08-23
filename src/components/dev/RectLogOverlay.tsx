"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRectLog } from "./useRectLog";

// A viewport recorder for debugging layout on a real phone, where there is no
// console, no inspector, and no way to see a number that only exists for two
// frames. Mounted only when the app is running locally (see layout.tsx), and
// even then it renders nothing without ?rectlog=1 in the URL.
//
// It exists because a whole family of keyboard bugs was fixed six times from
// theory and stayed broken; one capture from the device settled it in an
// afternoon. docs/mobile-viewport.md is what those captures established, and is
// worth reading before using this.
//
// Captures POST themselves to /api/dev/rectlog, which prints them in the
// terminal running the dev server: selecting and pasting a table off a phone is
// the part that keeps failing, and a floating button lands somewhere unreachable
// in at least one browser.

// How still the page has to be before a burst counts as finished.
const QUIET_MS = 1500;

export function RectLogOverlay() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState("");
  const dumpRef = useRef<HTMLTextAreaElement>(null);
  const autoCount = useRef(0);
  // Latest-ref so the auto-send effect does not depend on a function rebuilt on
  // every sample.
  const sendRef = useRef<(label: string) => void>(() => {});

  // Read the query string after mount: deciding during render would make the
  // server send nothing and the client send a panel, which is a mismatch.
  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).has("rectlog"));
  }, []);

  const findCard = useCallback(() => document.querySelector(".game-card-flight"), []);
  // Any shelf case will do: they all move together, and the first one exists for
  // the whole session whether or not a card is open.
  const findAnchor = useCallback(
    () => document.querySelector("[data-case-id] .game-case-inner"),
    []
  );
  const { samples, clear } = useRectLog({ card: findCard, anchor: findAnchor });

  const dump = [
    "t\ttop\th\tanchor\toffTop\tband\tlayout\tscrollY",
    ...samples.map((s) =>
      [s.t, s.top, s.height, s.anchorTop, s.offsetTop, s.bandHeight, s.layout, s.scrollY].join("\t")
    ),
  ].join("\n");

  const send = (label: string) => {
    setSent("sending…");
    fetch("/api/dev/rectlog", { method: "POST", body: `capture ${label}\n${dump}` })
      .then((r) => {
        setSent(r.ok ? `sent ${label}` : `failed ${r.status}`);
        if (r.ok) clear();
      })
      .catch((e) => setSent(`failed ${e}`));
  };
  sendRef.current = send;

  // Sending clears the log, so this effect re-runs against an empty one and
  // stops. Each burst therefore arrives on its own, numbered in order.
  useEffect(() => {
    if (!on || samples.length < 3) return;
    const timer = setTimeout(() => {
      autoCount.current += 1;
      sendRef.current(`auto-${autoCount.current}`);
    }, QUIET_MS);
    return () => clearTimeout(timer);
  }, [on, samples]);

  if (!on) return null;

  const changes = samples.slice(1).map((s, i) => {
    const previous = samples[i];
    return {
      ...s,
      movedBy: s.top - previous.top,
      resizedBy: s.height - previous.height,
      anchorMovedBy: s.anchorTop - previous.anchorTop,
    };
  });

  const copy = () => {
    // navigator.clipboard needs a secure context and the dev server over wifi is
    // plain http, so selecting the text is the fallback that works on the device
    // this is for.
    navigator.clipboard?.writeText(dump).catch(() => {});
    dumpRef.current?.select();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Above the card (z-60), and at the TOP because the bottom of the screen
        // is where the keyboard is.
        className="fixed left-2 top-[calc(var(--nav-offset)+0.25rem)] z-[100] rounded-full bg-black/80 px-3 py-2 font-mono text-[11px] text-lime-300 shadow-lg"
      >
        rect {samples.length}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/95 p-3 font-mono text-[11px] text-lime-300">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-sans font-semibold">Viewport recorder</span>
        <span className="flex gap-2">
          <button type="button" onClick={copy} className="rounded bg-lime-300/20 px-3 py-2">
            copy
          </button>
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

      {/* Manual sends, for labelling a run yourself rather than taking auto-N. */}
      <div className="mb-2 flex items-center gap-2">
        <span className="font-sans">send as</span>
        {["1", "2", "3", "4"].map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => send(label)}
            className="rounded bg-lime-300/30 px-4 py-2"
          >
            {label}
          </button>
        ))}
        <span>{sent}</span>
      </div>

      <textarea
        ref={dumpRef}
        readOnly
        value={dump}
        className="mb-2 h-24 w-full rounded bg-black p-2 font-mono text-[10px] text-lime-300"
      />

      <table className="w-full tabular-nums">
        <thead className="sticky top-0 bg-black text-lime-500">
          <tr>
            <th className="text-left">t</th>
            <th className="text-right">top</th>
            <th className="text-right">Δtop</th>
            <th className="text-right">h</th>
            <th className="text-right">Δh</th>
            <th className="text-right">anchor</th>
            <th className="text-right">Δanc</th>
            <th className="text-right">offTop</th>
            <th className="text-right">band</th>
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
              <td className="text-right">{s.anchorTop}</td>
              <td className="text-right">-</td>
              <td className="text-right">{s.offsetTop}</td>
              <td className="text-right">{s.bandHeight}</td>
              <td className="text-right">{s.scrollY}</td>
            </tr>
          ))}
          {changes.map((c, i) => (
            <tr
              key={i}
              className={
                c.anchorMovedBy !== 0
                  ? "text-fuchsia-300"
                  : c.resizedBy !== 0
                    ? "text-amber-300"
                    : "text-sky-300"
              }
            >
              <td>{c.t}</td>
              <td className="text-right">{c.top}</td>
              <td className="text-right">{c.movedBy > 0 ? `+${c.movedBy}` : c.movedBy}</td>
              <td className="text-right">{c.height}</td>
              <td className="text-right">{c.resizedBy > 0 ? `+${c.resizedBy}` : c.resizedBy}</td>
              <td className="text-right">{c.anchorTop}</td>
              <td className="text-right">
                {c.anchorMovedBy > 0 ? `+${c.anchorMovedBy}` : c.anchorMovedBy}
              </td>
              <td className="text-right">{c.offsetTop}</td>
              <td className="text-right">{c.bandHeight}</td>
              <td className="text-right">{c.scrollY}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 font-sans">
        Pink rows: the library moved. Amber: the card resized. Blue: the card moved.
      </p>
    </div>
  );
}
