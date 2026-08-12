import Papa from "papaparse";
import {
  EMPTY_LEAD,
  LEAD_CSV_HEADERS,
  LEAD_FIELD_BY_HEADER,
  type Lead,
} from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).length) return String(row[key]);
  }
  return "";
}

export function parseLeadsCsv(csvText: string): Lead[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return parsed.data
    .map((row) => {
      const lead: Lead = { ...EMPTY_LEAD };
      for (const [header, field] of Object.entries(LEAD_FIELD_BY_HEADER)) {
        lead[field] = pick(row, [header]) || "";
      }
      // tolerate slight header variants
      lead.apn = lead.apn || pick(row, ["apn", "Apn"]);
      lead.assignedTo =
        lead.assignedTo || pick(row, ["Assigned To", "AssignedTo", "assigned_to"]);
      return lead;
    })
    .filter((l) => normalizeApn(l.apn));
}

export function leadsToCsv(leads: Lead[]): string {
  const rows = leads.map((lead) => ({
    APN: lead.apn,
    "Property Address": lead.propertyAddress,
    "Owner Entity": lead.ownerEntity,
    "Decision Maker": lead.decisionMaker,
    Title: lead.title,
    Phone: lead.phone,
    Email: lead.email,
    "Alt Phone": lead.altPhone,
    "Mailing / RA Address": lead.mailingAddress,
    Confidence: lead.confidence,
    Sources: lead.sources,
    Notes: lead.notes,
    Status: lead.status,
    "Assigned To": lead.assignedTo,
  }));

  return Papa.unparse(rows, { columns: [...LEAD_CSV_HEADERS] });
}

export function mergeLeadsByApn(
  existing: Lead[],
  incoming: Lead[],
  options: { preserveAssignedToUnlessProvided?: boolean } = {}
): Lead[] {
  const { preserveAssignedToUnlessProvided = true } = options;
  const map = new Map<string, Lead>();

  for (const lead of existing) {
    map.set(normalizeApn(lead.apn), { ...lead, apn: normalizeApn(lead.apn) || lead.apn });
  }

  for (const raw of incoming) {
    const key = normalizeApn(raw.apn);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...raw, apn: key });
      continue;
    }
    const next: Lead = { ...prev, ...raw, apn: key };
    if (
      preserveAssignedToUnlessProvided &&
      !(raw.assignedTo || "").trim()
    ) {
      next.assignedTo = prev.assignedTo;
    }
    map.set(key, next);
  }

  return Array.from(map.values());
}
