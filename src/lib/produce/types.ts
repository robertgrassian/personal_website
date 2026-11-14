export type ProduceCategory = "fruit" | "vegetable" | "herb" | "mushroom";

export type Produce = {
  // Kebab-case and permanent: tastings store it in Postgres. A rename changes `name`, never this.
  slug: string;
  name: string;
  // Other names, for display only.
  aka?: string[];
  category: ProduceCategory;
  // Robert's own words. Nothing renders when absent.
  blurb?: string;
};

export type Region = {
  id: string;
  // Reads after "season data for": "the Northeast".
  name: string;
  // Decides what "this month" means for the region's pages.
  timeZone: string;
  sources: { title: string; url: string }[];
  // slug → 12-char season string, January first: `.` out, `a` available, `P` peak, `s` storage.
  seasons: Record<string, string>;
  // Set on an uncurated shell. The validator then waives the rules that need data (sources,
  // seasons, catalog coverage) so the shell builds green; curation deletes the flag.
  draft?: boolean;
};

export type UsState = {
  // Uppercase, "NY". URLs carry it lowercased.
  code: string;
  name: string;
  // Region id, or null for a state with no curated region yet.
  region: string | null;
};

// One place item pictures come from. The registry (art/index.ts) lists sources in priority order.
export type ArtSource = {
  // Names the folder under public/produce/art/.
  id: string;
  // The one line shown at the bottom of the page. Every registered source is listed there.
  credit: { name: string; url: string };
  license: string;
  // How the pictures sit on a packet. A plate is colour on its own paper; an engraving is black
  // ink on white, which needs paper put behind it in the dark scheme.
  kind: ArtKind;
  // slug → picture. A source need only cover the items it has.
  images: Readonly<Record<string, ArtImage>>;
};

export type ArtKind = "plate" | "engraving";

export type ArtImage = {
  // Path under public/.
  file: string;
  // Where this exact picture came from, so it can be found again. https.
  sourceUrl: string;
};
