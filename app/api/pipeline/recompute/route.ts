import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadPipeline, savePipeline } from "@/lib/data-store";
import { extractAvailableMw } from "@/lib/nve-extract";
import { finalizePipeline, rollupFromResponses } from "@/lib/pipeline";
import type { PipelineResponse, PipelineSubstation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-derive a pull's available MW from its stored text, never increasing it. */
function correctPull(r: PipelineResponse): PipelineResponse {
  if (!r.text || !r.text.trim()) return r;
  const hv = extractAvailableMw(r.text);
  const mw =
    typeof r.mwAvailable === "number" && typeof hv === "number"
      ? Math.min(hv, r.mwAvailable)
      : hv;
  return { ...r, mwAvailable: mw };
}

/**
 * Recompute capacity for every substation and re-score. This is the guardrail
 * against double-counted power: available MW is re-derived from each pull's
 * labeled request line (rejecting "transmission study / no review" scenarios),
 * feeders are deduped by id, and the substation rollup takes the MAX across
 * pulls — never the sum. It only ever *reduces* an inflated number, never
 * invents capacity, so it is safe to run anytime.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const { items } = await loadPipeline();

    const changed: { name: string; from: number | null; to: number | null }[] = [];

    const next: PipelineSubstation[] = items.map((item) => {
      const before = item.mwAvailable ?? null;

      const workingResponses = (item.responses || []).map(correctPull);
      let recomputed: PipelineSubstation = rollupFromResponses({
        ...item,
        responses: workingResponses,
      });

      // Records with no pulls: re-check the single stored raw response text.
      if (!workingResponses.length && item.nveResponseRaw) {
        const hv = extractAvailableMw(item.nveResponseRaw);
        if (hv !== null && (before === null || hv < before)) {
          recomputed = { ...recomputed, mwAvailable: hv };
        }
      }

      // Never increase capacity during a backfill — only correct inflation.
      if (typeof before === "number" && typeof recomputed.mwAvailable === "number") {
        recomputed.mwAvailable = Math.min(recomputed.mwAvailable, before);
      }

      const finalized = finalizePipeline(recomputed);
      if ((finalized.mwAvailable ?? null) !== before) {
        changed.push({ name: item.name, from: before, to: finalized.mwAvailable ?? null });
      }
      return finalized;
    });

    const meta = await savePipeline(
      next,
      `Recompute pipeline capacity guardrail (${user.email || user.userId})`
    );

    return NextResponse.json({
      items: next,
      changed,
      count: changed.length,
      meta,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Recompute failed" }, { status: 500 });
  }
}
