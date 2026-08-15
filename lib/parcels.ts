/**
 * Clark County (Las Vegas) parcel boundaries + APN from the county's free public
 * GISMO ArcGIS service. Owner name is redacted from this layer (we capture owner
 * ourselves); geometry + APN + acreage are public.
 *
 * We fetch server-side (see /api/parcels) to avoid browser CORS and to keep the
 * upstream URL in one place.
 */

const PARCELS_LAYER =
  "https://maps.clarkcountynv.gov/arcgis/rest/services/GISMO/AssessorMapv2/MapServer/1/query";

type EsriGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown> | null;
    geometry: unknown;
  }>;
};

async function fetchGeoJson(params: Record<string, string>): Promise<EsriGeoJson> {
  const qs = new URLSearchParams({
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "APN,CALC_ACRES,ASSR_ACRES,PARCELTYPE",
    returnGeometry: "true",
    f: "geojson",
    ...params,
  });
  const res = await fetch(`${PARCELS_LAYER}?${qs.toString()}`, {
    headers: { Accept: "application/json" },
    // The county data changes slowly; let the platform cache briefly.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Clark County parcels request failed (${res.status})`);
  const data = (await res.json()) as EsriGeoJson;
  if (!data || !Array.isArray(data.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  return data;
}

/** Parcels intersecting a bounding box (for drawing the current map view). */
export function parcelsInBbox(
  west: number,
  south: number,
  east: number,
  north: number
): Promise<EsriGeoJson> {
  return fetchGeoJson({
    geometry: `${west},${south},${east},${north}`,
    geometryType: "esriGeometryEnvelope",
    resultRecordCount: "2000",
  });
}

/** The single parcel at a clicked point. */
export function parcelAtPoint(lng: number, lat: number): Promise<EsriGeoJson> {
  return fetchGeoJson({
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
  });
}

/** A parcel by APN (dash-less, as stored by the county). */
export function parcelByApn(apn: string): Promise<EsriGeoJson> {
  const clean = (apn || "").replace(/[^0-9]/g, "");
  return fetchGeoJson({ where: `APN='${clean}'` });
}
