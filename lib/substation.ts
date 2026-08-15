import type { Lead, PowerAvailability, SubstationMeta } from "@/lib/types";
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
  /** Location or service area, from substation metadata. */
  location?: string;
  /** Alternate/public name, from substation metadata. */
  aka?: string;
  /** Underlying substation names when this bucket groups more than one. */
  members: string[];
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
    members: [],
  };
}

/** Index substation metadata by lowercased name for quick lookup. */
function indexMeta(metas: SubstationMeta[]): Map<string, SubstationMeta> {
  const map = new Map<string, SubstationMeta>();
  for (const m of metas) {
    if (m.name) map.set(m.name.trim().toLowerCase(), m);
  }
  return map;
}

/**
 * Resolve a raw substation name to its display bucket name, applying any group
 * alias from metadata (so two nearby substations collapse into one bucket).
 */
function resolveDisplay(
  name: string,
  metaByName: Map<string, SubstationMeta>
): { display: string; member: string } {
  const member = (name || "Unassigned").trim();
  const meta = metaByName.get(member.toLowerCase());
  return { display: (meta?.group || member).trim(), member };
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
  power: PowerAvailability[] = [],
  metas: SubstationMeta[] = []
): SubstationBucket[] {
  const buckets = new Map<string, SubstationBucket>();
  const metaByName = indexMeta(metas);
  const memberSets = new Map<string, Set<string>>();

  const ensure = (rawName: string): SubstationBucket => {
    const { display, member } = resolveDisplay(rawName || UNASSIGNED, metaByName);
    const key = display.toLowerCase();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyBucket(display);
      buckets.set(key, bucket);
      memberSets.set(key, new Set());
    }
    if (member && member.toLowerCase() !== display.toLowerCase()) {
      memberSets.get(key)!.add(member);
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

  // Add every substation that metadata assigns to a group as a member of that
  // group's bucket (so a group shows both names even if only one has records).
  for (const m of metas) {
    const display = (m.group || m.name || "").trim();
    const key = display.toLowerCase();
    const bucket = buckets.get(key);
    if (!bucket || !m.name) continue;
    if (m.name.trim().toLowerCase() !== key) memberSets.get(key)!.add(m.name.trim());
  }

  // Attach location/aka metadata and grouped member names.
  for (const [key, bucket] of buckets.entries()) {
    const members = Array.from(memberSets.get(key) ?? []).sort();
    bucket.members = members;
    // Prefer metadata matching the display name, else any member's metadata.
    const selfMeta = metaByName.get(key);
    const memberMeta = members
      .map((m) => metaByName.get(m.toLowerCase()))
      .find((m) => m && (m.location || m.aka));
    const chosen = selfMeta ?? memberMeta;
    if (chosen?.location) bucket.location = chosen.location;
    if (chosen?.aka) bucket.aka = chosen.aka;
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

/** Full leads belonging to a substation slug (grouping-aware). */
export function leadsForSlug(
  leads: Lead[],
  slug: string,
  metas: SubstationMeta[] = []
): Lead[] {
  const metaByName = indexMeta(metas);
  return leads.filter((lead) => {
    const { display } = resolveDisplay(parseLeadMeta(lead.notes).substation, metaByName);
    return (slugify(display) || "unassigned") === slug;
  });
}

/** Parcels belonging to a substation slug, as lightweight summaries. */
export function parcelsForSlug(
  leads: Lead[],
  slug: string,
  metas: SubstationMeta[] = []
): ParcelSummary[] {
  const metaByName = indexMeta(metas);
  return leads
    .map((lead) => ({ lead, meta: parseLeadMeta(lead.notes) }))
    .filter(({ meta }) => {
      const { display } = resolveDisplay(meta.substation, metaByName);
      return (slugify(display) || "unassigned") === slug;
    })
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
