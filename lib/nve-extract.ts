import { extractPowerFromText } from "@/lib/power";
import type { Feeder } from "@/lib/types";

/**
 * Deterministic extraction of NV Energy power-availability responses.
 *
 * NVE emails follow a consistent format, so we pull the fields with plain
 * parsing — no AI, no API key. Reuses the battle-tested power parser for
 * substation / feeders (MVA, kVA->MVA) / trenching, and derives the pipeline
 * fields (MW available, ISD date, long-lead) on top.
 */

export type NveExtract = {
  mwAvailable: number | null;
  isdDate: string;
  longLeadItems: string[];
  notes: string;
  peakDemand: string;
  feeders: Feeder[];
  trenchingFt: number | null;
  substation: string;
};

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/** Convert common NVE date phrasings to an ISO YYYY-MM-DD, else "". */
export function parseIsdToDate(value: string): string {
  const v = (value || "").trim();
  if (!v) return "";

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const q = /\bQ([1-4])\s*(\d{4})\b/i.exec(v);
  if (q) {
    const month = (Number(q[1]) - 1) * 3; // quarter start month (0-based)
    return `${q[2]}-${String(month + 1).padStart(2, "0")}-01`;
  }

  const mdy = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(v);
  if (mdy) {
    return `${mdy[3]}-${String(+mdy[1]).padStart(2, "0")}-${String(+mdy[2]).padStart(2, "0")}`;
  }

  const my = /\b(\d{1,2})\/(\d{4})\b/.exec(v);
  if (my) return `${my[2]}-${String(+my[1]).padStart(2, "0")}-01`;

  const monthName = /\b([A-Za-z]+)\s+(\d{4})\b/.exec(v);
  if (monthName && MONTHS[monthName[1].toLowerCase()] !== undefined) {
    return `${monthName[2]}-${String(MONTHS[monthName[1].toLowerCase()] + 1).padStart(2, "0")}-01`;
  }

  return "";
}

/**
 * MW/MVA figures the email explicitly rules out, so we never treat them as
 * available capacity. Covers NVE's "a transmission study would be required for
 * N MVA … no review for N MVA" and "N MVA load addition" caveats.
 */
export function rejectedMwValues(text: string): Set<number> {
  const rejected = new Set<number>();
  const add = (raw: string) => {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) rejected.add(v);
  };
  for (const m of (text || "").matchAll(/no\s+review\s+for\s+(\d+(?:\.\d+)?)\s*(?:MW|MVA)?/gi)) add(m[1]);
  for (const m of (text || "").matchAll(/transmission\s+study[^.\n]{0,80}?(\d+(?:\.\d+)?)\s*(?:MW|MVA)/gi)) add(m[1]);
  for (const m of (text || "").matchAll(/(\d+(?:\.\d+)?)\s*(?:MW|MVA)[^.\n]{0,80}?transmission\s+study/gi)) add(m[1]);
  for (const m of (text || "").matchAll(/(\d+(?:\.\d+)?)\s*(?:MW|MVA)\s+load\s+addition/gi)) add(m[1]);
  return rejected;
}

/**
 * Available MW for a single response, read ONLY from the labeled request lines
 * ("Power:", "Peak Demand:", "Peak Demands:", "Load:") — never from stray
 * numbers elsewhere (equipment ratings, quoted threads, subject lines). Within
 * a line, several scenarios like "10 MW and 20 MW" mean the MAX serviceable
 * value (20), not the sum — they draw from the same feeders. Explicitly rejected
 * scenarios (transmission study / no review) are dropped. Returns null when the
 * response has no labeled serviceable figure (the reviewer can fill it in).
 */
export function extractAvailableMw(text: string): number | null {
  const src = text || "";
  const rejected = rejectedMwValues(src);
  const candidates: number[] = [];
  // Require a colon after the label so subject lines like "RE: Power request"
  // (which have no colon) are ignored.
  const lineRe = /\b(?:Peak\s+Demands?|Power|Load)\s*:\s*([^\n\r]+)/gi;
  for (const m of src.matchAll(lineRe)) {
    // Cut the line at any caveat marker so only the serviceable part remains.
    const val = m[1].split(/ATTENTION|Note:|\bThus\b|however/i)[0];
    if (!/(?:MW|MVA)/i.test(val)) continue; // must be a real demand line
    for (const n of val.matchAll(/(\d+(?:\.\d+)?)\s*(?:MW|MVA)?/gi)) {
      const v = parseFloat(n[1]);
      if (Number.isFinite(v) && v > 0 && !rejected.has(v)) candidates.push(v);
    }
  }
  return candidates.length ? Math.max(...candidates) : null;
}

/** Pull long-lead items from the response; empty when NVE says none. */
export function extractLongLeadItems(text: string): string[] {
  if (/\bno long[- ]lead\b/i.test(text)) return [];
  const items = new Set<string>();
  const sentences = (text || "").split(/(?<=[.!?])\s+|\n+/);
  for (const s of sentences) {
    const t = s.trim().replace(/\s+/g, " ");
    if (!t) continue;
    if (/(long[- ]lead|lead time)/i.test(t) && !/no long[- ]lead/i.test(t)) {
      if (t.length <= 300) items.add(t);
    }
  }
  return Array.from(items).slice(0, 8);
}

/** Extract the ISD value string from an "ISD:" line (before date parsing). */
function extractIsdRaw(text: string): string {
  const m = /\bISD:?\s*([^\n\r]+)/i.exec(text || "");
  return m ? m[1].trim() : "";
}

/** Extract the peak-demand value string from a "Peak Demand:" line. */
function extractPeakDemand(text: string): string {
  const m = /\bPeak Demand:?\s*([^\n\r]+)/i.exec(text || "");
  return m ? m[1].trim() : "";
}

/**
 * Deterministically extract structured fields from NVE response text.
 * Works the same for pasted text and for the plain-text body of a .eml.
 */
export function extractNve(text: string): NveExtract {
  const power = extractPowerFromText(text);
  const peakDemand = extractPeakDemand(text) || power.peakDemand || "";
  const isdRaw = power.isd || extractIsdRaw(text);

  const totalMva = power.feeders
    .map((f) => f.mva)
    .filter((v): v is number => v !== null)
    .reduce((a, b) => a + b, 0);

  const summaryParts: string[] = [];
  if (power.feeders.length) {
    summaryParts.push(
      `${power.feeders.length} feeder(s)` + (totalMva ? ` · ${Math.round(totalMva * 100) / 100} MVA` : "")
    );
  }
  if (power.trenchingFt !== null) summaryParts.push(`~${power.trenchingFt.toLocaleString()} ft trenching`);
  if (peakDemand) summaryParts.push(`Peak demand ${peakDemand}`);

  return {
    mwAvailable: extractAvailableMw(text),
    isdDate: parseIsdToDate(isdRaw) || parseIsdToDate(text),
    longLeadItems: extractLongLeadItems(text),
    notes: summaryParts.join(" · "),
    peakDemand,
    feeders: power.feeders,
    trenchingFt: power.trenchingFt,
    substation: power.substation,
  };
}
