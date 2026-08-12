"use client";

import {
  clarkAssessorUrl,
  clarkGismoUrl,
  cn,
  googleMapsUrl,
} from "@/lib/utils";

type PropertyLinksProps = {
  apn: string;
  propertyAddress?: string;
  lat?: string | number;
  lng?: string | number;
  className?: string;
  /** Compact row style for table cells */
  compact?: boolean;
};

const linkClass =
  "text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-sm";

export function PropertyLinks({
  apn,
  propertyAddress = "",
  lat,
  lng,
  className,
  compact = false,
}: PropertyLinksProps) {
  const gismo = clarkGismoUrl(apn);
  const assessor = clarkAssessorUrl(apn);
  const maps = googleMapsUrl(propertyAddress, { lat, lng });

  if (!gismo && !assessor && !maps) return null;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-0.5",
        compact ? "text-[11px]" : "text-xs",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {gismo ? (
        <a
          href={gismo}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          title="Clark County GISMO / OpenWeb"
        >
          GISMO
        </a>
      ) : null}
      {maps ? (
        <a
          href={maps}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          title="Google Maps"
        >
          Maps
        </a>
      ) : null}
      {assessor ? (
        <a
          href={assessor}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          title="Clark County Assessor parcel detail"
        >
          Assessor
        </a>
      ) : null}
    </span>
  );
}
