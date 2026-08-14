import type { Feeder, PowerAvailability } from "@/lib/types";
import { parseEml, type ParsedEmail } from "@/lib/eml";
import { normalizeApn } from "@/lib/utils";

/** Normalize a feeder id like "HI1225" or "hi-1222" to "HI-1225". */
function normalizeFeederId(raw: string): string {
  const m = /^([A-Za-z]{2,3})-?\s*(\d{3,4})$/.exec(raw.trim());
  if (!m) return raw.trim().toUpperCase();
  return `${m[1].toUpperCase()}-${m[2]}`;
}

/** Convert a capacity amount + unit to MVA. */
function toMva(amount: number, unit: string): number {
  return /kva/i.test(unit) ? amount / 1000 : amount;
}

/** Render feeders as an editable text string, e.g. "HI-1222:6.5, HI-1225:8". */
export function feedersToText(feeders: Feeder[]): string {
  return feeders
    .map((f) => (f.mva !== null ? `${f.id}:${f.mva}` : f.id))
    .join(", ");
}

/**
 * Parse a free-text feeder list into structured feeders. Accepts separators of
 * comma / semicolon / newline and pairs like "HI-1222:6.5", "HI-1225 8 MVA",
 * "HI-1206 500 kVA", or a bare "HI-1234".
 */
