import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeApn(apn: string): string {
  return (apn || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Clark County GISMO OpenWeb parcel view (digits-only APN via normalizeApn). */
export function clarkGismoUrl(apn: string): string | null {
  const key = normalizeApn(apn);
  if (!key) return null;
  return `https://gisgate.co.clark.nv.us/ow/?@${key}`;
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
