import { monthsUntil, scoreSubstation } from "@/lib/scoring";
import type { Feeder, PipelineResponse, PipelineSubstation } from "@/lib/types";

/** Recompute derived fields (long-lead flag + composite score for confirmed). */
export function finalizePipeline(record: PipelineSubstation): PipelineSubstation {
  const longLeadPresent = (record.longLeadItems || []).length > 0;
  let compositeScore = record.compositeScore;
  if (record.status === "confirmed") {
    compositeScore = scoreSubstation({
      mwAvailable: record.mwAvailable ?? 0,
      longLeadPresent,
      monthsToISD: monthsUntil(record.isdDate),
    });
  }
  return {
    ...record,
    longLeadPresent,
    compositeScore,
    updatedAt: new Date().toISOString(),
  };
}

/** Merge two feeder lists by id, keeping the largest known MVA per feeder. */
export function mergeFeeders(a: Feeder[], b: Feeder[]): Feeder[] {
  const byId = new Map<string, number | null>();
  for (const f of [...(a || []), ...(b || [])]) {
    if (!f?.id) continue;
    const prev = byId.get(f.id);
    if (prev === undefined) byId.set(f.id, f.mva ?? null);
    else if (f.mva !== null && f.mva !== undefined && (prev === null || f.mva > prev)) {
      byId.set(f.id, f.mva);
    }
  }
  return Array.from(byId.entries())
    .map(([id, mva]) => ({ id, mva }))
    .sort((x, y) => x.id.localeCompare(y.id));
}

/**
 * A substation's available MW is the MAX single confirmed availability across
 * its pulls — NEVER the sum. Multiple requests over time typically draw from the
 * same feeders, so adding them would double-count the same physical capacity
 * (a 10 MW request and a 20 MW request from the same feeders is 20, not 30).
 */
export function rollupAvailableMw(
  responses: PipelineResponse[],
  fallback: number | null = null
): number | null {
  const vals = (responses || [])
    .map((r) => r.mwAvailable)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return vals.length ? Math.max(...vals) : fallback ?? null;
}

/**
 * Recompute a substation's rollup fields from its full `responses` history so
 * the result is idempotent (safe to re-run after add/edit/delete). Feeders are
 * deduplicated by id — the same feeder seen in two pulls is one feeder, one
 * capacity — and available MW is the max across pulls, never the sum.
 */
export function rollupFromResponses(record: PipelineSubstation): PipelineSubstation {
  const responses = record.responses || [];
  // Fold response feeders on top of any existing (seed) feeders, deduped by id.
  const feeders = responses.reduce(
    (acc, r) => mergeFeeders(acc, r.feeders || []),
    mergeFeeders(record.feeders || [], [])
  );
  const longLeadItems = Array.from(
    new Set([
      ...(record.longLeadItems || []),
      ...responses.flatMap((r) => r.longLeadItems || []),
    ])
  );
  const images = Array.from(
    new Set([
      ...(record.images || []),
      ...responses.flatMap((r) => r.images || []),
    ])
  );
  const latest = responses[responses.length - 1];
  return {
    ...record,
    feeders,
    mwAvailable: rollupAvailableMw(responses, record.mwAvailable ?? null),
    isdDate: latest?.isdDate || record.isdDate,
    peakDemand: latest?.peakDemand || record.peakDemand,
    trenchingFt: latest?.trenchingFt ?? record.trenchingFt ?? null,
    longLeadItems,
    images,
    nveResponseRaw: latest?.text || record.nveResponseRaw,
  };
}

/**
 * Append a new NVE "pull" and recompute the rollup from the full history. The
 * pull is preserved in `responses`; capacity is never double-counted (see
 * rollupAvailableMw / rollupFromResponses).
 */
export function applyResponse(
  record: PipelineSubstation,
  r: PipelineResponse
): PipelineSubstation {
  return rollupFromResponses({
    ...record,
    responses: [...(record.responses || []), r],
  });
}
