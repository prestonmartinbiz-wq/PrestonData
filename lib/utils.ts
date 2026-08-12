import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeApn(apn: string): string {
  return (apn || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

const CLARK_OPENWEB_BASE = "https://maps.clarkcountynv.gov/ow/";
/** Default OpenWeb zoom for Nevada State Plane (easting/northing) links. */
const CLARK_OPENWEB_STATE_PLANE_ZOOM = 6;

function trimCoord(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export type ClarkOpenWebCoords = {
  lat?: string | number;
  lng?: string | number;
  /** Nevada State Plane easting (X), when known */
  easting?: string | number;
  /** Nevada State Plane northing (Y), when known */
  northing?: string | number;
  zoom?: string | number;
};

/**
 * Clark County GISMO / OpenWeb map.
 * Prefer state-plane `?@{x},{y},{zoom}`, then lat/lng, then parcel APN.
 * Host: maps.clarkcountynv.gov (not gisgate).
 */
export function clarkGismoUrl(
  apn: string,
  coords?: ClarkOpenWebCoords | null
): string | null {
  const easting = trimCoord(coords?.easting);
  const northing = trimCoord(coords?.northing);
  if (easting && northing) {
    const zoom =
      trimCoord(coords?.zoom) || String(CLARK_OPENWEB_STATE_PLANE_ZOOM);
    return `${CLARK_OPENWEB_BASE}?@${easting},${northing},${zoom}`;
  }

  const lat = trimCoord(coords?.lat);
  const lng = trimCoord(coords?.lng);
  if (lat && lng) {
    const zoom = trimCoord(coords?.zoom);
    return zoom
      ? `${CLARK_OPENWEB_BASE}?@${lat},${lng},${zoom}`
      : `${CLARK_OPENWEB_BASE}?@${lat},${lng}`;
  }

  const key = normalizeApn(apn);
  if (!key) return null;
  return `${CLARK_OPENWEB_BASE}?@${key}`;
}

/** Clark County Assessor parcel detail page. */
export function clarkAssessorUrl(apn: string): string | null {
  const key = normalizeApn(apn);
  if (!key) return null;
  return `https://maps.clarkcountynv.gov/assessor/assessorparceldetail/parceldetail.aspx?hdninstance=pcl7&hdnparcel=${encodeURIComponent(key)}`;
}

/**
 * Google Maps search for a property. Prefers lat/lng when both are provided;
 * otherwise uses a free-text address query.
 */
export function googleMapsUrl(
  address: string,
  coords?: { lat?: string | number; lng?: string | number } | null
): string | null {
  const lat = coords?.lat;
  const lng = coords?.lng;
  if (
    lat !== undefined &&
    lat !== null &&
    String(lat).trim() !== "" &&
    lng !== undefined &&
    lng !== null &&
    String(lng).trim() !== ""
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${String(lat).trim()},${String(lng).trim()}`
    )}`;
  }
  const q = (address || "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function needsContact(lead: {
  phone?: string;
  email?: string;
  altPhone?: string;
  status?: string;
}): boolean {
  const hasPhone = Boolean((lead.phone || "").trim() || (lead.altPhone || "").trim());
  const hasEmail = Boolean((lead.email || "").trim());
  const statusHint = (lead.status || "").toLowerCase().includes("needs phone");
  return statusHint || !hasPhone || !hasEmail;
}
