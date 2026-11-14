import type { CSSProperties } from "react";
import Image from "next/image";
import { caveat } from "@/lib/fonts";
import type { ProduceItem } from "@/lib/produce/browse";
import { CATEGORY_LABELS } from "@/lib/produce/categories";
import type { Period } from "@/lib/produce/season";
import type { ProduceSketch } from "@/lib/produce/sketch";
import { BORDER_VIEWBOX, CIRCLE_VIEWBOX } from "@/lib/produce/sketchBoxes";
import { DRAWINGS } from "@/lib/produce/drawings";
import { Drawing } from "./Drawing";
import { RoughFrame, RoughGlyph } from "./RoughFrame";
import { SeasonStrip } from "./SeasonStrip";

// A small tilt per border variant, so the grid reads as packets pinned up by hand. Keyed off the
// same hash as the border, so a card's tilt and outline always travel together.
const TILTS = [-1.4, 0.9, -0.6, 1.3, -1, 0.5];

// The packet's picture, best first: a real plate, then the drawn shape for the item, then (only for
// an item the drawings do not cover) its category glyph on a tint.
export function PacketWindow({
  item,
  glyph,
  large = false,
}: {
  item: ProduceItem;
  glyph: string;
  large?: boolean;
}) {
  const drawn = !item.art && item.slug in DRAWINGS;
  const modifier = item.art ? "produce-window--art" : drawn ? "produce-window--drawn" : "";
  return (
    <span className={`produce-window ${large ? "produce-window--large" : ""} ${modifier}`}>
      {item.art ? (
        <Image
          src={item.art}
          alt=""
          fill
          sizes={large ? "20rem" : "10rem"}
          className="produce-art object-contain p-2"
        />
      ) : drawn ? (
        <Drawing slug={item.slug} />
      ) : (
        <RoughGlyph d={glyph} />
      )}
    </span>
  );
}

// The ink stamp on something already eaten this year. Reuses the month scrubber's rough circle as
// its ring, so it costs no new path. The word is real text: it is what a screen reader hears.
export function TriedStamp({ ring, className = "" }: { ring: string; className?: string }) {
  return (
    <span className={`produce-stamp ${caveat.className} ${className}`}>
      <RoughFrame d={ring} viewBox={CIRCLE_VIEWBOX} />
      Tried
    </span>
  );
}

export function SeedPacket({
  item,
  period,
  note,
  sketch,
  tried,
  onOpen,
}: {
  item: ProduceItem;
  period: Period;
  // "Ends in October" and the like on a season view, else null.
  note: string | null;
  tried: boolean;
  // Type-only import: erased at compile time, so the server-only module never reaches the client.
  sketch: ProduceSketch;
  onOpen: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      className="produce-packet"
      data-category={item.category}
      style={{ "--tilt": `${TILTS[item.variant % TILTS.length]}deg` } as CSSProperties}
      onClick={() => onOpen(item.slug)}
      aria-haspopup="dialog"
    >
      <RoughFrame d={sketch.borders[item.variant]} viewBox={BORDER_VIEWBOX} />
      <span className="produce-packet-flap" aria-hidden="true">
        {CATEGORY_LABELS[item.category]}
      </span>
      <PacketWindow item={item} glyph={sketch.glyphs[item.category]} />
      {tried && <TriedStamp ring={sketch.circle} className="produce-stamp--card" />}
      <span className={`produce-packet-name ${caveat.className}`}>{item.name}</span>
      {note !== null && <span className="produce-packet-ends">{note}</span>}
      <SeasonStrip season={item.season} period={period} />
    </button>
  );
}
