import { MarkersMap, type MapMarker } from "@/components/crm/markers-map";
import { requireUser } from "@/lib/auth";
import { loadLeads, loadPower, loadSubstations } from "@/lib/data-store";
import {
  buildSubstationBuckets,
  isWorked,
  leadsForSlug,
  parseLeadMeta,
} from "@/lib/substation";
import { needsContact } from "@/lib/utils";

export const dynamic = "force-dynamic";

function coord(lead: { latitude: string; longitude: string }) {
  const lat = Number(lead.latitude);
  const lng = Number(lead.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }
  return { lat, lng };
}

export default async function MapPage() {
  await requireUser();
  const [{ leads }, { power }, { substations }] = await Promise.all([
    loadLeads(),
    loadPower(),
    loadSubstations(),
  ]);

  const parcelMarkers: MapMarker[] = [];
  for (const lead of leads) {
    const c = coord(lead);
    if (!c) continue;
    const meta = parseLeadMeta(lead.notes);
    parcelMarkers.push({
      id: lead.apn,
      lat: c.lat,
      lng: c.lng,
      kind: "parcel",
      title: lead.ownerEntity || lead.apn,
      subtitle: [lead.propertyAddress, meta.substation]
        .filter(Boolean)
        .join(" · "),
      href: `/lead/${encodeURIComponent(lead.apn)}`,
      needsContact: needsContact(lead),
      worked: isWorked(lead),
    });
  }

  const buckets = buildSubstationBuckets(leads, power, substations);
  const substationMarkers: MapMarker[] = [];
  for (const bucket of buckets) {
    const coords = leadsForSlug(leads, bucket.slug, substations)
      .map(coord)
      .filter((c): c is { lat: number; lng: number } => c !== null);
    if (!coords.length) continue;
    const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
    const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
    substationMarkers.push({
      id: bucket.slug,
      lat,
      lng,
      kind: "substation",
      title: bucket.name,
      subtitle: `${bucket.parcels} parcels · ${bucket.workedPct}% worked${
        bucket.totalMva ? ` · ${bucket.totalMva} MVA` : ""
      }`,
      href: `/substation/${bucket.slug}`,
    });
  }

  const all = [...parcelMarkers, ...substationMarkers];
  const center = all.length
    ? {
        lat: all.reduce((s, m) => s + m.lat, 0) / all.length,
        lng: all.reduce((s, m) => s + m.lng, 0) / all.length,
      }
    : { lat: 36.1147, lng: -115.1728 };

  const mapped = parcelMarkers.length;
  const unmapped = leads.length - mapped;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Map
          </h1>
          <p className="text-sm text-slate-500">
            {mapped} of {leads.length} parcels plotted across{" "}
            {substationMarkers.length} substations
            {unmapped > 0 ? ` · ${unmapped} without coordinates` : ""}.
          </p>
        </div>
      </div>
      <MarkersMap
        parcels={parcelMarkers}
        substations={substationMarkers}
        center={center}
      />
    </div>
  );
}
