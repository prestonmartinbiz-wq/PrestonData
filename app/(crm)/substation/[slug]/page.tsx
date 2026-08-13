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

  // Center the map on the parcels we have coordinates for (fallback to the
  // substation's service area as a text query).
  const coords = substationLeads
    .map((l) => ({ lat: Number(l.latitude), lng: Number(l.longitude) }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat !== 0);
  const mapCenter = coords.length
    ? {
        lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
        lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
      }
    : null;
  // Fallback map query when we have no coordinates: prefer a real parcel address,
  // then a cleaned-up service-area string, then the substation name.
  const firstAddress = substationLeads.find((l) => (l.propertyAddress || "").trim())
    ?.propertyAddress;
  const cleanLocation = (bucket.location || "")
    .replace(/^serves\s+/i, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*—.*$/, "")
    .trim();
  const mapQuery =
    firstAddress || cleanLocation || `${bucket.name} substation, Las Vegas NV`;

  return (
    <SubstationDetail
      bucket={bucket}
      leads={substationLeads}
      power={bucket.power}
      team={team.members}
      currentUserEmail={user.email}
      currentUserName={user.fullName}
      mapCenter={mapCenter}
      mapQuery={mapQuery}
      mapPoints={coords.length}
    />
  );
}
