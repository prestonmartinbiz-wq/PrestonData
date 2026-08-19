import {
  bbox,
  booleanIntersects,
  booleanPointInPolygon,
  feature,
  point,
} from "@turf/turf";
import { parcelsInBbox } from "@/lib/parcels";
import type { Farm, FarmBoundary, FarmMember, Lead } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

export type ParcelFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: GeoJSON.Geometry | null;
};

/** Rotating palette — avoids collision with map semantic colors (amber/emerald/sky/violet). */
export const FARM_PALETTE = [
  "#e11d48", // rose
  "#4f46e5", // indigo
  "#ea580c", // orange
  "#0d9488", // teal
  "#c026d3", // fuchsia
  "#f97316", // orange-500
  "#14b8a6", // cyan
] as const;

export function farmBbox(boundary: FarmBoundary): [number, number, number, number] {
  return bbox(feature(boundary)) as [number, number, number, number];
}

/**
 * Membership from parcel geometry intersecting the farm boundary (inside OR touching).
 * Parcels without a lead record are still included (bare APN).
 */
export function computeFarmMembers(
  boundary: FarmBoundary,
  parcelFeatures: ParcelFeature[],
  now = new Date().toISOString()
): FarmMember[] {
  const farmPoly = feature(boundary);
  const members: FarmMember[] = [];
  const seen = new Set<string>();

  for (const f of parcelFeatures) {
    if (!f.geometry) continue;
    const apn = String(f.properties?.APN || "").trim();
    if (!apn) continue;
    const norm = normalizeApn(apn);
    if (seen.has(norm)) continue;

    try {
      const parcelPoly = feature(f.geometry);
      if (!booleanIntersects(farmPoly, parcelPoly)) continue;
    } catch {
      continue;
    }

    seen.add(norm);
    members.push({
      apn: apn.replace(/[^0-9]/g, "") || apn,
      addedVia: "polygon",
      addedAt: now,
    });
  }

  return members;
}

/** Fast centroid check for map highlights (lead lat/lng inside polygon). */
export function leadCentroidInFarm(boundary: FarmBoundary, lead: Lead): boolean {
  const lat = Number(lead.latitude);
  const lng = Number(lead.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return false;
  }
  try {
    return booleanPointInPolygon(point([lng, lat]), feature(boundary));
  } catch {
    return false;
  }
}

/** On boundary redraw: keep manual members, replace polygon-derived membership. */
export function mergeFarmMembers(
  existing: FarmMember[],
  fromPolygon: FarmMember[]
): FarmMember[] {
  const manual = existing.filter((m) => m.addedVia === "manual");
  const manualApns = new Set(manual.map((m) => normalizeApn(m.apn)));
  const polygonMembers = fromPolygon.filter(
    (m) => !manualApns.has(normalizeApn(m.apn))
  );
  return [...manual, ...polygonMembers];
}

export function colorForAssignee(assignee: string, existingFarms: Farm[]): string {
  for (const farm of existingFarms) {
    if (farm.assignedTo === assignee && farm.color) return farm.color;
  }
  const used = new Set(existingFarms.map((f) => f.color));
  for (const c of FARM_PALETTE) {
    if (!used.has(c)) return c;
  }
  return FARM_PALETTE[assignee.length % FARM_PALETTE.length];
}

export function newFarmId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 30);
  return `farm_${Date.now()}_${slug || "farm"}`;
}

/** Tile a bbox into sub-queries so we stay under the county 2000-record cap per request. */
const TILE_DEG = 0.012; // ~1.3 km — typical substation-scale farms fit in one tile

export async function fetchParcelsForBoundary(
  boundary: FarmBoundary
): Promise<ParcelFeature[]> {
  const [west, south, east, north] = farmBbox(boundary);
  const width = east - west;
  const height = north - south;
  const cols = Math.max(1, Math.ceil(width / TILE_DEG));
  const rows = Math.max(1, Math.ceil(height / TILE_DEG));

  const all: ParcelFeature[] = [];
  const seen = new Set<string>();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const w = west + (col * width) / cols;
      const e = west + ((col + 1) * width) / cols;
      const s = south + (row * height) / rows;
      const n = south + ((row + 1) * height) / rows;
      const data = await parcelsInBbox(w, s, e, n);
      for (const f of data.features) {
        const apn = String(f.properties?.APN || "").trim();
        const key = normalizeApn(apn);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        all.push(f as ParcelFeature);
      }
    }
  }

  return all;
}

export async function computeMembersForBoundary(
  boundary: FarmBoundary
): Promise<FarmMember[]> {
  const parcels = await fetchParcelsForBoundary(boundary);
  return computeFarmMembers(boundary, parcels);
}
