import type { Region } from "../types.ts";
import { california } from "./california.ts";
import { northeast } from "./northeast.ts";

export const REGIONS: readonly Region[] = [northeast, california];

const BY_ID: ReadonlyMap<string, Region> = new Map(REGIONS.map((r) => [r.id, r]));

export function regionById(id: string): Region | undefined {
  return BY_ID.get(id);
}
