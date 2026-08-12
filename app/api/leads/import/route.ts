import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mergeLeadsByApn, parseLeadsCsv } from "@/lib/csv";
import { loadLeads, saveLeads } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file required" }, { status: 400 });
    }

    const text = await file.text();
    const incoming = parseLeadsCsv(text);
    if (!incoming.length) {
      return NextResponse.json({ error: "No valid leads in CSV" }, { status: 400 });
    }

    const { leads } = await loadLeads();
    const merged = mergeLeadsByApn(leads, incoming, {
      preserveAssignedToUnlessProvided: true,
    });
    const meta = await saveLeads(
      merged,
      `Import ${incoming.length} leads from CSV (${user.email || user.userId})`
    );

    return NextResponse.json({
      leads: merged,
      meta,
      imported: incoming.length,
      total: merged.length,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
