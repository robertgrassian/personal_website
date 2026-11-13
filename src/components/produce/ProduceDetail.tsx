import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModalShell } from "@/components/video_games/ModalShell";
import { caveat } from "@/lib/fonts";
import { signInPath } from "@/lib/nextPath";
import type { ProduceItem } from "@/lib/produce/browse";
import { MONTH_NAMES, seasonLabel } from "@/lib/produce/season";
import { formatEatenOn } from "@/lib/produce/tastings";
import { PacketWindow, TriedStamp } from "./SeedPacket";
import { SeasonKey, SeasonStrip } from "./SeasonStrip";
import type { Tastings } from "./useTastings";

// One control, four faces, chosen by the hook's status. Signed out it is a link, not a button
// that fails: sign-in returns to this page, with no step in between.
function TastingControl({
  slug,
  tracking,
  ring,
}: {
  slug: string;
  tracking: Tastings;
  ring: string;
}) {
  // A Next hook: the current path, which is where sign-in sends the visitor back to.
  const pathname = usePathname();
  const eatenOn = tracking.tastings.get(slug);
  const busy = tracking.pending.has(slug);
  const tried = eatenOn !== undefined;

  // Stamping swaps "I ate this" for "Undo" (and back), which unmounts the button that was just
  // pressed. Focus would fall to <body>, behind the open dialog, so it is handed to the button
  // that took its place. Only after a press here: stamps arriving from the read must not steal
  // focus.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (pressed.current) buttonRef.current?.focus();
  }, [tried]);
  const press = (act: (slug: string) => void) => {
    pressed.current = true;
    act(slug);
  };

  if (tracking.status === "signed-out") {
    return (
      <Link href={signInPath(pathname)} className="produce-ate">
        Sign in to keep track
      </Link>
    );
  }
  if (tracking.status === "error") {
    return (
      <p className="text-sm produce-soft">
        Couldn&apos;t load what you&apos;ve tried. Refresh the page to try again.
      </p>
    );
  }
  if (tried) {
    return (
      <div className="produce-tried">
        <TriedStamp ring={ring} />
        <p className="text-sm">This year, on {formatEatenOn(eatenOn)}.</p>
        {/* aria-disabled, not disabled, on both buttons: a disabled button cannot hold focus, and
            each is focused the moment its own write starts. The hook ignores a press while one
            is in flight. */}
        <button
          ref={buttonRef}
          type="button"
          className="produce-back"
          aria-disabled={busy}
          onClick={() => press(tracking.unmark)}
        >
          Undo
        </button>
      </div>
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className="produce-ate"
      // Inert while the read is out: a tap now would write over a row not yet seen.
      aria-disabled={tracking.status === "loading" || busy}
      onClick={() => {
        if (tracking.status === "ready") press(tracking.mark);
      }}
    >
      I ate this
    </button>
  );
}

// The site's dialog chrome (backdrop, scroll lock, focus, Escape, safe areas) around one item.
// ModalShell paints with the library's --shelf-* tokens; produce.css points those at the produce
// palette inside [data-app="produce"], so the shared component is reused untouched.
export function ProduceDetail({
  item,
  month,
  regionName,
  glyph,
  ring,
  tracking,
  onClose,
}: {
  item: ProduceItem;
  month: number;
  regionName: string;
  glyph: string;
  ring: string;
  tracking: Tastings;
  onClose: () => void;
}) {
  return (
    <ModalShell
      label={item.name}
      title={<span className={`${caveat.className} text-3xl`}>{item.name}</span>}
      subtitle={item.aka ? `Also called ${item.aka.join(", ")}` : undefined}
      onClose={onClose}
      error={tracking.error}
    >
      <div className="produce-detail" data-category={item.category}>
        <PacketWindow item={item} glyph={glyph} large />
        <div className="produce-tracking">
          <TastingControl slug={item.slug} tracking={tracking} ring={ring} />
        </div>
        {item.blurb && <p className="mt-4 text-sm leading-relaxed">{item.blurb}</p>}
        <h3 className="produce-detail-heading">Its year in {regionName}</h3>
        <SeasonStrip season={item.season} month={month} labelled />
        {/* The strip's own label is for screen readers; sighted readers get the same sentence. */}
        <p className="mt-3 text-sm leading-relaxed" aria-hidden="true">
          {seasonLabel(item.season)}.
        </p>
        <p className="mt-1 text-xs produce-soft">The tick marks {MONTH_NAMES[month]}.</p>
        <SeasonKey />
      </div>
    </ModalShell>
  );
}
