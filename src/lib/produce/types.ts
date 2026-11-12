export type ProduceCategory = "fruit" | "vegetable" | "herb" | "mushroom";

export type Produce = {
  // Kebab-case and permanent: tastings store it in Postgres. A rename changes `name`, never this.
  slug: string;
  name: string;
  // Other names, for display only.
  aka?: string[];
  category: ProduceCategory;
  // Path under public/, absent until drawn.
  art?: string;
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
