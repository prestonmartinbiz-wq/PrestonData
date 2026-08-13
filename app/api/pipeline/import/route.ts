import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import { requireUser } from "@/lib/auth";
import { loadPipeline, savePipeline } from "@/lib/data-store";
import { monthsUntil, scoreSubstation } from "@/lib/scoring";
import type { PipelinePriority, PipelineStatus, PipelineSubstation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim()) return String(row[k]).trim();
  }
  return "";
}

const VALID_STATUS: PipelineStatus[] = [
  "to_be_searched",
  "awaiting_nve_response",
  "confirmed",
];

/**
 * Bulk-import historical pipeline records from a CSV. Column headers map to the
 * schema (name, address, latitude, longitude, status, priority, mw_available,
 * isd_date, long_lead_items, justification, notes, ...). Leaves the door open
 * for the deferred Google Drive "Power Studies" backtest without building the
 * connector.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file required" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const now = new Date().toISOString();
    const incoming: PipelineSubstation[] = parsed.data
      .map((row) => {
        const name = pick(row, ["name", "Name", "Substation", "substation"]);
        if (!name) return null;
        const statusRaw = pick(row, ["status", "Status"]) as PipelineStatus;
        const status = VALID_STATUS.includes(statusRaw) ? statusRaw : "confirmed";
        const priorityRaw = pick(row, ["priority", "Priority"]) as PipelinePriority;
        const priority = (["High", "Medium", "Low"] as const).includes(priorityRaw)
          ? priorityRaw
          : "Medium";
        const mwStr = pick(row, ["mw_available", "MW Available", "mwAvailable", "MW"]);
        const mwAvailable = mwStr && Number.isFinite(Number(mwStr)) ? Number(mwStr) : null;
        const longLeadRaw = pick(row, ["long_lead_items", "Long Lead Items", "longLeadItems"]);
        const longLeadItems = longLeadRaw
          ? longLeadRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
          : [];
        const isdDate = pick(row, ["isd_date", "ISD", "isdDate", "In-Service Date"]);

        const record: PipelineSubstation = {
          id: randomUUID(),
          name,
          address: pick(row, ["address", "Address"]),
          latitude: pick(row, ["latitude", "Latitude", "lat"]),
          longitude: pick(row, ["longitude", "Longitude", "lng", "lon"]),
          status,
          submittedBy: pick(row, ["submitted_by", "Submitted By"]) || user.email,
          dateAdded: pick(row, ["date_added", "Date Added"]) || now,
          justification: pick(row, ["justification", "Justification"]),
          priority,
          assignedEe: pick(row, ["assigned_ee", "Assigned EE", "assignedEe"]),
          dateStudySubmittedToNve: pick(row, [
            "date_study_submitted_to_nve",
            "Date Study Submitted",
          ]),
          nveResponseRaw: pick(row, ["nve_response_raw", "NVE Response"]),
          mwAvailable,
          isdDate,
          longLeadItems,
          longLeadPresent: longLeadItems.length > 0,
          compositeScore:
            status === "confirmed"
              ? scoreSubstation({
                  mwAvailable: mwAvailable ?? 0,
                  longLeadPresent: longLeadItems.length > 0,
                  monthsToISD: monthsUntil(isdDate),
                })
              : null,
          dateResponseReceived: pick(row, ["date_response_received", "Date Response Received"]),
          notes: pick(row, ["notes", "Notes"]),
          createdAt: now,
          updatedAt: now,
        };
        return record;
      })
      .filter((r): r is PipelineSubstation => r !== null);

    if (!incoming.length) {
      return NextResponse.json({ error: "No rows with a name found" }, { status: 400 });
    }

    const { items } = await loadPipeline();
    const next = [...incoming, ...items];
    const meta = await savePipeline(
      next,
      `Import ${incoming.length} pipeline substations from CSV (${user.email || user.userId})`
    );
    return NextResponse.json({ items: next, meta, imported: incoming.length });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
