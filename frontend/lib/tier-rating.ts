import type { TierName } from "./types";

/** Upper bound of each automatic tier range. */
export const TIER_RATING: Record<TierName, number> = {
  S: 10,
  A: 9,
  B: 8,
  C: 6,
  D: 4,
  E: 2,
  F: 1,
};

export function ratingForTier(tier: TierName): number {
  return TIER_RATING[tier];
}
