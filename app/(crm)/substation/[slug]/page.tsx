import { notFound } from "next/navigation";
import { SubstationDetail } from "@/components/crm/substation-detail";
import { requireUser } from "@/lib/auth";
import { loadLeads, loadPower } from "@/lib/data-store";
import { buildSubstationBuckets, parcelsForSlug } from "@/lib/substation";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SubstationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const [{ leads }, { power }] = await Promise.all([loadLeads(), loadPower()]);

  const buckets = buildSubstationBuckets(leads, power);
  const bucket = buckets.find((b) => b.slug === slug);
  if (!bucket) notFound();

  const parcels = parcelsForSlug(leads, slug);
  const powerRecords = power.filter(
    (p) => (slugify(p.substation) || "unassigned") === slug
  );

  return (
    <SubstationDetail bucket={bucket} parcels={parcels} power={powerRecords} />
  );
}
