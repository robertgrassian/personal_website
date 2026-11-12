import { ModalShell } from "@/components/video_games/ModalShell";
import { caveat } from "@/lib/fonts";
import type { ProduceItem } from "@/lib/produce/browse";
import { MONTH_NAMES, seasonLabel } from "@/lib/produce/season";
import { PacketWindow } from "./SeedPacket";
import { SeasonKey, SeasonStrip } from "./SeasonStrip";

// The site's dialog chrome (backdrop, scroll lock, focus, Escape, safe areas) around one item.
// ModalShell paints with the library's --shelf-* tokens; produce.css points those at the produce
// palette inside [data-app="produce"], so the shared component is reused untouched.
export function ProduceDetail({
  item,
  month,
  regionName,
  glyph,
  onClose,
}: {
  item: ProduceItem;
  month: number;
  regionName: string;
  glyph: string;
  onClose: () => void;
}) {
  return (
    <ModalShell
      label={item.name}
      title={<span className={`${caveat.className} text-3xl`}>{item.name}</span>}
      subtitle={item.aka ? `Also called ${item.aka.join(", ")}` : undefined}
      onClose={onClose}
      error={null}
    >
      <div className="produce-detail" data-category={item.category}>
        <PacketWindow item={item} glyph={glyph} large />
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
