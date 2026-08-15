import { ExternalLink } from "lucide-react";

/**
 * Live, interactive Google Map embedded via the keyless `output=embed` endpoint
 * (pan / zoom / satellite / Street View, no API key required). Center it with
 * explicit lat/lng, otherwise fall back to a free-text place query.
 *
 * For per-parcel pins across a whole substation we'd use the Google Maps
 * JavaScript API (needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY); this keyless embed
 * centers the map on the area and stays fully interactive.
 */
export function GoogleMapEmbed({
  lat,
  lng,
  query,
  zoom = 12,
  height = 360,
  label = "Map",
}: {
  lat?: number | null;
  lng?: number | null;
  query?: string;
  zoom?: number;
  height?: number;
  label?: string;
}) {
  const hasCoords =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng);

  const src = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(query || "Las Vegas, NV")}&output=embed`;

  const externalHref = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        query || "Las Vegas, NV"
      )}`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <iframe
        title={label}
        src={src}
        width="100%"
        height={height}
        style={{ border: 0 }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50 px-3 py-1.5">
        <a
          href={externalHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
        >
          Open in Google Maps <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
