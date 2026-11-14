import { caveat } from "@/lib/fonts";
import {
  MONTH_NAMES,
  SEASONS,
  SEASON_IDS,
  seasonOf,
  type SeasonId,
  type View,
} from "@/lib/produce/season";
import type { ProduceSketch } from "@/lib/produce/sketch";
import { CIRCLE_VIEWBOX } from "@/lib/produce/sketchBoxes";
import { RoughFrame, RoughGlyph } from "./RoughFrame";

// "Sep to Nov": short enough to sit inside the loop round the selected season.
function shortRange(months: readonly number[]): string {
  const abbr = (m: number) => MONTH_NAMES[m].slice(0, 3);
  return `${abbr(months[0])} to ${abbr(months[months.length - 1])}`;
}

// The page opens on a season; a month is the finer grain underneath it. Stateless: the view lives
// in ProduceBrowser, which also decides what "now" is.
export function PeriodPicker({
  view,
  nowMonth,
  sketch,
  onSeason,
  onMonth,
}: {
  view: View;
  nowMonth: number;
  sketch: ProduceSketch;
  onSeason: (season: SeasonId) => void;
  // null is the whole season.
  onMonth: (month: number | null) => void;
}) {
  const nowSeason = seasonOf(nowMonth);
  const { label, months } = SEASONS[view.season];

  return (
    <>
      <ul className="produce-seasons" aria-label="Season">
        {SEASON_IDS.map((id) => {
          const selected = id === view.season;
          return (
            <li key={id}>
              <button
                type="button"
                className="produce-season"
                aria-pressed={selected}
                // aria-current marks the real season even while another is being viewed.
                aria-current={id === nowSeason ? "date" : undefined}
                onClick={() => onSeason(id)}
              >
                {selected && (
                  <RoughFrame
                    d={sketch.circle}
                    viewBox={CIRCLE_VIEWBOX}
                    className="produce-circle produce-circle--season"
                  />
                )}
                {/* Icon and name share a line so the content fits the loop's ellipse. */}
                <span className="produce-season-head">
                  <span className="produce-season-icon">
                    <RoughGlyph d={sketch.seasons[id]} />
                  </span>
                  <span className={`produce-season-name ${caveat.className}`}>
                    {SEASONS[id].label}
                  </span>
                </span>
                <span className="produce-season-range">{shortRange(SEASONS[id].months)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <ol className="produce-months" aria-label={`Months of ${label.toLowerCase()}`}>
        <li>
          <button
            type="button"
            className={`produce-month produce-month--all ${caveat.className}`}
            aria-pressed={view.month === null}
            onClick={() => onMonth(null)}
          >
            {view.month === null && (
              <RoughFrame d={sketch.circle} viewBox={CIRCLE_VIEWBOX} className="produce-circle" />
            )}
            All {label.toLowerCase()}
          </button>
        </li>
        {months.map((m) => (
          <li key={m}>
            <button
              type="button"
              className={`produce-month ${caveat.className}`}
              aria-pressed={m === view.month}
              aria-label={MONTH_NAMES[m]}
              aria-current={m === nowMonth ? "date" : undefined}
              onClick={() => onMonth(m)}
            >
              {m === view.month && (
                <RoughFrame d={sketch.circle} viewBox={CIRCLE_VIEWBOX} className="produce-circle" />
              )}
              {MONTH_NAMES[m].slice(0, 3)}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
