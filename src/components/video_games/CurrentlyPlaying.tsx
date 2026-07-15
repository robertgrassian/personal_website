// A wood-paneled CRT television showing the currently-playing game's cover,
// sitting on its own short shelf plank between the page header and the tabs.
// Server Component: no hooks or event handlers — all motion is CSS-driven,
// so this renders entirely on the server and ships no JS to the client.

import Image from "next/image";
import type { Game } from "@/lib/games";

// "2026-06-30" → "June 30"
function formatDay(iso: string): string {
  const date = new Date(iso + "T00:00:00Z"); // Z = UTC, avoids local-timezone shift
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

type CurrentlyPlayingProps = {
  game: Game;
};

export function CurrentlyPlaying({ game }: CurrentlyPlayingProps) {
  const hasImage = game.imageUrl !== "";

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
            <div className="crt-screen">
              {/* Picture layers live in .crt-picture so the power-on animation
                  scales them as one image. Glare stays outside — it's on the
                  glass, visible even while the tube is "off". */}
              <div className="crt-picture">
                {hasImage ? (
                  // Cover crops to fill the screen like live footage. The portrait
                  // art gets cut top/bottom; center 22% keeps the focus on the upper
                  // part of the cover, where key art and titles usually sit.
                  <Image
                    src={game.imageUrl}
                    alt={`${game.name} cover art`}
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
                    {game.name}
                  </p>
                )}
                <div className="crt-scanlines" aria-hidden />
                <div className="crt-rollbar" aria-hidden />
              </div>
              <div className="crt-glare" aria-hidden />
              <span className="crt-osd" aria-hidden>
                ▶ PLAY
              </span>
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
        <p className="text-link text-[10px] font-semibold uppercase tracking-[0.18em]">
          <span className="crt-live-dot" aria-hidden />
          Now playing
        </p>
        <h2 className="text-shelf-text mt-1 text-2xl font-bold">{game.name}</h2>
        <p className="text-shelf-text-muted mt-0.5 text-sm">
          {game.system}
          {game.genres.length > 0 && ` · ${game.genres.join(", ")}`}
        </p>
        {game.lastPlayed && (
          <p className="text-shelf-label-muted mt-1.5 text-xs italic">
            last played {formatDay(game.lastPlayed)}
          </p>
        )}
      </div>
    </section>
  );
}
