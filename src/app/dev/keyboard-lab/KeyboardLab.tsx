"use client";

import { useCallback, useState } from "react";
import { GameDetailCard } from "@/components/video_games/GameDetailCard";
import type { Game } from "@/lib/games";
import { useRectLog } from "./useRectLog";

// The REAL detail card, with fixture data instead of the API.
//
// Earlier versions of this page used a hand-made stand-in, which was a mistake:
// it could not show a symptom that lives in the card itself rather than in the
// insets fed to it. Everything here is the shipped component tree, so what
// happens on this page is what happens in the library.

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
      {open && (
        <GameDetailCard
          subject={{ kind: "game", game: GAME }}
          canEdit
          existingSystems={["Switch", "PS5", "SNES", "N64", "PC"]}
          onPlayed={() => {}}
          dominantColor={null}
          isDark={false}
          origin={null}
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded border border-gray-300 px-3 py-2 dark:border-gray-600"
          >
            reopen card
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
    </>
  );
}
