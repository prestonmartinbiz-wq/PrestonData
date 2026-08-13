import OpenAI from "openai";
import { extractPowerFromText } from "@/lib/power";
import { openaiConfigured } from "@/lib/transcribe";

export type NveExtract = {
  mwAvailable: number | null;
  isdDate: string;
  longLeadItems: string[];
  notes: string;
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

function firstMw(text: string): number | null {
  const m = /([\d.]+)\s*(MW|MVA)\b/i.exec(text || "");
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
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

/** Regex fallback extraction (no API key required). */
export function extractNveRegex(text: string): NveExtract {
  const power = extractPowerFromText(text);
  return {
    mwAvailable: firstMw(power.peakDemand) ?? firstMw(text),
    isdDate: parseIsdToDate(power.isd) || parseIsdToDate(text),
    longLeadItems: extractLongLeadItems(text),
    notes: "",
  };
}

const EXTRACTION_PROMPT = `You are extracting structured data from an NV Energy interconnection/power availability response email.
Return ONLY valid JSON, no other text, in this exact shape:

{
  "mw_available": <number or null>,
  "isd_date": "<YYYY-MM-DD or null>",
  "long_lead_items": ["<item description>", ...],
  "notes": "<anything else relevant to capacity or timeline, 1-2 sentences>"
}

If a field isn't stated in the email, use null (or empty array for long_lead_items). Do not guess or infer values that aren't explicitly stated.

Email text:
---
{{email_body}}
---`;

/** LLM extraction when OPENAI_API_KEY is configured; null otherwise or on failure. */
export async function extractNveWithLLM(text: string): Promise<NveExtract | null> {
  if (!openaiConfigured()) return null;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: EXTRACTION_PROMPT.replace("{{email_body}}", text.slice(0, 12000)),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as {
      mw_available?: number | null;
      isd_date?: string | null;
      long_lead_items?: string[];
      notes?: string;
    };
    return {
      mwAvailable:
        typeof parsed.mw_available === "number" ? parsed.mw_available : null,
      isdDate: parsed.isd_date ? parseIsdToDate(parsed.isd_date) || parsed.isd_date : "",
      longLeadItems: Array.isArray(parsed.long_lead_items) ? parsed.long_lead_items : [],
      notes: parsed.notes || "",
    };
  } catch (err) {
    console.warn("NVE LLM extraction failed, falling back to regex", err);
    return null;
  }
}

/** Extract via LLM when available, else regex. */
export async function extractNve(
  text: string
): Promise<{ fields: NveExtract; via: "llm" | "regex" }> {
  const llm = await extractNveWithLLM(text);
  if (llm) return { fields: llm, via: "llm" };
  return { fields: extractNveRegex(text), via: "regex" };
}
