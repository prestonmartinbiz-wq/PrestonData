import type { Lead, PowerAvailability } from "@/lib/types";
import { needsContact, slugify } from "@/lib/utils";

/** Substation/type/acres metadata embedded in a lead's Notes field. */
export type LeadMeta = {
  substation: string;
  type: string;
  acres: number | null;
};

const UNASSIGNED = "Unassigned";

/**
 * Parse the "Substation: X · Type: Y · Acres: Z" metadata that imports embed in
 * the lead Notes field. Tolerant of missing fields and separator variants.
 */
export function parseLeadMeta(notes: string): LeadMeta {
  const get = (label: string): string => {
    const re = new RegExp(`${label}\\s*:\\s*([^·|\\n]+)`, "i");
    const m = re.exec(notes || "");
    return m ? m[1].trim() : "";
  };
  const acresRaw = get("Acres");
  const acres = acresRaw ? Number(acresRaw) : NaN;
  return {
    substation: get("Substation"),
    type: get("Type"),
    acres: Number.isFinite(acres) ? acres : null,
  };
}

/** Vacant developable land vs. an already-built/developed parcel. */
export function isLand(type: string): boolean {
  return (type || "").trim().toLowerCase() === "land";
}

/** A parcel is "worked" once it has at least one logged call. */
export function isWorked(lead: Lead): boolean {
  return Boolean((lead.callCount && Number(lead.callCount) > 0) || lead.lastCalledAt);
}

export type ParcelSummary = {
  apn: string;
  propertyAddress: string;
  ownerEntity: string;
  status: string;
  assignedTo: string;
  type: string;
  acres: number | null;
  needsContact: boolean;
  worked: boolean;
};

export type SubstationBucket = {
  name: string;
  slug: string;
  parcels: number;
  land: number;
  built: number;
  noContact: number;
  worked: number;
  workedPct: number;
  acres: number;
  power: PowerAvailability[];
  feederCount: number;
  totalMva: number | null;
};

function emptyBucket(name: string): SubstationBucket {
  return {
    name,
    slug: slugify(name) || "unassigned",
    parcels: 0,
    land: 0,
    built: 0,
    noContact: 0,
    worked: 0,
    workedPct: 0,
    acres: 0,
    power: [],
    feederCount: 0,
    totalMva: null,
  };
}

function feederStats(power: PowerAvailability[]): {
  feederCount: number;
  totalMva: number | null;
} {
  const byId = new Map<string, number | null>();
  for (const p of power) {
    for (const f of p.feeders) {
      const prev = byId.get(f.id);
      if (prev === undefined) byId.set(f.id, f.mva);
      else if (f.mva !== null && (prev === null || f.mva > prev)) byId.set(f.id, f.mva);
    }
  }
  const mvas = Array.from(byId.values()).filter((v): v is number => v !== null);
  return {
    feederCount: byId.size,
    totalMva: mvas.length ? Math.round(mvas.reduce((a, b) => a + b, 0) * 100) / 100 : null,
  };
}

/**
 * Group leads into substation buckets and attach any power-availability records.
 * The result is the union of substations found in leads and in power data, so a
 * substation known only from an uploaded email still appears as a bucket.
 */
export function buildSubstationBuckets(
  leads: Lead[],
  power: PowerAvailability[] = []
): SubstationBucket[] {
  const buckets = new Map<string, SubstationBucket>();

  const keyFor = (name: string) => (name || UNASSIGNED).trim().toLowerCase();

  const ensure = (name: string): SubstationBucket => {
    const key = keyFor(name);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyBucket((name || UNASSIGNED).trim());
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const lead of leads) {
    const meta = parseLeadMeta(lead.notes);
    const bucket = ensure(meta.substation);
    bucket.parcels += 1;
    if (isLand(meta.type)) bucket.land += 1;
    else bucket.built += 1;
    if (needsContact(lead)) bucket.noContact += 1;
    if (isWorked(lead)) bucket.worked += 1;
    if (meta.acres) bucket.acres += meta.acres;
  }

  for (const p of power) {
    const bucket = ensure(p.substation);
    bucket.power.push(p);
  }

  for (const bucket of buckets.values()) {
    bucket.workedPct = bucket.parcels
      ? Math.round((bucket.worked / bucket.parcels) * 100)
      : 0;
    bucket.acres = Math.round(bucket.acres * 100) / 100;
    const stats = feederStats(bucket.power);
    bucket.feederCount = stats.feederCount;
    bucket.totalMva = stats.totalMva;
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (b.parcels !== a.parcels) return b.parcels - a.parcels;
    return a.name.localeCompare(b.name);
  });
}

/** Parcels belonging to a substation slug, as lightweight summaries. */
export function parcelsForSlug(leads: Lead[], slug: string): ParcelSummary[] {
  return leads
    .map((lead) => ({ lead, meta: parseLeadMeta(lead.notes) }))
    .filter(({ meta }) => (slugify(meta.substation) || "unassigned") === slug)
    .map(({ lead, meta }) => ({
      apn: lead.apn,
      propertyAddress: lead.propertyAddress,
      ownerEntity: lead.ownerEntity,
      status: lead.status,
      assignedTo: lead.assignedTo,
      type: meta.type,
      acres: meta.acres,
      needsContact: needsContact(lead),
      worked: isWorked(lead),
    }));
}
