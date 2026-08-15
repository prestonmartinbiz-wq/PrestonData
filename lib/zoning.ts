/**
 * Zoning + jurisdiction from Clark County's free public "Planning and Zoning"
 * ArcGIS service, which carries a zoning polygon layer for every valley
 * jurisdiction (Las Vegas, North Las Vegas, Henderson, Boulder City, Mesquite,
 * and unincorporated Clark County).
 *
 * - Point lookup (for the parcel popup) is proxied server-side (see /api/zoning)
 *   to avoid CORS.
 * - The visual overlay is a Web-Mercator export image the client loads directly
 *   as a GroundOverlay (no CORS needed for an <img>-style layer).
 */

const BASE =
  "https://maps.clarkcountynv.gov/arcgis/rest/services/OpenData/PlanningandZoning/MapServer";

/** Zoning layers, city jurisdictions first; Clark County is the fallback. */
const LAYERS: {
  id: number;
  jurisdiction: string;
  zoneFields: string[];
  descFields: string[];
}[] = [
  { id: 7, jurisdiction: "Las Vegas", zoneFields: ["ZONE"], descFields: ["DESCRIPTIO"] },
  { id: 10, jurisdiction: "North Las Vegas", zoneFields: ["ZONING", "NLVZONE"], descFields: ["ZONEDESC"] },
  { id: 9, jurisdiction: "Henderson", zoneFields: ["ZONECODE", "COMZONE", "ZONEAPP"], descFields: [] },
  { id: 8, jurisdiction: "Boulder City", zoneFields: ["zone_class", "carto_code"], descFields: ["zone_name"] },
  { id: 13, jurisdiction: "Mesquite", zoneFields: ["UdoZoneCod"], descFields: [] },
  { id: 11, jurisdiction: "Clark County", zoneFields: ["ZNCLASS", "MLL_ZNCLASS"], descFields: ["Description"] },
];

/** Layers shown in the visual overlay export (all jurisdictions' zoning). */
export const OVERLAY_LAYERS = "show:7,8,9,10,11,13";

export type ZoningInfo = {
  jurisdiction: string;
  zone: string;
  description: string;
};

function firstField(attrs: Record<string, unknown>, fields: string[]): string {
  for (const f of fields) {
    const v = attrs[f];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

async function queryLayer(
  layer: (typeof LAYERS)[number],
  lng: number,
  lat: number
): Promise<{ zone: string; description: string } | null> {
  const qs = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });
  try {
    const res = await fetch(`${BASE}/${layer.id}/query?${qs}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const attrs = data.features?.[0]?.attributes;
    if (!attrs) return null;
    return {
      zone: firstField(attrs, layer.zoneFields),
      description: firstField(attrs, layer.descFields),
    };
  } catch {
    return null;
  }
}

export async function zoningAtPoint(lng: number, lat: number): Promise<ZoningInfo | null> {
  const results = await Promise.all(
    LAYERS.map((l) =>
      queryLayer(l, lng, lat)
        .then((r) => (r ? { ...r, layer: l } : null))
        .catch(() => null)
    )
  );
  // Prefer a city layer with a real zone; fall back to Clark County.
  for (const r of results) {
    if (r && r.layer.id !== 11 && r.zone) {
      return { jurisdiction: r.layer.jurisdiction, zone: r.zone, description: r.description };
    }
  }
  const cc = results.find((r) => r && r.layer.id === 11 && r.zone);
  if (cc) return { jurisdiction: "Clark County", zone: cc.zone, description: cc.description };
  return null;
}

function lngToX(lng: number): number {
  return (lng * 20037508.34) / 180;
}
function latToY(lat: number): number {
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  return (y * 20037508.34) / 180;
}

/** Web-Mercator zoning export image URL for a lat/lng viewport (GroundOverlay). */
export function zoningExportUrl(
  west: number,
  south: number,
  east: number,
  north: number,
  width: number,
  height: number
): string {
  const params = new URLSearchParams({
    bbox: `${lngToX(west)},${latToY(south)},${lngToX(east)},${latToY(north)}`,
    bboxSR: "3857",
    imageSR: "3857",
    layers: OVERLAY_LAYERS,
    size: `${Math.round(width)},${Math.round(height)}`,
    format: "png32",
    transparent: "true",
    dpi: "96",
    f: "image",
  });
  return `${BASE}/export?${params}`;
}
