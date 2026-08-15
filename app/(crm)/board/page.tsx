import { CoverageBoard } from "@/components/crm/coverage-board";
import { requireUser } from "@/lib/auth";
import {
  loadLeads,
  loadPipeline,
  loadPower,
  loadSubstations,
} from "@/lib/data-store";
import { mergeBoardPower } from "@/lib/pipeline";
import { buildSubstationBuckets } from "@/lib/substation";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  await requireUser();
  const [{ leads, meta }, { power }, { substations }, { items: pipeline }] =
    await Promise.all([
      loadLeads(),
      loadPower(),
      loadSubstations(),
      loadPipeline(),
    ]);
  // Fold confirmed pipeline power into the board (deduped by feeder id).
  const buckets = buildSubstationBuckets(
    leads,
    mergeBoardPower(power, pipeline),
    substations
  );

  return (
    <CoverageBoard
      initialBuckets={buckets}
      leadCount={leads.length}
      meta={meta}
    />
  );
}
