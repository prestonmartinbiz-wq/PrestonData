/**
 * Composite scoring for confirmed substations. Pure math off four inputs, with
 * all weights/thresholds pulled from a config object so the weighting can be
 * retuned without touching the scoring logic. Unit-testable in isolation.
 */

export type ScoringConfig = {
  mw: { weight: number; saturationMW: number };
  longLead: { weight: number };
  isd: { weight: number; buckets: { maxMonths: number; points: number }[] };
};

export const SCORING_CONFIG: ScoringConfig = {
  mw: { weight: 60, saturationMW: 15 }, // MW available maxes out the component at 15MW
  longLead: { weight: 25 }, // full points if no long-lead items
  isd: {
    // weight 15, bucketed against NVE's standing ~12-month delivery timeline
    weight: 15,
    buckets: [
      { maxMonths: 13, points: 15 }, // at/inside NVE's standard ~12-month timeline
      { maxMonths: 18, points: 7 }, // 13-18 months — okay, still worth tracking closely
      { maxMonths: Infinity, points: 0 }, // over 18 months — too far out to score well
    ],
  },
};

export type ScoreInputs = {
  mwAvailable: number;
  longLeadPresent: boolean;
  /** Months from now until the in-service date. Use a large number when unknown. */
  monthsToISD: number;
};

export function scoreSubstation(
  { mwAvailable, longLeadPresent, monthsToISD }: ScoreInputs,
  config: ScoringConfig = SCORING_CONFIG
): number {
  const mwScore =
    Math.min((mwAvailable || 0) / config.mw.saturationMW, 1) * config.mw.weight;
  const longLeadScore = longLeadPresent ? 0 : config.longLead.weight;
  const isdBucket =
    config.isd.buckets.find((b) => monthsToISD <= b.maxMonths) ??
    config.isd.buckets[config.isd.buckets.length - 1];
  const isdScore = isdBucket ? isdBucket.points : 0;
  return Math.round(mwScore + longLeadScore + isdScore);
}

export type ScoreLabel = "Priority Target" | "Good" | "Monitor Only";

export function scoreLabel(score: number): ScoreLabel {
  if (score >= 70) return "Priority Target";
  if (score >= 40) return "Good";
  return "Monitor Only";
}

/** Whole months from now until an ISO date. Returns a large number when unknown. */
export function monthsUntil(isoDate: string, from: Date = new Date()): number {
  if (!isoDate) return Number.POSITIVE_INFINITY;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  const months =
    (target.getFullYear() - from.getFullYear()) * 12 +
    (target.getMonth() - from.getMonth());
  return months;
}
