import type { ArtSource, Produce, Region, UsState } from "./types.ts";

export type ProduceData = {
  catalog: readonly Produce[];
  regions: readonly Region[];
  states: readonly UsState[];
  artSources: readonly ArtSource[];
  // Injected so this module stays free of `fs` and the test can stub it.
  artExists: (path: string) => boolean;
};

const SEASON = /^[.aPs]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Mirrors the CHECK on produce_tastings.produce_slug.
const MAX_SLUG_LENGTH = 64;

// Spelled out rather than derived from states.ts, so a typo or a dropped row there is caught.
// prettier-ignore
const EXPECTED_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM",
  "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
];

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Every problem with the produce data, as human-readable lines. Empty means valid. */
export function validateProduceData({
  catalog,
  regions,
  states,
  artSources,
  artExists,
}: ProduceData): string[] {
  const problems: string[] = [];
  const catalogSlugs = new Set<string>();

  for (const item of catalog) {
    if (!SLUG.test(item.slug)) problems.push(`catalog slug "${item.slug}" is not kebab-case`);
    if (item.slug.length > MAX_SLUG_LENGTH) {
      problems.push(`catalog slug "${item.slug}" is over ${MAX_SLUG_LENGTH} chars`);
    }
    if (catalogSlugs.has(item.slug)) problems.push(`catalog slug "${item.slug}" is duplicated`);
    catalogSlugs.add(item.slug);
  }

  const sourceIds = new Set<string>();
  for (const source of artSources) {
    const where = `art source "${source.id}"`;
    if (sourceIds.has(source.id)) problems.push(`${where} is duplicated`);
    sourceIds.add(source.id);
    if (!source.license.trim()) problems.push(`${where} has no license`);
    if (!source.credit.name.trim()) problems.push(`${where} has no credit name`);
    if (!source.credit.url.startsWith("https://")) {
      problems.push(`${where} credit url "${source.credit.url}" is not https`);
    }
    for (const [slug, image] of Object.entries(source.images)) {
      if (!catalogSlugs.has(slug)) problems.push(`${where} has art for unknown slug "${slug}"`);
      if (!artExists(image.file)) {
        problems.push(`${where} has "${image.file}" for "${slug}", missing under public/`);
      }
      if (!image.sourceUrl.startsWith("https://")) {
        problems.push(`${where} image for "${slug}" has no https sourceUrl`);
      }
    }
  }

  const regionIds = new Set<string>();
  const grownSomewhere = new Set<string>();
  for (const region of regions) {
    const where = `region "${region.id}"`;
    if (regionIds.has(region.id)) problems.push(`${where} is duplicated`);
    regionIds.add(region.id);

    if (!isValidTimeZone(region.timeZone)) {
      problems.push(`${where} has unknown time zone "${region.timeZone}"`);
    }
    for (const source of region.sources) {
      if (!source.url.startsWith("https://")) {
        problems.push(`${where} source "${source.title}" is not https: ${source.url}`);
      }
    }
    if (!region.draft) {
      if (region.sources.length < 2) problems.push(`${where} has fewer than two sources`);
      if (Object.keys(region.seasons).length === 0) problems.push(`${where} has no seasons`);
    }

    for (const [slug, season] of Object.entries(region.seasons)) {
      grownSomewhere.add(slug);
      if (!catalogSlugs.has(slug)) problems.push(`${where} names "${slug}", not in the catalog`);
      if (!SEASON.test(season)) {
        problems.push(`${where} "${slug}": season "${season}" is not 12 chars of .aPs`);
      } else if (!/[aPs]/.test(season)) {
        problems.push(`${where} "${slug}": season is out all year`);
      }
    }
  }

  // An item may belong to an uncurated region, so coverage is only knowable with no drafts left.
  if (!regions.some((r) => r.draft)) {
    for (const slug of catalogSlugs) {
      if (!grownSomewhere.has(slug)) problems.push(`catalog item "${slug}" is in no region`);
    }
  }

  const regionsWithStates = new Set<string>();
  const seenCodes = new Set<string>();
  for (const state of states) {
    if (seenCodes.has(state.code)) problems.push(`state "${state.code}" is duplicated`);
    seenCodes.add(state.code);
    if (state.region !== null) {
      regionsWithStates.add(state.region);
      if (!regionIds.has(state.region)) {
        problems.push(`state "${state.code}" names unknown region "${state.region}"`);
      }
    }
  }
  for (const id of regionIds) {
    if (!regionsWithStates.has(id)) problems.push(`region "${id}" has no states`);
  }
  const expected = new Set(EXPECTED_STATE_CODES);
  for (const code of expected) {
    if (!seenCodes.has(code)) problems.push(`state list is missing "${code}"`);
  }
  for (const code of seenCodes) {
    if (!expected.has(code)) problems.push(`state list has unexpected "${code}"`);
  }

  return problems;
}
