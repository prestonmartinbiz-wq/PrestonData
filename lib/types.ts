export type Lead = {
  apn: string;
  propertyAddress: string;
  ownerEntity: string;
  decisionMaker: string;
  title: string;
  phone: string;
  email: string;
  altPhone: string;
  /** Pipe-delimited list of all phone numbers (source of truth for the phone editor). */
  phones: string;
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

/** A substation feeder and its available capacity (normalized to MVA). */
export type Feeder = {
  /** Feeder identifier, normalized to e.g. "HI-1222". */
  id: string;
  /** Available/required capacity in MVA (kVA values are converted to MVA). Null when unknown. */
  mva: number | null;
};

/**
 * Power-availability data extracted from an NV Energy coordinator email (.eml).
 * These describe where excess feeder capacity exists at a substation.
 */
export type PowerAvailability = {
  id: string;
  /** Substation name, e.g. "Highland". */
  substation: string;
  /** Parcel APN referenced in the request, if any. */
  apn: string;
  /** Property address referenced in the request. */
  address: string;
  /** In-service date, e.g. "Q2 2027". */
  isd: string;
  /** Peak demand as written, e.g. "10 MW and 15 MW". */
  peakDemand: string;
  /** Feeders and their capacities. */
  feeders: Feeder[];
  /** Total trenching distance in feet across all mentioned segments. Null when unknown. */
  trenchingFt: number | null;
  /** Number of distinct trenching segments mentioned. */
  trenchingSegments: number;
  /** Coordinator contact name from the signature, e.g. "Chad Jacks". */
  contactName: string;
  /** Coordinator contact email. */
  contactEmail: string;
  /** Source email subject. */
  emailSubject: string;
  /** Source email date. */
  emailDate: string;
  /** Original source filename, when uploaded. */
  sourceFile: string;
  /** ISO datetime this record was added. */
  createdAt: string;
  /**
   * When set, this board record is mirrored from a pipeline substation (id).
   * These records are rebuilt from the pipeline on every change so the board
   * always reflects confirmed studies; board-only records leave this empty.
   */
  sourcePipelineId?: string;
};

export type PowerData = {
  items: PowerAvailability[];
};

/**
 * Optional metadata about a substation: a public/known name, a location or
 * service area, and an optional group used to combine two nearby substations
 * (an "ownership group") into a single bucket.
 */
export type SubstationMeta = {
  /** Canonical substation name as it appears in leads/power data, e.g. "El Rancho". */
  name: string;
  /** Alternate/public name, if different. */
  aka?: string;
  /** Location or service area (may be a service area derived from requests). */
  location?: string;
  /** Combined bucket name when grouping nearby substations, e.g. "Highland / El Rancho". */
  group?: string;
  /** Freeform note. */
  notes?: string;
};

export type SubstationsData = {
  items: SubstationMeta[];
};

/** A follow-up task / "remind me to call" pinned to a user's task list. */
export type Task = {
  id: string;
  /** Related parcel APN (optional but usually set). */
  apn: string;
  /** Property address snapshot for display. */
  propertyAddress: string;
  /** Short title, e.g. "Call owner". */
  title: string;
  /** Optional note. */
  note: string;
  /** ISO datetime the task is due. */
  dueAt: string;
  /** User email this task is assigned to. */
  assignedTo: string;
  status: "open" | "done";
  createdBy: string;
  createdAt: string;
  completedAt: string;
};

export type TasksData = {
  items: Task[];
};

/** Substation Power Pipeline: lifecycle of an NV Energy power-availability study. */
export type PipelineStatus =
  | "to_be_searched"
  | "awaiting_nve_response"
  | "confirmed";

export type PipelinePriority = "High" | "Medium" | "Low";

/**
 * A pipeline entry is either a whole substation being studied, or a specific
 * "site" (a parcel/APN) whose power is expected from a substation. Both kinds
 * share the same lifecycle and flow through the EE Queue.
 */
export type PipelineKind = "substation" | "site";

/** One NV Energy response ("pull") for a substation — a substation can have several. */
export type PipelineResponse = {
  id: string;
  subject: string;
  date: string;
  from: string;
  /** Full plain-text body of the email. */
  text: string;
  mwAvailable: number | null;
  peakDemand: string;
  isdDate: string;
  feeders: Feeder[];
  trenchingFt: number | null;
  longLeadItems: string[];
  /** Public URLs of diagram images extracted from the email. */
  images: string[];
  sourceFile: string;
};

export type PipelineSubstation = {
  id: string;
  /** "substation" (default) or "site" (a specific parcel/APN). */
  kind?: PipelineKind;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  /** Site only: the parcel APN. */
  apn?: string;
  /** Site only: MW the site is requesting. */
  mwRequested?: number | null;
  /** Site only: substation the power is expected to come from. */
  expectedSubstation?: string;
  status: PipelineStatus;
  /** Analyst who flagged it. */
  submittedBy: string;
  dateAdded: string;
  /** Why the analyst wants this studied. */
  justification: string;
  /** Analyst priority, ranks the unconfirmed "Interest" list. */
  priority: PipelinePriority;
  /** EE who claimed it from the queue. */
  assignedEe: string;
  dateStudySubmittedToNve: string;
  /** Pasted email text or stored .eml text. */
  nveResponseRaw: string;
  mwAvailable: number | null;
  /** Peak demand as written in the email, e.g. "10 MW and 15 MW". */
  peakDemand: string;
  /** Feeders and their capacities pulled from the email. */
  feeders: Feeder[];
  /** Total trenching distance in feet across mentioned segments. */
  trenchingFt: number | null;
  isdDate: string;
  longLeadItems: string[];
  longLeadPresent: boolean;
  compositeScore: number | null;
  dateResponseReceived: string;
  notes: string;
  /** All NVE response pulls for this substation (full text + images). */
  responses: PipelineResponse[];
  /** Aggregated diagram image URLs across all responses. */
  images: string[];
  createdAt: string;
  updatedAt: string;
};

export type PipelineData = {
  items: PipelineSubstation[];
};

export const PIPELINE_PRIORITIES: PipelinePriority[] = ["High", "Medium", "Low"];

/* ------------------------------------------------------------------ *
 * Live deal tracking
 * ------------------------------------------------------------------ */

/**
 * How we control the site. "under_contract" deals (a signed PSA) carry harder
 * due dates; "landowner_relationship" deals (owner lets us do the work) are
 * softer and may or may not have a contract.
 */
export type DealType =
  | "negotiating"
  | "under_contract"
  | "landowner_relationship";

export const DEAL_TYPES: { value: DealType; label: string }[] = [
  { value: "negotiating", label: "Negotiating" },
  { value: "under_contract", label: "Under contract (PSA)" },
  { value: "landowner_relationship", label: "Landowner relationship" },
];

export type DealStage =
  | "prospecting"
  | "negotiating"
  | "secured"
  | "power_reservation"
  | "design"
  | "submitted"
  | "closed"
  | "dead";

export const DEAL_STAGES: { value: DealStage; label: string }[] = [
  { value: "prospecting", label: "Prospecting" },
  { value: "negotiating", label: "Negotiating" },
  { value: "secured", label: "Secured (control)" },
  { value: "power_reservation", label: "Power reservation" },
  { value: "design", label: "Design / documentation" },
  { value: "submitted", label: "Submitted to NVE" },
  { value: "closed", label: "Closed" },
  { value: "dead", label: "Dead" },
];

export type DealContact = {
  id: string;
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
};

export type DealDocStatus =
  | "needed"
  | "in_progress"
  | "received"
  | "submitted"
  | "na";

export const DEAL_DOC_STATUSES: { value: DealDocStatus; label: string }[] = [
  { value: "needed", label: "Needed" },
  { value: "in_progress", label: "In progress" },
  { value: "received", label: "Received" },
  { value: "submitted", label: "Submitted" },
  { value: "na", label: "N/A" },
];

/**
 * The documentation checklist NVE power reservations generally require. Not all
 * apply to every deal (each can be marked N/A). A file can be uploaded (when
 * object storage is available) or an external link (e.g. Google Drive) recorded.
 */
export const DEAL_DOC_CHECKLIST: { key: string; label: string }[] = [
  { key: "site_plan", label: "Site plan (with panel location marked)" },
  { key: "civil_dwg", label: "Civil Improvement Plans (.dwg CAD Files)" },
  { key: "civil_pdf", label: "Civil Improvement Plans (PDF)" },
  { key: "electrical_site_plan", label: "Electrical Site Plan" },
  { key: "building_electrical", label: "Building Electrical Plans" },
  { key: "single_line", label: "Single Line Diagram" },
  { key: "load_calc", label: "Load Calculation Sheet" },
  { key: "equipment_schedule", label: "Equipment Schedule" },
];

export type DealDocument = {
  id: string;
  /** Checklist key (see DEAL_DOC_CHECKLIST), "psa", "contract", or "other". */
  key: string;
  label: string;
  status: DealDocStatus;
  /** Stored file URL (blob/local) when a file was uploaded. */
  fileUrl: string;
  fileName: string;
  /** External link alternative to an upload (e.g. Google Drive). */
  link: string;
  note: string;
  updatedAt: string;
  updatedBy: string;
};

export type DealMilestone = {
  id: string;
  title: string;
  dueAt: string;
  doneAt: string;
  note: string;
};

/** A site / power-line diagram image (from an NVE email or uploaded directly). */
export type DealDiagram = {
  id: string;
  /** Stored image URL (blob/local) or an external image URL. */
  url: string;
  name: string;
  caption: string;
  /** Where it came from, e.g. "NVE email" or "upload". */
  source: string;
};

export type Deal = {
  id: string;
  name: string;
  type: DealType;
  stage: DealStage;
  apn: string;
  address: string;
  /** Substation the power is expected from (links to the pipeline/board). */
  substation: string;
  /** Target/requested MW for the deal. */
  mw: number | null;
  /** High-level description of the deal. */
  summary: string;
  /** Key/critical date (e.g. PSA contingency or close-of-escrow deadline). */
  keyDate: string;
  contacts: DealContact[];
  documents: DealDocument[];
  milestones: DealMilestone[];
  /** Site & power-line diagrams shown at the top of the deal and in exports. */
  diagrams: DealDiagram[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DealsData = {
  items: Deal[];
};

export type TeamData = {
  members: TeamMember[];
};

/** A self-service login account (username + password) for a team member. */
export type User = {
  id: string;
  username: string;
  name: string;
  email: string;
  /** scrypt hash as "salt:hash" (never sent to the client). */
  passwordHash: string;
  role: "admin" | "member";
  createdAt: string;
};

export type PublicUser = Omit<User, "passwordHash">;

export type UsersData = {
  users: User[];
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
  "Phones",
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
  Phones: "phones",
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
  phones: "",
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
