"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameDetailCard } from "@/components/video_games/GameDetailCard";
import type { CardOrigin } from "@/components/video_games/LibraryCardContext";
import type { Game } from "@/lib/games";
import { useRectLog } from "@/components/dev/useRectLog";

// The REAL detail card, with fixture data instead of the API.
//
// The card alone does not reproduce the symptom, which rules it out and leaves
// whatever the LIBRARY PAGE has that this one does not. The three switches
// below are those differences, one each, so they can be turned on until the
// card misbehaves rather than guessed at:
//
//   - a long document, and one that has been scrolled
//   - a card that flew in from a case rather than appearing in place
//   - sticky chrome above it
//
// Fixtures throughout, so this needs no API and no login, which is what makes
// it usable on a preview deployment.

const GAME: Game = {
  id: 1,
  name: "The Legend of Zelda: Tears of the Kingdom",
  system: "Switch",
  genres: ["Action-Adventure", "Puzzle"],
  platforms: ["Switch", "Wii U", "PS5", "Xbox Series X", "PC"],
  releaseDate: "2023-05-12",
  imageUrl: "",
  igdbId: null,
  rating: "Great",
  lastPlayed: "2026-08-01",
  currentlyPlaying: false,
  playingSince: "",
  openSessionId: null,
  sessionCount: 3,
};

const NO_HISTORY = { sessions: [], isLoading: false, error: null, refresh: () => {} };

