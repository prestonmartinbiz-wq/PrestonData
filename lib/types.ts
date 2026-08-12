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
  /** Optional WGS84 latitude from enrichment; empty when unknown */
  latitude: string;
  /** Optional WGS84 longitude from enrichment; empty when unknown */
  longitude: string;
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

export type TranscriptStatus = "pending" | "ready" | "failed" | "skipped" | "";

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
  /** Authenticated app URL to stream audio, e.g. /api/calls/{id}/audio */
  audioUrl: string;
  /** Storage locator: local:call-audio/... or blob:... */
  audioPath: string;
  transcript: string;
  transcriptStatus: TranscriptStatus | string;
  transcriptSummary: string;
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
  "Latitude",
  "Longitude",
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
  Latitude: "latitude",
  Longitude: "longitude",
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
  latitude: "",
  longitude: "",
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
  "Audio URL",
  "Audio Path",
  "Transcript",
  "Transcript Status",
  "Transcript Summary",
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
  "Audio URL": "audioUrl",
  "Audio Path": "audioPath",
  Transcript: "transcript",
  "Transcript Status": "transcriptStatus",
  "Transcript Summary": "transcriptSummary",
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
  audioUrl: "",
  audioPath: "",
  transcript: "",
  transcriptStatus: "",
  transcriptSummary: "",
};

/** Max upload size for call recordings (Whisper limit is 25MB). */
export const MAX_CALL_AUDIO_BYTES = 25 * 1024 * 1024;

export const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "video/webm", // some browsers label webm audio this way
]);

export const ALLOWED_AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".wav",
  ".webm",
  ".ogg",
  ".mp4",
] as const;

/** Outcomes that require / show a callbackAt field in the UI */
export const CALLBACK_OUTCOMES = new Set<string>(["callback_set", "interested", "connected"]);
