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

/** Largest MW/MVA figure in a string (peak demand can list two options). */
function maxMw(text: string): number | null {
  const matches = [...(text || "").matchAll(/([\d.]+)\s*(MW|MVA)\b/gi)];
  const nums = matches.map((m) => parseFloat(m[1])).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) : null;
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
    mwAvailable: maxMw(peakDemand) ?? maxMw(text),
    isdDate: parseIsdToDate(isdRaw) || parseIsdToDate(text),
    longLeadItems: extractLongLeadItems(text),
    notes: summaryParts.join(" · "),
    peakDemand,
    feeders: power.feeders,
    trenchingFt: power.trenchingFt,
    substation: power.substation,
  };
}
