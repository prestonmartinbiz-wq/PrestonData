import { notFound } from "next/navigation";
import { SubstationDetail } from "@/components/crm/substation-detail";
import { requireUser } from "@/lib/auth";
import { loadLeads, loadPower, loadSubstations } from "@/lib/data-store";
import { buildSubstationBuckets, parcelsForSlug } from "@/lib/substation";

export const dynamic = "force-dynamic";

export default async function SubstationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const [{ leads }, { power }, { substations }] = await Promise.all([
    loadLeads(),
    loadPower(),
    loadSubstations(),
  ]);

  const buckets = buildSubstationBuckets(leads, power, substations);
  const bucket = buckets.find((b) => b.slug === slug);
  if (!bucket) notFound();

  const parcels = parcelsForSlug(leads, slug, substations);

  return (
    <SubstationDetail bucket={bucket} parcels={parcels} power={bucket.power} />
  );
}
