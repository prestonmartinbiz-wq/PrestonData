import { notFound } from "next/navigation";
import { FarmDetailClient } from "@/components/crm/farm-detail-page";
import { requireUser } from "@/lib/auth";
import { loadFarms, loadLeads, loadPipeline, loadTeam } from "@/lib/data-store";
import { farmBbox } from "@/lib/farms";
import { normalizeApn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FarmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [{ items }, { leads }, { team }, { items: pipeline }] = await Promise.all([
    loadFarms(),
    loadLeads(),
    loadTeam(),
    loadPipeline(),
  ]);

  const farm = items.find((f) => f.id === id);
  if (!farm) notFound();

  const leadByApn = new Map(leads.map((l) => [normalizeApn(l.apn), l]));
  const members = farm.members.map((m) => ({
    ...m,
    lead: leadByApn.get(normalizeApn(m.apn)) ?? null,
  }));

  const [west, south, east, north] = farmBbox(farm.boundary);
  const mapCenter = {
    lat: (south + north) / 2,
    lng: (west + east) / 2,
  };

  const substationNames = Array.from(
    new Set(
      pipeline
        .filter((p) => (p.kind ?? "substation") === "substation")
        .map((p) => p.name.trim())
        .filter(Boolean)
    )
  ).sort();

  return (
    <FarmDetailClient
      farm={farm}
      members={members}
      teamMembers={team.members}
      substationNames={substationNames}
      mapCenter={mapCenter}
    />
  );
}
