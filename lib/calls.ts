import type { CallOutcome, CallRecord, Lead } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

const STATUS_RANK: Record<string, number> = {
  New: 0,
  "Contact found": 1,
  "Decision-maker identified; Needs phone/email": 2,
  "Outreach started": 3,
  "Spoke / Left message": 4,
  Interested: 5,
  "Not interested": 5,
  "Under contract": 6,
  Closed: 7,
};

/** Map a call outcome to a suggested lead status (may be ignored if richer status exists). */
export function statusForOutcome(outcome: string): string | null {
  switch (outcome as CallOutcome) {
    case "interested":
      return "Interested";
    case "not_interested":
    case "dnc":
      return "Not interested";
    case "connected":
    case "voicemail":
      return "Spoke / Left message";
    case "callback_set":
    case "no_answer":
    case "wrong_number":
      return "Outreach started";
    default:
      return null;
  }
}

/**
 * Apply outcome → status without wiping richer pipeline stages.
 * Under contract / Closed are never changed. Interested / Not interested
 * only change when the outcome clearly supersedes (interested / not_interested / dnc).
 */
export function applyOutcomeToStatus(currentStatus: string, outcome: string): string {
  const suggested = statusForOutcome(outcome);
  if (!suggested) return currentStatus || "New";

  const current = (currentStatus || "New").trim() || "New";
  if (current === "Under contract" || current === "Closed") return current;

  const terminalOutcomes = new Set(["interested", "not_interested", "dnc"]);
  if (
    (current === "Interested" || current === "Not interested") &&
    !terminalOutcomes.has(outcome)
  ) {
    return current;
  }

  const currentRank = STATUS_RANK[current] ?? 0;
  const nextRank = STATUS_RANK[suggested] ?? 0;
  if (nextRank >= currentRank) return suggested;
  return current;
}

function calledAtMs(call: CallRecord): number {
  const t = Date.parse(call.calledAt || "");
  return Number.isFinite(t) ? t : 0;
}

function callbackAtMs(call: CallRecord): number | null {
  const raw = (call.callbackAt || "").trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/**
 * Recompute lead rollups from full call history for one APN.
 *
 * nextCallbackAt rule:
 * 1. Among calls with a non-empty callbackAt, take the latest-by-calledAt
 *    callback that is still in the future (callbackAt >= now).
 * 2. If none are future, take the most recent callbackAt by calledAt
 *    (keeps overdue callbacks visible for Dispatch ranking).
 */
export function computeCallRollups(
  calls: CallRecord[],
  apn: string,
  now = new Date()
): Pick<Lead, "lastCalledAt" | "lastOutcome" | "nextCallbackAt" | "callCount"> {
  const key = normalizeApn(apn);
  const forApn = calls
    .filter((c) => normalizeApn(c.apn) === key)
    .slice()
    .sort((a, b) => calledAtMs(b) - calledAtMs(a));

  const newest = forApn[0];
  const nowMs = now.getTime();

  let nextCallbackAt = "";
  const withCallback = forApn.filter((c) => callbackAtMs(c) != null);
  const future = withCallback.filter((c) => (callbackAtMs(c) as number) >= nowMs);
  if (future.length) {
    // already sorted by calledAt desc — first future is latest-scheduled among recent calls
    nextCallbackAt = (future[0].callbackAt || "").trim();
  } else if (withCallback.length) {
    nextCallbackAt = (withCallback[0].callbackAt || "").trim();
  }

  return {
    lastCalledAt: newest?.calledAt || "",
    lastOutcome: newest?.outcome || "",
    nextCallbackAt,
    callCount: forApn.length ? String(forApn.length) : "0",
  };
}

export function applyRollupsToLead(lead: Lead, calls: CallRecord[], now?: Date): Lead {
  const rollups = computeCallRollups(calls, lead.apn, now);
  return {
    ...lead,
    ...rollups,
    // never invent skip-trace; preserve whatever was stored
    needsSkipTrace: lead.needsSkipTrace || "",
  };
}

export function outcomeLabel(outcome: string): string {
  const map: Record<string, string> = {
    connected: "Connected",
    voicemail: "Voicemail",
    no_answer: "No answer",
    wrong_number: "Wrong number",
    callback_set: "Callback set",
    interested: "Interested",
    not_interested: "Not interested",
    dnc: "Do not call",
  };
  return map[outcome] || outcome || "—";
}

export function isOverdueCallback(lead: Lead, now = new Date()): boolean {
  const raw = (lead.nextCallbackAt || "").trim();
  if (!raw) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t < now.getTime();
}

export function isNeverCalled(lead: Lead): boolean {
  const count = Number(lead.callCount || "0");
  return !lead.lastCalledAt && (!Number.isFinite(count) || count <= 0);
}

export function newCallId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
