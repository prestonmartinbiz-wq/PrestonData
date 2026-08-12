export type Lead = {
  apn: string;
  propertyAddress: string;
  ownerEntity: string;
  decisionMaker: string;
  title: string;
  phone: string;
  email: string;
  altPhone: string;
  mailingAddress: string;
  confidence: string;
  sources: string;
  notes: string;
  status: string;
  assignedTo: string;
  /** ISO datetime of most recent call (rollup from calls.csv) */
  lastCalledAt: string;
  /** Outcome of most recent call */
  lastOutcome: string;
  /**
   * Next callback to act on (rollup).
   * Rule: among calls with callbackAt, prefer the latest-by-calledAt callback
   * that is still in the future; if none are future, use the most recent
   * callbackAt (so overdue callbacks remain visible).
   */
  nextCallbackAt: string;
  /** Total calls logged for this APN */
  callCount: string;
  /** Skip-trace flag; preserved if already set — CRM does not invent skip-trace logic */
  needsSkipTrace: string;
};

export type CallOutcome =
  | "connected"
  | "voicemail"
  | "no_answer"
  | "wrong_number"
  | "not_interested"
  | "callback_set"
  | "interested"
  | "dnc";

export type CallRecord = {
  callId: string;
  apn: string;
  caller: string;
  contactName: string;
  phoneUsed: string;
  calledAt: string;
  outcome: CallOutcome | string;
  callbackAt: string;
  notes: string;
  durationSec: string;
  source: string;
};

export type TeamMember = {
  name: string;
  email: string;
};

export type TeamData = {
  members: TeamMember[];
};

export type SaveMeta = {
  source: "github" | "local";
  path: string;
  sha?: string;
  lastSavedAt?: string;
  lastSavedBy?: string;
  htmlUrl?: string;
};

export const LEAD_CSV_HEADERS = [
  "APN",
  "Property Address",
  "Owner Entity",
  "Decision Maker",
  "Title",
  "Phone",
  "Email",
  "Alt Phone",
  "Mailing / RA Address",
  "Confidence",
  "Sources",
  "Notes",
  "Status",
  "Assigned To",
  "Last Called At",
  "Last Outcome",
  "Next Callback At",
  "Call Count",
  "Needs Skip Trace",
] as const;

export const LEAD_FIELD_BY_HEADER: Record<string, keyof Lead> = {
  APN: "apn",
  "Property Address": "propertyAddress",
  "Owner Entity": "ownerEntity",
  "Decision Maker": "decisionMaker",
  Title: "title",
  Phone: "phone",
  Email: "email",
  "Alt Phone": "altPhone",
  "Mailing / RA Address": "mailingAddress",
  Confidence: "confidence",
  Sources: "sources",
  Notes: "notes",
  Status: "status",
  "Assigned To": "assignedTo",
  "Last Called At": "lastCalledAt",
  "Last Outcome": "lastOutcome",
  "Next Callback At": "nextCallbackAt",
  "Call Count": "callCount",
  "Needs Skip Trace": "needsSkipTrace",
};

export const EMPTY_LEAD: Lead = {
  apn: "",
  propertyAddress: "",
  ownerEntity: "",
  decisionMaker: "",
  title: "",
  phone: "",
  email: "",
  altPhone: "",
  mailingAddress: "",
  confidence: "",
  sources: "",
  notes: "",
  status: "New",
  assignedTo: "",
  lastCalledAt: "",
  lastOutcome: "",
  nextCallbackAt: "",
  callCount: "",
  needsSkipTrace: "",
};

export const LEAD_STATUSES = [
  "New",
  "Contact found",
  "Decision-maker identified; Needs phone/email",
  "Outreach started",
  "Spoke / Left message",
  "Interested",
  "Not interested",
  "Under contract",
  "Closed",
] as const;

export const CALL_CSV_HEADERS = [
  "Call ID",
  "APN",
  "Caller",
  "Contact Name",
  "Phone Used",
  "Called At",
  "Outcome",
  "Callback At",
  "Notes",
  "Duration Sec",
  "Source",
] as const;

export const CALL_FIELD_BY_HEADER: Record<string, keyof CallRecord> = {
  "Call ID": "callId",
  APN: "apn",
  Caller: "caller",
  "Contact Name": "contactName",
  "Phone Used": "phoneUsed",
  "Called At": "calledAt",
  Outcome: "outcome",
  "Callback At": "callbackAt",
  Notes: "notes",
  "Duration Sec": "durationSec",
  Source: "source",
};

export const CALL_OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "voicemail", label: "Voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "callback_set", label: "Callback set" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "dnc", label: "Do not call" },
] as const;

export const EMPTY_CALL: CallRecord = {
  callId: "",
  apn: "",
  caller: "",
  contactName: "",
  phoneUsed: "",
  calledAt: "",
  outcome: "no_answer",
  callbackAt: "",
  notes: "",
  durationSec: "",
  source: "crm_ui",
};

/** Outcomes that require / show a callbackAt field in the UI */
export const CALLBACK_OUTCOMES = new Set<string>(["callback_set", "interested", "connected"]);
