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
