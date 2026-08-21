"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameDetailCard } from "@/components/video_games/GameDetailCard";
import type { Game } from "@/lib/games";

// Everything this page measures, in one flat object so the min/max tracker can
// walk it generically instead of naming each field twice.
type Reading = {
  layout: number;
  innerHeight: number;
  visualHeight: number;
  visualOffsetTop: number;
  hiddenTop: number;
  hiddenBottom: number;
  lvh: number;
  svh: number;
  dvh: number;
  safeTop: number;
  safeBottom: number;
};

type Extremes = Record<string, { min: number; max: number }>;

const GUTTER = 12; // --modal-gutter at its mobile value, 0.75rem

const LONG_TITLE = "The Legend of Zelda: Tears of the Kingdom";
const SHORT_TITLE = "Hades";

function mockGame(name: string): Game {
  return {
    id: -1,
    name,
    system: "Nintendo Switch",
    genres: ["Action-Adventure", "Puzzle", "Open World"],
    platforms: ["Nintendo Switch", "Wii U"],
    releaseDate: "2023-05-12",
    imageUrl: "",
    igdbId: null,
    rating: "Great",
    lastPlayed: "2024-01-02",
    currentlyPlaying: false,
    playingSince: "",
    openSessionId: null,
    sessionCount: 3,
  };
}

