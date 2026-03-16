// Dispatches to RatingRibbon (S) or RatingBadge (A–F),
// keeping consumers agnostic of the visual difference between rating tiers.

import type { RatingLetter } from "@/lib/games";
import { RatingRibbon } from "./RatingRibbon";
import { RatingBadge } from "./RatingBadge";

type RatingIndicatorProps = {
  rank: RatingLetter;
};

export function RatingIndicator({ rank }: RatingIndicatorProps) {
  if (rank === "S") return <RatingRibbon />;
  return <RatingBadge rank={rank} />;
}
