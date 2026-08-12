import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeApn(apn: string): string {
  return (apn || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function needsContact(lead: {
  phone?: string;
  email?: string;
  altPhone?: string;
  status?: string;
}): boolean {
  const hasPhone = Boolean((lead.phone || "").trim() || (lead.altPhone || "").trim());
  const hasEmail = Boolean((lead.email || "").trim());
  const statusHint = (lead.status || "").toLowerCase().includes("needs phone");
  return statusHint || !hasPhone || !hasEmail;
}
