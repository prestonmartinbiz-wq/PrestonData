import { CoverageBoard } from "@/components/crm/coverage-board";
import { requireUser } from "@/lib/auth";
import { loadLeads, loadPower, loadSubstations } from "@/lib/data-store";
import { buildSubstationBuckets } from "@/lib/substation";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  await requireUser();
  const [{ leads, meta }, { power }, { substations }] = await Promise.all([
    loadLeads(),
    loadPower(),
    loadSubstations(),
  ]);
  const buckets = buildSubstationBuckets(leads, power, substations);

  return (
    <CoverageBoard
      initialBuckets={buckets}
      leadCount={leads.length}
      meta={meta}
    />
  );
}