export function KeyboardLab() {
  const [open, setOpen] = useState(true);
  const [tallPage, setTallPage] = useState(false);
  const [flyIn, setFlyIn] = useState(false);
  const [stickyChrome, setStickyChrome] = useState(false);
  const [origin, setOrigin] = useState<CardOrigin | null>(null);
  const caseRef = useRef<HTMLButtonElement>(null);

  // Open from the case's real rect when flying, so useCardFlight runs the same
  // animation it does on a shelf.
  const openCard = () => {
    const rect = flyIn ? caseRef.current?.getBoundingClientRect() : null;
    setOrigin(
      rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null
    );
    setOpen(true);
  };

  // Land partway down the document, which is where you are when you tap a case
  // on a real shelf.
  useEffect(() => {
    if (tallPage) window.scrollTo(0, 900);
  }, [tallPage]);

  // The element the flight animation sizes and moves: the card's outermost box.
  const findCard = useCallback(() => document.querySelector(".game-card-flight"), []);
  const { samples, clear } = useRectLog(findCard);

  // A move is the top edge changing while the height does not; a resize is the
  // height changing. Both look like "the top jumped" and they need different fixes.
  const changes = samples.slice(1).map((s, i) => {
    const previous = samples[i];
    const movedBy = s.top - previous.top;
    const resizedBy = s.height - previous.height;
    return { ...s, movedBy, resizedBy };
  });
  const moves = changes.filter((c) => c.movedBy !== 0 && c.resizedBy === 0).length;
  const resizes = changes.filter((c) => c.resizedBy !== 0).length;

  // The headline. Most rows are frames of a 200ms transition; what matters is
  // where the box came to REST between them, which is one line instead of thirty
  // and is the part worth screenshotting.
  const REST_MS = 150;
  const rests = samples.filter(
    (s, i) => i === samples.length - 1 || samples[i + 1].t - s.t >= REST_MS
  );

  return (
    <>
      {stickyChrome && (
        <div className="sticky top-[var(--nav-offset)] z-40 border-b border-gray-300 bg-white/90 p-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/90">
          Sticky chrome stand-in, like the library header
        </div>
      )}

      {open && (
        <GameDetailCard
          subject={{ kind: "game", game: GAME }}
          canEdit
          existingSystems={["Switch", "PS5", "SNES", "N64", "PC"]}
          onPlayed={() => {}}
          dominantColor={null}
          isDark={false}
          origin={origin}
          caseId={null}
          playHistory={NO_HISTORY}
          onRequestHistory={() => {}}
          onClose={() => setOpen(false)}
        />
      )}

      {/* Sits under the card, and is reachable once the card is closed. */}
      <div className="mx-auto max-w-md space-y-3 p-4 text-sm">
        <h1 className="text-lg font-semibold">Keyboard placement lab</h1>
        <p className="text-gray-600 dark:text-gray-400">
          This is the real detail card with fixture data. Tap the System field, watch the top edge,
          then close the card with the X to read what its box actually did. Development only: a 404
          in production.
        </p>

        <section className="space-y-2 rounded border border-gray-300 p-3 dark:border-gray-600">
          <h2 className="font-medium">What the library page has that this one does not</h2>
          {(
            [
              ["long, scrolled document", tallPage, setTallPage],
              ["card flies in from a case", flyIn, setFlyIn],
              ["sticky chrome above it", stickyChrome, setStickyChrome],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex items-center gap-2">
              <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} />
              {label}
            </label>
          ))}
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Turn these on one at a time, reopening the card each time, until the top edge does the
            thing. Whichever switch flips it is the cause.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            ref={caseRef}
            type="button"
            onClick={openCard}
            className="h-24 w-16 rounded bg-gradient-to-b from-indigo-500 to-indigo-700 text-[10px] text-white"
          >
            open card
          </button>
          <button
            type="button"
            onClick={clear}
            className="rounded border border-gray-300 px-3 py-2 dark:border-gray-600"
          >
            clear log
          </button>
        </div>

        <p className="rounded bg-gray-100 p-2 font-mono text-xs dark:bg-gray-800">
          <span className="font-sans font-medium">came to rest at </span>
          {rests.map((r) => `top ${r.top} h ${r.height}`).join("  \u2192  ") || "nothing yet"}
        </p>
        <p className="font-medium">
          {moves} move{moves === 1 ? "" : "s"}, {resizes} resize{resizes === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          A move is the top edge changing with the height unchanged. A resize is the height
          changing, which pulls a centred card&apos;s top edge down without moving the card. Both
          look the same from the top edge and need different fixes. Screenshot this.
        </p>

        <div className="max-h-[60vh] overflow-auto rounded border border-gray-300 dark:border-gray-600">
          <table className="w-full font-mono text-[11px] tabular-nums">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-1 text-left">t</th>
                <th className="p-1 text-right">top</th>
                <th className="p-1 text-right">Δtop</th>
                <th className="p-1 text-right">height</th>
                <th className="p-1 text-right">Δh</th>
                <th className="p-1 text-right">offTop</th>
                <th className="p-1 text-right">band</th>
                <th className="p-1 text-right">layout</th>
              </tr>
            </thead>
            <tbody>
              {samples.length > 0 && (
                <tr>
                  <td className="p-1">{samples[0].t}</td>
                  <td className="p-1 text-right">{samples[0].top}</td>
                  <td className="p-1 text-right">-</td>
                  <td className="p-1 text-right">{samples[0].height}</td>
                  <td className="p-1 text-right">-</td>
                  <td className="p-1 text-right">{samples[0].offsetTop}</td>
                  <td className="p-1 text-right">{samples[0].bandHeight}</td>
                  <td className="p-1 text-right">{samples[0].layout}</td>
                </tr>
              )}
              {changes.map((c, i) => (
                <tr
                  key={i}
                  className={
                    c.resizedBy !== 0
                      ? "bg-amber-100 dark:bg-amber-900"
                      : "bg-sky-100 dark:bg-sky-900"
                  }
                >
                  <td className="p-1">{c.t}</td>
                  <td className="p-1 text-right">{c.top}</td>
                  <td className="p-1 text-right">{c.movedBy > 0 ? `+${c.movedBy}` : c.movedBy}</td>
                  <td className="p-1 text-right">{c.height}</td>
                  <td className="p-1 text-right">
                    {c.resizedBy > 0 ? `+${c.resizedBy}` : c.resizedBy}
                  </td>
                  <td className="p-1 text-right">{c.offsetTop}</td>
                  <td className="p-1 text-right">{c.bandHeight}</td>
                  <td className="p-1 text-right">{c.layout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Amber rows are resizes, blue rows are pure moves.
        </p>
      </div>

      {tallPage && (
        <div aria-hidden className="space-y-3 p-4 opacity-40">
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} className="flex gap-2 border-b border-gray-300 pb-3 dark:border-gray-700">
              {Array.from({ length: 5 }, (_, j) => (
                <div key={j} className="h-24 w-16 shrink-0 rounded bg-gray-300 dark:bg-gray-700" />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
