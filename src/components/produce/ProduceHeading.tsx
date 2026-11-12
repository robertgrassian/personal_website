import { caveat } from "@/lib/fonts";
import type { ProduceSketch } from "@/lib/produce/sketch";
import { UNDERLINE_VIEWBOX } from "@/lib/produce/sketchBoxes";
import { RoughFrame } from "./RoughFrame";

export function ProduceHeading({ sketch }: { sketch: ProduceSketch }) {
  return (
    <h1 className={`produce-title ${caveat.className}`}>
      What&apos;s in season
      <RoughFrame d={sketch.underline} viewBox={UNDERLINE_VIEWBOX} className="produce-underline" />
    </h1>
  );
}
