import type { UsState } from "./types.ts";

export const STATES: readonly UsState[] = [
  { code: "AL", name: "Alabama", region: null },
  { code: "AK", name: "Alaska", region: null },
  { code: "AZ", name: "Arizona", region: null },
  { code: "AR", name: "Arkansas", region: null },
  { code: "CA", name: "California", region: "california" },
  { code: "CO", name: "Colorado", region: null },
  { code: "CT", name: "Connecticut", region: "northeast" },
  { code: "DE", name: "Delaware", region: null },
  { code: "DC", name: "District of Columbia", region: null },
  { code: "FL", name: "Florida", region: null },
  { code: "GA", name: "Georgia", region: null },
  { code: "HI", name: "Hawaii", region: null },
  { code: "ID", name: "Idaho", region: null },
  { code: "IL", name: "Illinois", region: null },
  { code: "IN", name: "Indiana", region: null },
  { code: "IA", name: "Iowa", region: null },
  { code: "KS", name: "Kansas", region: null },
  { code: "KY", name: "Kentucky", region: null },
  { code: "LA", name: "Louisiana", region: null },
  { code: "ME", name: "Maine", region: "northeast" },
  { code: "MD", name: "Maryland", region: null },
  { code: "MA", name: "Massachusetts", region: "northeast" },
  { code: "MI", name: "Michigan", region: null },
  { code: "MN", name: "Minnesota", region: null },
  { code: "MS", name: "Mississippi", region: null },
  { code: "MO", name: "Missouri", region: null },
  { code: "MT", name: "Montana", region: null },
  { code: "NE", name: "Nebraska", region: null },
  { code: "NV", name: "Nevada", region: null },
  { code: "NH", name: "New Hampshire", region: "northeast" },
  { code: "NJ", name: "New Jersey", region: "northeast" },
  { code: "NM", name: "New Mexico", region: null },
  { code: "NY", name: "New York", region: "northeast" },
  { code: "NC", name: "North Carolina", region: null },
  { code: "ND", name: "North Dakota", region: null },
  { code: "OH", name: "Ohio", region: null },
  { code: "OK", name: "Oklahoma", region: null },
  { code: "OR", name: "Oregon", region: null },
  { code: "PA", name: "Pennsylvania", region: "northeast" },
  { code: "RI", name: "Rhode Island", region: "northeast" },
  { code: "SC", name: "South Carolina", region: null },
  { code: "SD", name: "South Dakota", region: null },
  { code: "TN", name: "Tennessee", region: null },
  { code: "TX", name: "Texas", region: null },
  { code: "UT", name: "Utah", region: null },
  { code: "VT", name: "Vermont", region: "northeast" },
  { code: "VA", name: "Virginia", region: null },
  { code: "WA", name: "Washington", region: null },
  { code: "WV", name: "West Virginia", region: null },
  { code: "WI", name: "Wisconsin", region: null },
  { code: "WY", name: "Wyoming", region: null },
];

const BY_CODE: ReadonlyMap<string, UsState> = new Map(STATES.map((s) => [s.code, s]));

// Case-insensitive because URLs carry the code lowercased and geo headers send it uppercase.
export function stateByCode(code: string): UsState | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export const COVERED_STATES: readonly UsState[] = STATES.filter((s) => s.region !== null);

export function statesInRegion(regionId: string): UsState[] {
  return STATES.filter((s) => s.region === regionId);
}
