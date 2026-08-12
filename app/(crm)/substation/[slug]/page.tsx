import { notFound } from "next/navigation";
import { SubstationDetail } from "@/components/crm/substation-detail";
import { requireUser } from "@/lib/auth";
import { loadLeads, loadPower, loadSubstations, loadTeam } from "@/lib/data-store";
import { buildSubstationBuckets, leadsForSlug } from "@/lib/substation";

export const dynamic = "force-dynamic";

export default async function SubstationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const [{ leads }, { power }, { substations }, { team }] = await Promise.all([
    loadLeads(),
    loadPower(),
    loadSubstations(),
    loadTeam(),
  ]);

  const buckets = buildSubstationBuckets(leads, power, substations);
  const bucket = buckets.find((b) => b.slug === slug);
  if (!bucket) notFound();

  const substationLeads = leadsForSlug(leads, slug, substations);

  return (
    <SubstationDetail
      bucket={bucket}
      leads={substationLeads}
      power={bucket.power}
      team={team.members}
      currentUserEmail={user.email}
      currentUserName={user.fullName}
    />
  );
}
