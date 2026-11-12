import type { CSSProperties } from "react";
import Image from "next/image";
import { caveat } from "@/lib/fonts";
import type { ProduceItem } from "@/lib/produce/browse";
import { CATEGORY_LABELS } from "@/lib/produce/categories";
import type { ProduceSketch } from "@/lib/produce/sketch";
import { BORDER_VIEWBOX } from "@/lib/produce/sketchBoxes";
import { RoughFrame, RoughGlyph } from "./RoughFrame";
import { SeasonStrip } from "./SeasonStrip";

// A small tilt per border variant, so the grid reads as packets pinned up by hand. Keyed off the
// same hash as the border, so a card's tilt and outline always travel together.
const TILTS = [-1.4, 0.9, -0.6, 1.3, -1, 0.5];

// The packet's picture: the item's art when it has some, otherwise its category glyph on a tint.
export function PacketWindow({
  item,
  glyph,
  large = false,
}: {
  item: ProduceItem;
  glyph: string;
  large?: boolean;
}) {
  return (
    <span className={`produce-window ${large ? "produce-window--large" : ""}`}>
      {item.art ? (
        <Image
          src={item.art}
          alt=""
          fill
          sizes={large ? "20rem" : "10rem"}
          className="object-contain p-2"
        />
      ) : (
        <RoughGlyph d={glyph} />
      )}
    </span>
  );
}

export function SeedPacket({
  item,
  month,
  sketch,
  onOpen,
}: {
  item: ProduceItem;
  month: number;
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
      <span className={`produce-packet-name ${caveat.className}`}>{item.name}</span>
      <SeasonStrip season={item.season} month={month} />
    </button>
  );
}
