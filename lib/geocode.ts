/**
 * Keyless geocoding via OpenStreetMap Nominatim. We use this instead of Google's
 * Geocoding API so map coordinates never depend on the browser Maps key having
 * the (separately-billed) Geocoding API enabled. Results are persisted onto the
 * lead so this only runs once per parcel.
 *
 * Nominatim usage policy: max ~1 request/second and a descriptive User-Agent.
 */

export type GeocodeHit = { lat: number; lng: number; display?: string };

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  "rmax-crm/1.0 (substation coverage map; https://github.com/anywheredc)";

/** Collapse whitespace and normalize comma spacing for a cleaner query. */
export function cleanAddress(addr: string): string {
  return (addr || "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
}

/** True when a lead already has usable WGS84 coordinates. */
export function hasCoords(latitude: string, longitude: string): boolean {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0
  );
}

export async function geocodeAddress(address: string): Promise<GeocodeHit | null> {
  const q = cleanAddress(address);
  if (!q) return null;
  const url = `${NOMINATIM}?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(
    q
  )}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let arr: Array<{ lat: string; lon: string; display_name?: string }>;
  try {
    arr = (await res.json()) as typeof arr;
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || !arr.length) return null;
  const lat = Number(arr[0].lat);
  const lng = Number(arr[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, display: arr[0].display_name };
}

/**
 * Try progressively coarser queries so brand-new subdivisions Nominatim lacks at
 * house-number precision still resolve to the street, then the ZIP centroid.
 */
export async function geocodeTiered(
  address: string,
  throttleMs = 1100
): Promise<GeocodeHit | null> {
  const addr = cleanAddress(address);
  if (!addr) return null;
  const tiers = [addr];
  const street = addr.replace(/^\s*\d+\s+/, "");
  if (street !== addr) tiers.push(street);
  const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(addr)?.[1];
  if (zip) tiers.push(`${zip}, USA`);

  for (let i = 0; i < tiers.length; i++) {
    const hit = await geocodeAddress(tiers[i]);
    if (hit) return hit;
    if (i < tiers.length - 1) await sleep(throttleMs);
  }
  return null;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
