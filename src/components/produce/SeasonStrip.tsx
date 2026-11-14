import { MONTH_ABBR, MONTH_NAMES, seasonLabel, statusIn, type Period } from "@/lib/produce/season";

// Twelve cells, January first. Status is carried three ways so colour is never the only signal:
// a fill pattern per status in produce.css (solid peak, tint available, hatched storage, empty
// out), and the whole strip announced as one sentence via role="img".
export function SeasonStrip({
  season,
  period,
  labelled = false,
}: {
  season: string;
  // The months being viewed, each marked with a tick: one for a month, three for a season.
  period: Period;
  // Month initials under the cells, for the detail dialog.
  labelled?: boolean;
}) {
  return (
    // A span: the strip sits inside a card <button>, where a div is invalid HTML.
    <span
      role="img"
      aria-label={seasonLabel(season)}
      className={`produce-strip ${labelled ? "produce-strip--labelled" : ""}`}
    >
      {MONTH_NAMES.map((name, m) => (
        <span key={name} className="produce-strip-month">
          <span
            className="produce-cell"
            data-status={statusIn(season, m)}
            data-viewing={period.includes(m) || undefined}
          />
          {labelled && <span className="produce-strip-label">{MONTH_ABBR[m]}</span>}
        </span>
      ))}
    </span>
  );
}

// The key to the strip's patterns, so a first-time reader does not have to guess.
export function SeasonKey() {
  const entries = [
    ["peak", "Peak"],
    ["available", "Available"],
    ["storage", "From storage"],
    ["out", "Out"],
  ] as const;
  return (
    <ul className="produce-key">
      {entries.map(([status, label]) => (
        <li key={status}>
          <span className="produce-cell" data-status={status} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
