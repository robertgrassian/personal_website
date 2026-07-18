// A wood-paneled CRT television that cycles through the currently-playing games
// like flicking TV channels: it auto-advances on a timer, and the viewer can
// advance manually by clicking the screen or jump to a specific game via the
// channel pips beside the "Now playing" label. A brief static/noise burst plays
// between channels.
//
// This is a Client Component ("use client"): the auto-cycle timer, the click
// handlers, and the switching-state that drives the static burst all need React
// state and event handlers, which only run in the browser. (The previous version
// was a zero-JS Server Component — interactivity is the tradeoff.)
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Game } from "@/lib/games";

// How long each channel stays on screen before auto-advancing (ms).
const CHANNEL_INTERVAL_MS = 7000;
// Duration of the static/noise burst shown while switching channels (ms).
const STATIC_BURST_MS = 220;

// "2026-06-30" → "June 30"
function formatDay(iso: string): string {
  const date = new Date(iso + "T00:00:00Z"); // Z = UTC, avoids local-timezone shift
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

type CurrentlyPlayingProps = {
  games: Game[];
};

export function CurrentlyPlaying({ games }: CurrentlyPlayingProps) {
  // Which channel (game) is on screen.
  const [activeIndex, setActiveIndex] = useState(0);
  // True during the static burst between channels.
  const [isSwitching, setIsSwitching] = useState(false);
  // Bumped on every manual advance so the auto-cycle effect re-runs and restarts
  // its countdown — a click shouldn't be followed by an instant auto-flip.
  const [resetToken, setResetToken] = useState(0);
  // Mirrors the OS "reduce motion" setting; when true we skip the static burst
  // and don't auto-cycle (the knob still works).
  const [reducedMotion, setReducedMotion] = useState(false);

  // Refs let cleanup clear a pending burst timeout without it being a render
  // dependency. A ref is a mutable box whose .current survives re-renders.
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasMultiple = games.length > 1;
  // Clamp in case the array shrinks (e.g. a game stopped) while we're mid-cycle.
  const active = games[Math.min(activeIndex, games.length - 1)];

  // Subscribe to the reduced-motion media query and keep `reducedMotion` in sync.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Advance to a specific channel. With motion allowed, flash static first, then
  // swap the picture; reduced motion swaps instantly.
  function goToChannel(nextIndex: number) {
    if (reducedMotion) {
      setActiveIndex(nextIndex);
      return;
    }
    setIsSwitching(true);
    // Clear any in-flight burst so rapid clicks don't stack timeouts.
    if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    burstTimeoutRef.current = setTimeout(() => {
      setActiveIndex(nextIndex);
      setIsSwitching(false);
    }, STATIC_BURST_MS);
  }

  // Manual channel change (clicking the screen or a pip): switch, then restart
  // the auto-cycle countdown so it doesn't immediately flip off the chosen game.
  // Selecting the game already on screen is a no-op — no pointless static burst.
  function selectChannel(nextIndex: number) {
    if (nextIndex === activeIndex) return;
    goToChannel(nextIndex);
    setResetToken((t) => t + 1);
  }

  // Clicking the screen advances to the next channel (modulo wraps to 0).
  function handleScreenClick() {
    selectChannel((activeIndex + 1) % games.length);
  }

  // Auto-cycle. Re-runs whenever the active channel changes or a manual advance
  // bumps resetToken, so the countdown always starts fresh from the current
  // channel. Skipped for a single game and under reduced motion.
  useEffect(() => {
    if (!hasMultiple || reducedMotion) return;
    const id = setInterval(() => {
      goToChannel((activeIndex + 1) % games.length);
    }, CHANNEL_INTERVAL_MS);
    return () => clearInterval(id);
    // goToChannel is recreated each render but stable enough for this closure; we
    // intentionally key off activeIndex + resetToken to restart the timer on every
    // channel change (auto or manual).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, resetToken, hasMultiple, reducedMotion, games.length]);

  // Clear a pending burst timeout on unmount so we never setState afterward.
  useEffect(() => {
    return () => {
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    };
  }, []);

  // Nothing to show if the list is empty. Placed after all hooks so their call
  // order stays stable across renders (Rules of Hooks) — an early return before
  // a hook would break that.
  if (!active) return null;

  const hasImage = active.imageUrl !== "";

  return (
    <section
      aria-label="Currently playing"
      className="mt-10 flex flex-wrap items-end gap-x-10 gap-y-6"
    >
      {/* TV column — w-fit shrinks the wrapper to the TV's width, so the
          plank below spans exactly the TV plus the px-5 inset on each side. */}
      <div className="w-fit">
        <div className="px-5">
          <div className="crt-tv-body">
            {/* is-switching drives the static overlay's visibility via CSS. */}
            <div className={`crt-screen${isSwitching ? " is-switching" : ""}`}>
              {/* Picture layers live in .crt-picture so the power-on animation
                  scales them as one image. Glare stays outside — it's on the
                  glass, visible even while the tube is "off". */}
              <div className="crt-picture">
                {hasImage ? (
                  // Cover crops to fill the screen like live footage. The portrait
                  // art gets cut top/bottom; center 22% keeps the focus on the upper
                  // part of the cover, where key art and titles usually sit.
                  <Image
                    src={active.imageUrl}
                    alt={`${active.name} cover art`}
                    fill
                    className="object-cover [object-position:center_22%]"
                    sizes="168px"
                  />
                ) : (
                  // No cover art: render the title as green OSD text on the dark tube.
                  <p
                    className="absolute inset-0 flex items-center justify-center p-3 text-center
                               font-mono text-xs font-bold text-[#6ee86e]
                               [text-shadow:0_0_6px_rgba(110,232,110,0.9)]"
                  >
                    {active.name}
                  </p>
                )}
                <div className="crt-scanlines" aria-hidden />
                <div className="crt-rollbar" aria-hidden />
                {/* TV snow shown only mid-switch (CSS reveals it via .is-switching). */}
                <div className="crt-static" aria-hidden />
              </div>
              <div className="crt-glare" aria-hidden />
              <span className="crt-osd" aria-hidden>
                ▶ PLAY
              </span>
              {/* Transparent click target covering the whole screen. Only rendered
                  when there's more than one channel — clicking advances to the
                  next game. Sits last so it's on top of the picture/glare/OSD
                  (which are all pointer-events:none), catching every click. */}
              {hasMultiple && (
                <button
                  type="button"
                  onClick={handleScreenClick}
                  aria-label="Next game"
                  title="Next game"
                  className="crt-screen-button"
                />
              )}
            </div>

            {/* Side panel: speaker slats above, dials below. */}
            <div className="flex flex-col justify-between py-1">
              <div className="flex flex-col gap-[3px]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="block h-[2px] w-[22px] rounded-full bg-black/35
                               shadow-[0_1px_0_rgba(255,255,255,0.08)]"
                  />
                ))}
              </div>
              <div className="flex flex-col items-center gap-1.5">
                {/* Both knobs are decorative — channel changes happen by clicking
                    the screen or a channel pip below. */}
                <span className="crt-knob h-[13px] w-[13px] rounded-full" />
                <span className="crt-knob h-[13px] w-[13px] rounded-full" />
              </div>
            </div>
          </div>

          {/* Feet — inset via px-4 so they sit under the cabinet, not its corners. */}
          <div className="flex justify-between px-4">
            <span className="crt-foot h-[7px] w-[18px]" />
            <span className="crt-foot h-[7px] w-[18px]" />
          </div>
        </div>

        {/* The TV's own short plank — same grain treatment as the game shelves.
            mb-2 leaves room for the ::after lip, matching ShelfSection. */}
        <div className="bg-shelf-plank shelf-plank-grain mb-2 h-[15px] rounded-sm" />
      </div>

      {/* Metadata block — wraps below the TV on narrow screens (flex-wrap). */}
      <div className="min-w-0 pb-4">
        <div className="flex items-center gap-3">
          <p className="text-link text-[10px] font-semibold uppercase tracking-[0.18em]">
            <span className="crt-live-dot" aria-hidden />
            Now playing
          </p>
          {/* Channel pips: one dot per game, the active one filled. They track
              position carousel-style AND are clickable — each jumps straight to
              its game. A plain button group (role="group") with aria-pressed on
              each toggle conveys the selected game to assistive tech without the
              tab/tabpanel contract (there's no panel to associate them with). */}
          {hasMultiple && (
            <span
              className="text-link flex items-center gap-2"
              role="group"
              aria-label="Currently playing games"
            >
              {games.map((g, i) => (
                <button
                  key={g.name}
                  type="button"
                  aria-pressed={i === activeIndex}
                  aria-label={g.name}
                  title={g.name}
                  onClick={() => selectChannel(i)}
                  className={`crt-channel-pip${i === activeIndex ? " is-active" : ""}`}
                />
              ))}
            </span>
          )}
        </div>
        <h2 className="text-shelf-text mt-1 text-2xl font-bold">{active.name}</h2>
        <p className="text-shelf-text-muted mt-0.5 text-sm">
          {active.system}
          {active.genres.length > 0 && ` · ${active.genres.join(", ")}`}
        </p>
        {active.playingSince && (
          <p className="text-shelf-label-muted mt-1.5 text-xs italic">
            playing since {formatDay(active.playingSince)}
          </p>
        )}
      </div>
    </section>
  );
}