export function ViewportDebug() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [extremes, setExtremes] = useState<Extremes>({});
  const [cardOpen, setCardOpen] = useState(false);
  const [longTitle, setLongTitle] = useState(true);
  const [canEdit, setCanEdit] = useState(true);
  const [card, setCard] = useState<{ w: number; h: number; hidden: number } | null>(null);
  // Starts true so the server's HTML and the first client render match. Reading
  // window during render instead would differ between the two and React would
  // throw the tree away and re-render it.
  const [supported, setSupported] = useState(true);

  // Probe elements: the only way to read what 100lvh/100svh/100dvh and the
  // safe-area insets actually resolve to on this device. A custom property
  // holding env() resolves where it is USED, so reading --safe-top off :root
  // gives back the literal env() text rather than a number.
  const lvhRef = useRef<HTMLDivElement>(null);
  const svhRef = useRef<HTMLDivElement>(null);
  const dvhRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const viewport = window.visualViewport;
    const layout = document.documentElement.clientHeight;
    const safe = safeRef.current ? getComputedStyle(safeRef.current) : null;

    const next: Reading = {
      layout,
      innerHeight: window.innerHeight,
      visualHeight: viewport ? Math.round(viewport.height) : 0,
      visualOffsetTop: viewport ? Math.round(viewport.offsetTop) : 0,
      // Exactly the formula in useVisibleViewportInsets, so this page reports
      // what the real dialog would act on rather than an approximation.
      hiddenTop: viewport ? Math.max(0, Math.round(viewport.offsetTop)) : 0,
      hiddenBottom: viewport
        ? Math.max(0, Math.round(layout - viewport.offsetTop - viewport.height))
        : 0,
      lvh: lvhRef.current?.offsetHeight ?? 0,
      svh: svhRef.current?.offsetHeight ?? 0,
      dvh: dvhRef.current?.offsetHeight ?? 0,
      safeTop: safe ? Math.round(parseFloat(safe.paddingTop)) : 0,
      safeBottom: safe ? Math.round(parseFloat(safe.paddingBottom)) : 0,
    };

    setReading((previous) => {
      const same =
        previous && (Object.keys(next) as (keyof Reading)[]).every((k) => previous[k] === next[k]);
      return same ? previous : next;
    });
    setExtremes((previous) => {
      const merged: Extremes = { ...previous };
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const seen = merged[key];
        if (!seen) {
          merged[key] = { min: value, max: value };
          changed = true;
        } else if (value < seen.min || value > seen.max) {
          merged[key] = { min: Math.min(seen.min, value), max: Math.max(seen.max, value) };
          changed = true;
        }
      }
      return changed ? merged : previous;
    });

    const flight = document.querySelector<HTMLElement>(".game-card-flight");
    const scroller = flight?.querySelector<HTMLElement>(".overflow-y-auto");
    if (flight && scroller) {
      const rect = flight.getBoundingClientRect();
      setCard({
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        hidden: Math.max(
          0,
          scroller.scrollHeight - Math.round(scroller.getBoundingClientRect().height)
        ),
      });
    } else {
      setCard(null);
    }
  }, []);

  useEffect(() => {
    measure();
    const viewport = window.visualViewport;
    setSupported(!!viewport);
    // Poll as well as listen. The URL bar sliding in and out is animated, and
    // the extremes worth catching happen mid-animation where events are sparse.
    const timer = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const chrome = reading ? reading.lvh - reading.svh : 0;

  // The question this page exists to answer: when the browser is covering part
  // of the screen, does visualViewport say WHICH edge?
  let verdict = "Measuring...";
  let verdictDetail = "";
  if (reading) {
    if (chrome <= 1) {
      verdict = "No retractable browser UI";
      verdictDetail =
        "100lvh and 100svh are the same here, so the browser is not overlaying anything. Scroll this page on a phone to make the URL bar move, then read this again.";
    } else if (reading.hiddenTop > 0 && reading.hiddenBottom > 0) {
      verdict = "Both edges covered";
      verdictDetail = "Unusual. Probably a software keyboard is open as well.";
    } else if (reading.hiddenTop > 0) {
      verdict = "Browser UI reported at the TOP";
      verdictDetail =
        "visualViewport reports the covered strip, and it is above the card. Reserving space at the bottom (what max-h-[100svh] does) is the wrong edge here.";
    } else if (reading.hiddenBottom > 0) {
      verdict = "Browser UI reported at the BOTTOM";
      verdictDetail =
        "visualViewport reports the covered strip, and it is below the card. max-h-[100svh] reserves the same pixels a second time.";
    } else {
      verdict = "Browser UI NOT reported by visualViewport";
      verdictDetail =
        "The browser is overlaying " +
        chrome +
        "px (100lvh minus 100svh) but both hidden insets read 0. So the padding cannot place the card on its own here, and max-h-[100svh] is still carrying the fix.";
    }
  }

  // What ModalFrame resolves to right now, reproduced from the live numbers.
  const frameHeight = reading ? Math.min(reading.layout, reading.svh) : 0;
  const padTop = reading ? GUTTER + Math.max(reading.safeTop, reading.hiddenTop) : 0;
  const padBottom = reading ? GUTTER + Math.max(reading.safeBottom, reading.hiddenBottom) : 0;
  const usable = Math.max(0, frameHeight - padTop - padBottom);
  // The visible band is the layout viewport minus whatever the browser covers.
  const visible = reading ? reading.layout - reading.hiddenTop - reading.hiddenBottom : 0;
  const ideal = Math.max(0, Math.min(visible, reading?.svh ?? 0) - 2 * GUTTER);
  const lost = Math.max(0, ideal - usable);

  const rows: [string, keyof Reading][] = [
    ["documentElement.clientHeight (what fixed inset-0 spans)", "layout"],
    ["window.innerHeight", "innerHeight"],
    ["visualViewport.height", "visualHeight"],
    ["visualViewport.offsetTop", "visualOffsetTop"],
    ["hidden.top (as the hook computes it)", "hiddenTop"],
    ["hidden.bottom (as the hook computes it)", "hiddenBottom"],
    ["100lvh", "lvh"],
    ["100svh", "svh"],
    ["100dvh", "dvh"],
    ["safe-area-inset-top", "safeTop"],
    ["safe-area-inset-bottom", "safeBottom"],
  ];

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-body shelf-theme">
      {/* Off-screen probes. fixed so they never affect document flow, and
          width 0 so a 100lvh box cannot create a scrollbar of its own. */}
      <div aria-hidden className="invisible pointer-events-none fixed left-0 top-0 w-0">
        <div ref={lvhRef} style={{ height: "100lvh" }} />
        <div ref={svhRef} style={{ height: "100svh" }} />
        <div ref={dvhRef} style={{ height: "100dvh" }} />
        <div
          ref={safeRef}
          style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}
        />
      </div>

      <h1 className="text-xl font-bold text-foreground">Viewport debug</h1>
      <p className="mt-2 max-w-prose text-sm">
        Scroll down and back up so the URL bar hides and reappears, then read the numbers. The min
        and max columns keep the extremes so you do not have to read them mid-scroll.
      </p>

      <section
        className={`mt-5 rounded-lg border p-4 ${
          lost > 0 ? "border-amber-500/60 bg-amber-500/10" : "border-divider"
        }`}
      >
        <h2 className="text-base font-semibold text-foreground">{verdict}</h2>
        {verdictDetail && <p className="mt-1 text-sm">{verdictDetail}</p>}
        {!supported && (
          <p className="mt-2 text-sm font-medium">
            visualViewport is unsupported in this browser, so both insets are always 0.
          </p>
        )}
      </section>

      <section className="mt-5">
        <h2 className="text-base font-semibold text-foreground">Live numbers</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2 font-semibold">Metric</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Now</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Min</th>
                <th className="py-1.5 text-right font-semibold">Max</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key]) => (
                <tr key={key} className="border-b border-divider/50">
                  <td className="py-1.5 pr-2">{label}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">
                    {reading ? reading[key] : "?"}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-muted">
                    {extremes[key]?.min ?? "?"}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-muted">
                    {extremes[key]?.max ?? "?"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => setExtremes({})}
          className="mt-3 rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground"
        >
          Reset min and max
        </button>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-foreground">What ModalFrame works out</h2>
        <dl className="mt-2 space-y-1 text-sm">
          {[
            ["Browser UI height (100lvh - 100svh)", `${chrome}px`],
            ["Frame height (capped by max-h-[100svh])", `${frameHeight}px`],
            ["Padding top / bottom", `${padTop}px / ${padBottom}px`],
            ["Usable height for the card", `${usable}px`],
            ["Height the visible band would allow", `${ideal}px`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt>{label}</dt>
              <dd className="font-mono tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-divider pt-1 font-semibold">
            <dt>Height lost to double reserving</dt>
            <dd className="font-mono tabular-nums text-foreground">{lost}px</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-foreground">Detail card</h2>
        <p className="mt-1 max-w-prose text-sm">
          A fake game, so the owner edit fields render without signing in. Saving will not work.
          Opening the card locks page scrolling, so set the URL bar how you want it first.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCardOpen(true)}
            className="rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground"
          >
            Open card
          </button>
          <button
            type="button"
            onClick={() => setLongTitle((v) => !v)}
            className="rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground"
          >
            Title: {longTitle ? "long" : "short"}
          </button>
          <button
            type="button"
            onClick={() => setCanEdit((v) => !v)}
            className="rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground"
          >
            {canEdit ? "Owner" : "Viewer"}
          </button>
        </div>
        {card && (
          <dl className="mt-3 space-y-1 text-sm">
            {[
              ["Card size", `${card.w} x ${card.h}`],
              ["Aspect (a real case is 1.50)", (card.h / card.w).toFixed(2)],
              ["Content below the fold", `${card.hidden}px`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt>{label}</dt>
                <dd className="font-mono tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Filler, so the page is tall enough to scroll. Retracting the URL bar
          is the whole experiment and it needs somewhere to scroll to. */}
      <div className="mt-8 space-y-3 text-sm text-subtle" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <p key={i}>Scroll filler line {i + 1}, so the URL bar has room to hide.</p>
        ))}
      </div>

      {cardOpen && (
        <GameDetailCard
          subject={{ kind: "game", game: mockGame(longTitle ? LONG_TITLE : SHORT_TITLE) }}
          canEdit={canEdit}
          existingSystems={["Nintendo Switch", "PS5", "SNES"]}
          onPlayed={() => {}}
          dominantColor="#3b5a7a"
          isDark
          origin={null}
          caseId={null}
          onClose={() => setCardOpen(false)}
        />
      )}
    </main>
  );
}
