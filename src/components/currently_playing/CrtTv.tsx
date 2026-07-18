// A from-scratch, photorealistic CRT television for the /currently_playing route.
// Unlike the stylized wood-cabinet TV on the game library page
// (components/video_games/CurrentlyPlaying.tsx), this is a '90s black-plastic set
// rendered entirely in CSS/SVG (see app/currently_playing/crt.css). It cycles
// through the currently-playing games like TV channels and, when nothing is
// playing, sits on a permanent "NO SIGNAL" snow screen so the page is never blank.
//
// Client Component ("use client"): the auto-cycle timer, click handlers, and the
// switching state that drives the static burst all need browser-only React state
// and effects. The parent page (a Server Component) fetches the data and passes
// it in as a plain array.
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Game } from "@/lib/games";

// How long each channel stays on screen before auto-advancing (ms).
const CHANNEL_INTERVAL_MS = 7000;
// Duration of the static/noise burst shown while switching channels (ms).
const STATIC_BURST_MS = 220;

// "2026-07-13" → "July 13". Uses UTC so the date never shifts by a timezone.
function formatDay(iso: string): string {
  const date = new Date(iso + "T00:00:00Z");
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

// Pad a 1-based channel index to two digits for the OSD readout: 1 → "01".
function channelLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

type CrtTvProps = {
  games: Game[];
};

export function CrtTv({ games }: CrtTvProps) {
  // Which channel (game) is on screen.
  const [activeIndex, setActiveIndex] = useState(0);
  // True during the static burst between channels — drives the `.is-switching` class.
  const [isSwitching, setIsSwitching] = useState(false);
  // Bumped on every manual advance so the auto-cycle effect re-runs and restarts
  // its countdown — a click shouldn't be followed immediately by an auto-flip.
  const [resetToken, setResetToken] = useState(0);
  // Mirrors the OS "reduce motion" setting; when true we skip the static burst
  // and don't auto-cycle (the pips/screen click still work, they just swap instantly).
  const [reducedMotion, setReducedMotion] = useState(false);

  // A ref is a mutable box whose `.current` survives re-renders without causing
  // one. We hold the pending burst timeout here so cleanup can clear it.
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasGames = games.length > 0;
  const hasMultiple = games.length > 1;
  // Clamp in case the array shrinks (a game stopped) while we're mid-cycle.
  // `active` is undefined when there are no games — the NO SIGNAL branch handles that.
  const active = hasGames ? games[Math.min(activeIndex, games.length - 1)] : undefined;

  // Keep `reducedMotion` in sync with the OS media query.
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Advance to a specific channel. With motion allowed, flash static first then
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

  // Manual channel change (screen click or a pip): switch, then restart the
  // auto-cycle countdown. Selecting the channel already on screen is a no-op.
  function selectChannel(nextIndex: number) {
    if (nextIndex === activeIndex) return;
    goToChannel(nextIndex);
    setResetToken((t) => t + 1);
  }

  // Clicking the screen advances to the next channel (wraps back to 0).
  function handleScreenClick() {
    selectChannel((activeIndex + 1) % games.length);
  }

  // Auto-cycle. Re-runs whenever the active channel changes or a manual advance
  // bumps resetToken, so the countdown always starts fresh. Skipped for a single
  // game and under reduced motion.
  useEffect(() => {
    if (!hasMultiple || reducedMotion) return;
    const id = setInterval(() => {
      goToChannel((activeIndex + 1) % games.length);
    }, CHANNEL_INTERVAL_MS);
    return () => clearInterval(id);
    // We intentionally key off activeIndex + resetToken to restart the timer on
    // every channel change (auto or manual); goToChannel is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, resetToken, hasMultiple, reducedMotion, games.length]);

  // Clear any pending burst timeout on unmount so we never setState afterward.
  useEffect(() => {
    return () => {
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
    };
  }, []);

  // Screen state classes. `is-no-signal` keeps the snow running permanently;
  // `is-switching` flashes it briefly during a channel change.
  const screenClass = [
    "pcrt-screen",
    !hasGames ? "is-no-signal" : "",
    isSwitching ? "is-switching" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const hasImage = active !== undefined && active.imageUrl !== "";

  return (
    <section aria-label="Now playing" className="pcrt-stage">
      {/* Curved-glass filter. A "normal map" — red = a left→right ramp, green =
          a top→bottom ramp — is built from two gradient feImages added together
          with feComposite, then fed to feDisplacementMap, which pushes the
          picture's edge pixels outward into a convex tube bulge. Hidden: it only
          supplies the filter referenced by .pcrt-picture in CSS. */}
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <filter id="pcrt-barrel" colorInterpolationFilters="sRGB">
          <feImage
            preserveAspectRatio="none"
            x="0"
            y="0"
            width="100%"
            height="100%"
            href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%23000'/%3E%3Cstop offset='1' stop-color='%23f00'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' fill='url(%23g)'/%3E%3C/svg%3E"
            result="rx"
          />
          <feImage
            preserveAspectRatio="none"
            x="0"
            y="0"
            width="100%"
            height="100%"
            href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23000'/%3E%3Cstop offset='1' stop-color='%230f0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' fill='url(%23g)'/%3E%3C/svg%3E"
            result="gy"
          />
          <feComposite
            in="rx"
            in2="gy"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      {/* Molded light-grey plastic cabinet, Panasonic-style: one continuous
          front panel with the tube recessed into it and the controls on the wide
          lower bezel — modeled on the reference set. */}
      <div className="pcrt-tv">
        <div className="pcrt-front">
          {/* Thin near-black tube mask around the curved glass. */}
          <div className="pcrt-screen-recess">
            <div className={screenClass}>
              {/* .pcrt-picture holds the image + phosphor layers so the power-on
                  animation and screen curvature transform them as one surface. */}
              <div className="pcrt-picture">
                {hasImage ? (
                  // Cover crops to fill the 4:3 tube like live footage. center 22%
                  // keeps the focus near the top of the portrait cover, where key
                  // art and titles usually sit.
                  <Image
                    src={active!.imageUrl}
                    alt={`${active!.name} cover art`}
                    fill
                    className="object-cover [object-position:center_22%]"
                    sizes="(max-width: 520px) 88vw, 420px"
                    priority
                  />
                ) : hasGames ? (
                  // A playing game with no cover art: title as green OSD text on
                  // the dark tube. (NO SIGNAL shows nothing here — the snow overlay
                  // and the OSD badge carry the message.)
                  <p className="pcrt-noise-text">{active!.name}</p>
                ) : null}
                {/* RGB aperture-grille mask — the phosphor stripe look. */}
                <div className="pcrt-phosphor" aria-hidden />
                <div className="pcrt-scanlines" aria-hidden />
                <div className="pcrt-rollbar" aria-hidden />
              </div>
              {/* Snow overlay — permanent when NO SIGNAL, a burst while switching. */}
              <div className="pcrt-static" aria-hidden />
              {/* Corner darkening + curved-glass reflection sit on the glass, above
                  the picture, so they show even mid-power-on. */}
              <div className="pcrt-vignette" aria-hidden />
              <div className="pcrt-glare" aria-hidden />

              {/* On-screen display: play state (top-left) + channel (top-right). */}
              <span className="pcrt-osd" aria-hidden>
                {hasGames ? "▶ PLAY" : "■ NO SIGNAL"}
              </span>
              {hasMultiple && (
                <span className="pcrt-osd pcrt-osd--channel" aria-hidden>
                  CH {channelLabel(activeIndex)}
                </span>
              )}

              {/* Transparent full-screen click target — advances to the next
                  channel. Rendered last so it sits above the (pointer-events:none)
                  picture/glare/OSD and catches every click. Only when >1 game. */}
              {hasMultiple && (
                <button
                  type="button"
                  onClick={handleScreenClick}
                  aria-label="Next game"
                  title="Next game"
                  className="pcrt-screen-button"
                />
              )}
            </div>
          </div>

          {/* Lower bezel: a fine-mesh speaker grille on each side of a labeled
              control cluster — small round buttons plus the front composite A/V
              inputs, matching the reference. Decorative — channels change by
              clicking the screen or the pips below. */}
          <div className="pcrt-controls" aria-hidden>
            <span className="pcrt-grille" />
            <div className="pcrt-buttons">
              <div className="pcrt-btn-group">
                <span className="pcrt-label">POWER</span>
                <div className="pcrt-btn-row">
                  <span className={`pcrt-led${hasGames ? " is-on" : ""}`} />
                  <span className="pcrt-button" />
                </div>
              </div>
              <div className="pcrt-btn-group">
                <span className="pcrt-label">VOLUME</span>
                <div className="pcrt-btn-row">
                  <span className="pcrt-button" />
                  <span className="pcrt-button" />
                </div>
              </div>
              <div className="pcrt-btn-group">
                <span className="pcrt-label">CHANNEL</span>
                <div className="pcrt-btn-row">
                  <span className="pcrt-button" />
                  <span className="pcrt-button" />
                </div>
              </div>
              <div className="pcrt-btn-group">
                <span className="pcrt-label">TV/VIDEO</span>
                <div className="pcrt-btn-row">
                  <span className="pcrt-button" />
                </div>
              </div>
              {/* Front composite A/V inputs: yellow video, white + red audio. */}
              <div className="pcrt-btn-group pcrt-av">
                <span className="pcrt-label">VIDEO · L-AUDIO-R</span>
                <div className="pcrt-btn-row">
                  <span className="pcrt-jack pcrt-jack--yellow" />
                  <span className="pcrt-jack pcrt-jack--white" />
                  <span className="pcrt-jack pcrt-jack--red" />
                </div>
              </div>
            </div>
            <span className="pcrt-grille" />
          </div>
        </div>
      </div>

      {/* Metadata below the set. */}
      <div className="pcrt-meta">
        <div className="flex items-center gap-3">
          <p className="text-link text-[11px] font-semibold uppercase tracking-[0.18em]">
            <span className={`pcrt-live-dot${hasGames ? " is-live" : ""}`} aria-hidden />
            {hasGames ? "Now playing" : "No signal"}
          </p>
          {/* Channel pips: one clickable dot per game, the active one filled. A
              plain button group (role="group", aria-pressed) conveys the selected
              game to assistive tech. */}
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
                  className={`pcrt-channel-pip${i === activeIndex ? " is-active" : ""}`}
                />
              ))}
            </span>
          )}
        </div>

        {hasGames ? (
          <>
            <h2 className="mt-1 text-2xl font-bold text-foreground">{active!.name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {active!.system}
              {active!.genres.length > 0 && ` · ${active!.genres.join(", ")}`}
            </p>
            {active!.playingSince && (
              <p className="mt-1.5 text-xs italic text-subtle">
                playing since {formatDay(active!.playingSince)}
              </p>
            )}
          </>
        ) : (
          <>
            <h2 className="mt-1 text-2xl font-bold text-foreground">Nothing playing</h2>
            <p className="mt-0.5 text-sm text-muted">
              Nothing&rsquo;s on right now — check back when a game is in progress.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
