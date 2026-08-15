import { MarkersMap, type MapMarker } from "@/components/crm/markers-map";
import { requireUser } from "@/lib/auth";
import {
  loadLeads,
  loadPipeline,
  loadPower,
  loadSubstations,
} from "@/lib/data-store";
import { mergeBoardPower } from "@/lib/pipeline";
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
  const [{ leads }, { power }, { substations }, { items: pipeline }] =
    await Promise.all([
      loadLeads(),
      loadPower(),
      loadSubstations(),
      loadPipeline(),
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

  const buckets = buildSubstationBuckets(
    leads,
    mergeBoardPower(power, pipeline),
    substations
  );
  // Explicit substation coordinates (OSM/APN/address) from substations.json.
  const nk = (s: string) => (s || "").trim().toLowerCase();
  const subCoord = new Map<string, { lat: number; lng: number; by: string }>();
  for (const s of substations) {
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      subCoord.set(nk(s.name), { lat, lng, by: s.locatedBy || "" });
    }
  }

  const substationMarkers: MapMarker[] = [];
  for (const bucket of buckets) {
    // Prefer an explicit substation location (bucket name or any grouped member),
    // then fall back to the centroid of the substation's parcels.
    let loc = subCoord.get(nk(bucket.name));
    if (!loc) {
      for (const m of bucket.members || []) {
        const c = subCoord.get(nk(m));
        if (c) {
          loc = c;
          break;
        }
      }
    }
    if (!loc) {
      const coords = leadsForSlug(leads, bucket.slug, substations)
        .map(coord)
        .filter((c): c is { lat: number; lng: number } => c !== null);
      if (coords.length) {
        loc = {
          lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
          lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
          by: "parcels",
        };
      }
    }
    if (!loc) continue;
    const approx = loc.by && loc.by !== "osm";
    substationMarkers.push({
      id: bucket.slug,
      lat: loc.lat,
      lng: loc.lng,
      kind: "substation",
      title: bucket.name,
      subtitle: `${bucket.parcels} parcels · ${bucket.workedPct}% worked${
        bucket.totalMva ? ` · ${bucket.totalMva} MVA` : ""
      }${approx ? " · approx location" : ""}`,
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

  // APNs we already track (leads + pipeline sites) so those parcels are shaded.
  const trackedApns = Array.from(
    new Set(
      [
        ...leads.map((l) => l.apn),
        ...pipeline.filter((p) => p.kind === "site").map((p) => p.apn || ""),
      ]
        .map((a) => (a || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase())
        .filter(Boolean)
    )
  );
  const substationNames = Array.from(
    new Set(
      pipeline
        .filter((p) => (p.kind ?? "substation") === "substation")
        .map((p) => p.name.trim())
        .filter(Boolean)
    )
  ).sort();

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
        trackedApns={trackedApns}
        substationNames={substationNames}
      />
    </div>
  );
}
