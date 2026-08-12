import Papa from "papaparse";
import { EMPTY_LEAD, type Lead } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

/**
 * Parse a Crexi "Property Exports" CSV into leads, tagging every parcel with the
 * given substation. Crexi exports do not carry a substation column — the
 * substation is implied by the file the user is uploading — so it is provided
 * separately and stored in the lead Notes as "Substation: … · Type: … · Acres: …",
 * matching the metadata format the rest of the app reads.
 */

function get(row: Record<string, string>, key: string): string {
  const v = row[key];
  return v == null ? "" : String(v).trim();
}

function joinParts(parts: (string | undefined)[], sep = " "): string {
  return parts
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(sep);
}

function buildAddress(row: Record<string, string>): string {
  const street = joinParts([get(row, "Address"), get(row, "Unit")]);
  const cityState = joinParts([
    get(row, "City"),
    get(row, "State"),
    get(row, "Zip Code"),
  ]);
  const full = joinParts([street, cityState]);
  if (full) return full;
  const name = get(row, "Property Name");
  return name && !/^multiple apn$/i.test(name) ? name : "";
}

function buildMailing(row: Record<string, string>): string {
  const line = joinParts([
    get(row, "Mailing Address"),
    get(row, "Mailing Address Unit"),
  ]);
  const cityState = joinParts([
    get(row, "Mailing Address City"),
    get(row, "Mailing Address State"),
    get(row, "Mailing Address Zip Code"),
  ]);
  const careOf = get(row, "Mailing Address Care Of");
  const base = joinParts([line, cityState], ", ");
  return careOf ? joinParts([`C/O ${careOf}`, base], "; ") : base;
}

function buildNotes(row: Record<string, string>, substation: string): string {
  const type = get(row, "Property Type") || "";
  const acresRaw = get(row, "Lot Size Acres");
  const acres = acresRaw && Number.isFinite(Number(acresRaw)) ? Number(acresRaw) : null;
  const parts = [`Substation: ${substation}`];
  if (type) parts.push(`Type: ${type}`);
  if (acres !== null) parts.push(`Acres: ${acres}`);
  parts.push("Import: crexi");
  return parts.join(" · ");
}

export function parseCrexiCsv(csvText: string, substation: string): Lead[] {
  const sub = (substation || "").trim();
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return parsed.data
    .map((row) => {
      const apn = normalizeApn(get(row, "APN"));
      if (!apn) return null;

      const phone = get(row, "Phone 1");
      const email = get(row, "Email 1");
      const hasContact = Boolean(phone || email);

      const lead: Lead = {
        ...EMPTY_LEAD,
        apn,
        propertyAddress: buildAddress(row),
        ownerEntity: get(row, "Owner Name"),
        decisionMaker: get(row, "Contact Name"),
        title: "",
        phone,
        email,
        altPhone: get(row, "Phone 2"),
        mailingAddress: buildMailing(row),
        confidence: "",
        sources: joinParts(["Crexi export", get(row, "Property Link")], " · "),
        notes: buildNotes(row, sub),
        status: hasContact ? "Contact found" : "New",
        latitude: get(row, "Latitude"),
        longitude: get(row, "Longitude"),
      };
      return lead;
    })
    .filter((l): l is Lead => l !== null);
}