export function parseFeederText(input: string): Feeder[] {
  const tokens = (input || "")
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: Feeder[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const m = /^([A-Za-z]{2,3}-?\s*\d{3,4})\s*[:=\s]?\s*([\d.]+)?\s*(MVA|kVA)?/i.exec(
      token
    );
    if (!m) continue;
    const id = normalizeFeederId(m[1]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const mva = m[2] ? toMva(parseFloat(m[2]), m[3] || "MVA") : null;
    out.push({ id, mva });
  }
  return out;
}

function extractSubstation(text: string): string {
  // Prefer an explicit "Substation: X" label, then the single proper noun that
  // precedes "substation" (e.g. "Two Highland substation feeders" -> "Highland").
  const labeled = /\bsubstation:\s*([A-Za-z0-9 .-]+)/i.exec(text);
  if (labeled) return labeled[1].trim();
  const m = /\b([A-Z][A-Za-z]+)\s+substation\b/.exec(text);
  return m ? m[1].trim() : "";
}

function extractApn(text: string): string {
  const m = /\b(?:APN|Parcel)\s*:?\s*[\n\r]*\s*([0-9]{6,})/i.exec(text);
  return m ? m[1].trim() : "";
}

function extractAddress(text: string, apn: string): string {
  // Common form: "APN: 16204406012, 2441 WESTERN"
  const afterApn = new RegExp(
    apn ? `${apn}\\s*,\\s*([0-9]{1,6}\\s+[A-Za-z][A-Za-z0-9 .]+)` : "$^"
  ).exec(text);
  if (afterApn) return afterApn[1].trim();
  // Standalone address line, e.g. "2441 WESTERN"
  const line = /(^|\n)\s*(\d{2,6}\s+[A-Z][A-Z]{2,}(?:\s+[A-Z]+)?)\s*(\n|$)/.exec(
    text
  );
  return line ? line[2].trim() : "";
}

function extractIsd(text: string): string {
  const m = /\bISD:?\s*([A-Za-z0-9]{1,3}\s*\d{4}|[A-Za-z]+\s+\d{4}|\d{4})/i.exec(
    text
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function extractPeakDemand(text: string): string {
  const m = /\bPeak Demand:?\s*([^\n\r]+)/i.exec(text);
  if (m) return m[1].trim();
  // Fallback to a "Power: 10mgs / 15mgs" style line
  const p = /\bPower:?\s*([^\n\r]+)/i.exec(text);
  return p ? p[1].trim() : "";
}

function extractFeeders(text: string): Feeder[] {
  const byId = new Map<string, number | null>();

  const note = (rawId: string, mva: number | null) => {
    const id = normalizeFeederId(rawId);
    if (!id) return;
    const prev = byId.get(id);
    if (prev === undefined) {
      byId.set(id, mva);
    } else if (mva !== null && (prev === null || mva > prev)) {
      // Keep the largest capacity seen for a feeder (the higher design scenario).
      byId.set(id, mva);
    }
  };

  // Form: a per-feeder detail line beginning with the id, e.g.
  // "HI-1222, 6.5 MVA: Install switch...". Anchored to line start so it does not
  // cross-match comma-separated "@" lists like "6.5 MVA @ HI-1222, 8 MVA @ HI-1225".
  const re1 = /^[\s>]*([A-Za-z]{2,3}-?\d{3,4})\s*,\s*([\d.]+)\s*(MVA|kVA)\b/gim;
  for (const m of text.matchAll(re1)) {
    note(m[1], toMva(parseFloat(m[2]), m[3]));
  }

  // Form: "5 MVA @ HI-1222"
  const re2 = /([\d.]+)\s*(MVA|kVA)\s*@\s*([A-Za-z]{2,3}-?\d{3,4})/gi;
  for (const m of text.matchAll(re2)) {
    note(m[3], toMva(parseFloat(m[1]), m[2]));
  }

  // Any remaining bare feeder ids with no capacity captured.
  const re3 = /\b([A-Za-z]{2,3}-?\d{3,4})\b/gi;
  for (const m of text.matchAll(re3)) {
    const id = normalizeFeederId(m[1]);
    // Only accept ids that look like feeders (letters then 3-4 digits).
    if (/^[A-Z]{2,3}-\d{3,4}$/.test(id) && !byId.has(id)) byId.set(id, null);
  }

  return Array.from(byId.entries())
    .map(([id, mva]) => ({ id, mva }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function extractTrenching(text: string): { total: number | null; segments: number } {
  let total = 0;
  let segments = 0;
  // Match trenching in feet, both "3,000 ft of trenching" and "300 feet of
  // trenching". Trenching stated in miles is the long-haul (heavy) option we
  // exclude from viable capacity, so it is intentionally NOT summed here.
  const re = /([\d,]+)\s*(?:ft|feet|foot|')\s+of\s+trenching/gi;
  for (const m of text.matchAll(re)) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n)) {
      total += n;
      segments += 1;
    }
  }
  // Also catch "300 feet of trenching" phrased as "trenching ... 300 feet".
  const re2 = /trenching[^.\n]{0,40}?([\d,]+)\s*(?:ft|feet|foot|')\b/gi;
  for (const m of text.matchAll(re2)) {
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n !== 0) {
      // avoid double counting the "N ft of trenching" form already handled
      if (!new RegExp(`${m[1]}\\s*(?:ft|feet|foot|')\\s+of\\s+trenching`, "i").test(text)) {
        total += n;
        segments += 1;
      }
    }
  }
  return { total: segments ? total : null, segments };
}

function extractContactName(text: string): string {
  const sig =
    /\n\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s*\|\s*[A-Za-z]/.exec(text);
  if (sig) return sig[1].trim();
  const thanks = /Thank you,\s*\n+\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/.exec(text);
  return thanks ? thanks[1].trim() : "";
}

function extractContactEmail(text: string, from: string): string {
  const explicit = /\bEmail:?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i.exec(
    text
  );
  if (explicit) return explicit[1];
  const nve = /([A-Za-z0-9._%+-]+@nvenergy\.com)/i.exec(text);
  if (nve) return nve[1];
  const fromEmail = /<([^>]+@[^>]+)>/.exec(from) || /([^\s<]+@[^\s>]+)/.exec(from);
  return fromEmail ? fromEmail[1] : "";
}

function extractSubject(text: string, headerSubject: string): string {
  if (headerSubject) return headerSubject;
  const m = /\n\s*Subject:\s*([^\n\r]+)/i.exec(text);
  return m ? m[1].trim() : "";
}

export type ParsedPower = Omit<PowerAvailability, "id" | "createdAt">;

/**
 * Extract structured power-availability data from already-parsed email content.
 */
export function extractPowerFromText(
  text: string,
  meta: Partial<Pick<ParsedEmail, "subject" | "date" | "from">> & {
    sourceFile?: string;
  } = {}
): ParsedPower {
  const apn = extractApn(text);
  const trenching = extractTrenching(text);
  return {
    substation: extractSubstation(text),
    apn: normalizeApn(apn) || apn,
    address: extractAddress(text, apn),
    isd: extractIsd(text),
    peakDemand: extractPeakDemand(text),
    feeders: extractFeeders(text),
    trenchingFt: trenching.total,
    trenchingSegments: trenching.segments,
    contactName: extractContactName(text),
    contactEmail: extractContactEmail(text, meta.from || ""),
    emailSubject: extractSubject(text, meta.subject || ""),
    emailDate: meta.date || "",
    sourceFile: meta.sourceFile || "",
  };
}

/** Parse a raw .eml file and extract structured power-availability data. */
export function parsePowerEml(raw: string, sourceFile = ""): ParsedPower {
  const email = parseEml(raw);
  return extractPowerFromText(email.text, {
    subject: email.subject,
    date: email.date,
    from: email.from,
    sourceFile,
  });
}
