/**
 * One-time: give every substation an accurate lat/lng from the best available
 * source and write it into data/substations.json.
 *
 * Priority: OpenStreetMap named substation (exact NV Energy facility) → APN via
 * Clark County GISMO parcel centroid (service-area parcel) → geocoded address →
 * geocoded location text. Coordinates outside Clark County are rejected.
 *
 * Run: bun run scripts/locate-substations.ts
 */
import { promises as fs } from "fs";
import path from "path";
import { geocodeTiered, sleep } from "@/lib/geocode";
import type { SubstationMeta } from "@/lib/types";

const SUBS = path.join(process.cwd(), "data", "substations.json");
const GISMO =
  "https://maps.clarkcountynv.gov/arcgis/rest/services/GISMO/AssessorMapv2/MapServer/1/query";

// Clark County-ish bounds — reject anything clearly off.
const inBounds = (lat: number, lng: number) =>
  lat > 35.6 && lat < 36.7 && lng > -115.8 && lng < -114.5;

function norm(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/substation/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Representative request-parcel APN/address per substation (from prod export). */
type Rep = { apn?: string; address?: string };

async function loadRep(): Promise<Record<string, Rep>> {
  const raw = await fs.readFile("/tmp/export.json", "utf8");
  const j = JSON.parse(raw);
  const power = j.power?.items || j.power || [];
  const rep: Record<string, Rep> = {};
  for (const p of power) {
    const k = norm(p.substation || "");
    if (!k) continue;
    rep[k] = rep[k] || {};
    if (!rep[k].apn && p.apn) rep[k].apn = String(p.apn).replace(/[^0-9]/g, "");
    if (!rep[k].address && p.address) rep[k].address = p.address;
  }
  return rep;
}

async function loadOsm(): Promise<Record<string, { lat: number; lng: number }>> {
  const raw = await fs.readFile("/tmp/osm-subs.json", "utf8");
  const j = JSON.parse(raw);
  const out: Record<string, { lat: number; lng: number }> = {};
  for (const e of j.elements || []) {
    const name = e.tags?.name;
    if (!name) continue;
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    out[norm(name)] = { lat, lng };
  }
  return out;
}

async function gismoCentroid(apn: string): Promise<{ lat: number; lng: number } | null> {
  const qs = new URLSearchParams({
    where: `APN='${apn}'`,
    outFields: "APN",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  try {
    const res = await fetch(`${GISMO}?${qs}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const gj = await res.json();
    const geom = gj.features?.[0]?.geometry;
    if (!geom) return null;
    const ring = geom.type === "Polygon" ? geom.coordinates?.[0] : geom.coordinates?.[0]?.[0];
    if (!Array.isArray(ring) || !ring.length) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const [x, y] of ring) {
      if (typeof x === "number" && typeof y === "number") {
        sx += x;
        sy += y;
        n++;
      }
    }
    if (!n) return null;
    return { lat: sy / n, lng: sx / n };
  } catch {
    return null;
  }
}

async function main() {
  const rep = await loadRep();
  const osm = await loadOsm();
  const current = JSON.parse(await fs.readFile(SUBS, "utf8")) as { items: SubstationMeta[] };

  // Union of substation names: existing metadata + everything in the board data,
  // excluding the "Highland / El Rancho" group alias (handled by its members).
  const names = new Set<string>();
  for (const it of current.items) names.add(it.name);
  for (const k of Object.keys(rep)) {
    if (k === norm("Highland / El Rancho")) continue;
    // find a display-cased name from existing items, else Title Case the key
    const existing = current.items.find((i) => norm(i.name) === k);
    names.add(existing ? existing.name : titleCase(k));
  }

  function titleCase(s: string): string {
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  type Located = SubstationMeta & {
    latitude?: number;
    longitude?: number;
    locatedBy?: string;
  };

  const byName = new Map<string, Located>();
  for (const it of current.items) byName.set(it.name, { ...it });
  for (const n of names) if (!byName.has(n)) byName.set(n, { name: n });

  for (const [name, item] of byName) {
    const key = norm(name);
    // 1) OSM exact match
    if (osm[key] && inBounds(osm[key].lat, osm[key].lng)) {
      item.latitude = round(osm[key].lat);
      item.longitude = round(osm[key].lng);
      item.locatedBy = "osm";
      console.log(`${name}: OSM ${item.latitude},${item.longitude}`);
      continue;
    }
    // Highland/El Rancho members → use Highland OSM if present
    if ((key === "el rancho" || key === "highland") && osm["highland"]) {
      item.latitude = round(osm["highland"].lat);
      item.longitude = round(osm["highland"].lng);
      item.locatedBy = "osm";
      console.log(`${name}: OSM(Highland) ${item.latitude},${item.longitude}`);
      continue;
    }
    // 2) APN via GISMO
    const apn = rep[key]?.apn;
    if (apn) {
      const c = await gismoCentroid(apn);
      if (c && inBounds(c.lat, c.lng)) {
        item.latitude = round(c.lat);
        item.longitude = round(c.lng);
        item.locatedBy = "parcel";
        console.log(`${name}: APN ${apn} -> ${item.latitude},${item.longitude}`);
        continue;
      }
    }
    // 3) address / location text geocode
    const q = rep[key]?.address || item.location || "";
    if (q) {
      const hit = await geocodeTiered(`${q}, Las Vegas NV`);
      await sleep(1100);
      if (hit && inBounds(hit.lat, hit.lng)) {
        item.latitude = round(hit.lat);
        item.longitude = round(hit.lng);
        item.locatedBy = "address";
        console.log(`${name}: geocode "${q}" -> ${item.latitude},${item.longitude}`);
        continue;
      }
    }
    console.log(`${name}: UNRESOLVED (left off the map)`);
  }

  const items = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(SUBS, JSON.stringify({ items }, null, 2) + "\n", "utf8");
  const located = items.filter((i) => (i as Located).latitude != null).length;
  console.log(`\nWrote ${items.length} substations, ${located} located.`);
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
