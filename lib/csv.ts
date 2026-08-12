import Papa from "papaparse";
import {
  CALL_CSV_HEADERS,
  CALL_FIELD_BY_HEADER,
  EMPTY_CALL,
  EMPTY_LEAD,
  LEAD_CSV_HEADERS,
  LEAD_FIELD_BY_HEADER,
  type CallRecord,
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
      // tolerate slight header variants / older files missing rollup columns
      lead.apn = lead.apn || pick(row, ["apn", "Apn"]);
      lead.assignedTo =
        lead.assignedTo || pick(row, ["Assigned To", "AssignedTo", "assigned_to"]);
      lead.lastCalledAt =
        lead.lastCalledAt || pick(row, ["lastCalledAt", "LastCalledAt", "last_called_at"]);
      lead.lastOutcome =
        lead.lastOutcome || pick(row, ["lastOutcome", "LastOutcome", "last_outcome"]);
      lead.nextCallbackAt =
        lead.nextCallbackAt ||
        pick(row, ["nextCallbackAt", "NextCallbackAt", "next_callback_at"]);
      lead.callCount =
        lead.callCount || pick(row, ["callCount", "CallCount", "call_count"]);
      lead.needsSkipTrace =
        lead.needsSkipTrace ||
        pick(row, ["needsSkipTrace", "NeedsSkipTrace", "needs_skip_trace"]);
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
    "Last Called At": lead.lastCalledAt || "",
    "Last Outcome": lead.lastOutcome || "",
    "Next Callback At": lead.nextCallbackAt || "",
    "Call Count": lead.callCount || "",
    "Needs Skip Trace": lead.needsSkipTrace || "",
  }));

  return Papa.unparse(rows, { columns: [...LEAD_CSV_HEADERS] });
}

export function parseCallsCsv(csvText: string): CallRecord[] {
  if (!(csvText || "").trim()) return [];

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return parsed.data
    .map((row) => {
      const call: CallRecord = { ...EMPTY_CALL };
      for (const [header, field] of Object.entries(CALL_FIELD_BY_HEADER)) {
        call[field] = pick(row, [header]) || "";
      }
      call.callId = call.callId || pick(row, ["callId", "CallId", "call_id"]);
      call.apn = call.apn || pick(row, ["apn", "Apn"]);
      call.caller = call.caller || pick(row, ["caller"]);
      call.contactName =
        call.contactName || pick(row, ["contactName", "ContactName", "contact_name"]);
      call.phoneUsed =
        call.phoneUsed || pick(row, ["phoneUsed", "PhoneUsed", "phone_used"]);
      call.calledAt =
        call.calledAt || pick(row, ["calledAt", "CalledAt", "called_at"]);
      call.outcome = call.outcome || pick(row, ["outcome"]);
      call.callbackAt =
        call.callbackAt || pick(row, ["callbackAt", "CallbackAt", "callback_at"]);
      call.notes = call.notes || pick(row, ["notes"]);
      call.durationSec =
        call.durationSec || pick(row, ["durationSec", "DurationSec", "duration_sec"]);
      call.source = call.source || pick(row, ["source"]) || "crm_ui";
      return call;
    })
    .filter((c) => normalizeApn(c.apn) && (c.callId || c.calledAt));
}

export function callsToCsv(calls: CallRecord[]): string {
  const rows = calls.map((call) => ({
    "Call ID": call.callId,
    APN: call.apn,
    Caller: call.caller,
    "Contact Name": call.contactName,
    "Phone Used": call.phoneUsed,
    "Called At": call.calledAt,
    Outcome: call.outcome,
    "Callback At": call.callbackAt,
    Notes: call.notes,
    "Duration Sec": call.durationSec,
    Source: call.source || "crm_ui",
  }));

  if (!rows.length) {
    return Papa.unparse([], { columns: [...CALL_CSV_HEADERS] });
  }

  return Papa.unparse(rows, { columns: [...CALL_CSV_HEADERS] });
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
    if (preserveAssignedToUnlessProvided && !(raw.assignedTo || "").trim()) {
      next.assignedTo = prev.assignedTo;
    }
    // Preserve rollups / skip-trace when incoming CSV omits them
    if (!(raw.lastCalledAt || "").trim()) next.lastCalledAt = prev.lastCalledAt;
    if (!(raw.lastOutcome || "").trim()) next.lastOutcome = prev.lastOutcome;
    if (!(raw.nextCallbackAt || "").trim()) next.nextCallbackAt = prev.nextCallbackAt;
    if (!(raw.callCount || "").trim()) next.callCount = prev.callCount;
    if (!(raw.needsSkipTrace || "").trim()) next.needsSkipTrace = prev.needsSkipTrace;
    map.set(key, next);
  }

  return Array.from(map.values());
}
