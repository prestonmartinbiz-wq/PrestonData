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
 * Fold a new NVE "pull" into a substation's top-level rollup fields. Keeps the
 * highest MW seen, unions feeders / long-lead items / diagram images, and takes
 * the most recent pull's ISD / peak demand / trenching / raw text. The pull is
 * appended to `responses` so the full history is preserved.
 */
export function applyResponse(
  record: PipelineSubstation,
  r: PipelineResponse
): PipelineSubstation {
  const mws = [record.mwAvailable, r.mwAvailable].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  const feeders = mergeFeeders(record.feeders || [], r.feeders || []);
  const longLeadItems = Array.from(
    new Set([...(record.longLeadItems || []), ...(r.longLeadItems || [])])
  );
  const images = Array.from(
    new Set([...(record.images || []), ...(r.images || [])])
  );
  return {
    ...record,
    mwAvailable: mws.length ? Math.max(...mws) : record.mwAvailable ?? null,
    isdDate: r.isdDate || record.isdDate,
    peakDemand: r.peakDemand || record.peakDemand,
    trenchingFt: r.trenchingFt ?? record.trenchingFt ?? null,
    feeders,
    longLeadItems,
    nveResponseRaw: r.text || record.nveResponseRaw,
    responses: [...(record.responses || []), r],
    images,
  };
}
