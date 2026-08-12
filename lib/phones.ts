import type { Lead } from "@/lib/types";

const SEP = "|";

/** All phone numbers for a lead. Falls back to phone/altPhone for older rows. */
export function getPhones(lead: Pick<Lead, "phones" | "phone" | "altPhone">): string[] {
  const list = (lead.phones || "")
    .split(SEP)
    .map((p) => p.trim())
    .filter(Boolean);
  if (list.length) return list;
  return [lead.phone, lead.altPhone].map((p) => (p || "").trim()).filter(Boolean);
}

/** Serialize a phone list back to the pipe-delimited storage form. */
export function joinPhones(phones: string[]): string {
  return phones.map((p) => p.trim()).filter(Boolean).join(SEP);
}

/**
 * Return a lead with its phone list applied, keeping the legacy phone/altPhone
 * fields in sync (phone = first, altPhone = second) so existing filters/exports
 * and "needs contact" logic keep working.
 */
export function withPhones(lead: Lead, phones: string[]): Lead {
  const clean = phones.map((p) => p.trim()).filter(Boolean);
  return {
    ...lead,
    phones: clean.join(SEP),
    phone: clean[0] || "",
    altPhone: clean[1] || "",
  };
}
