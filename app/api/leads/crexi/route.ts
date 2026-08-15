import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseCrexiCsv } from "@/lib/crexi";
import { mergeLeadsByApn } from "@/lib/csv";
import { loadLeads, saveLeads } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    const substation = String(form.get("substation") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Crexi CSV file required" }, { status: 400 });
    }
    if (!substation) {
      return NextResponse.json({ error: "Substation is required" }, { status: 400 });
    }

    const text = await file.text();
    const incoming = parseCrexiCsv(text, substation);
    if (!incoming.length) {
      return NextResponse.json(
        { error: "No parcels with an APN found in this CSV" },
        { status: 400 }
      );
    }

    const { leads } = await loadLeads();
    const before = leads.length;
    const merged = mergeLeadsByApn(leads, incoming, {
      preserveAssignedToUnlessProvided: true,
    });
    const meta = await saveLeads(
      merged,
      `Import ${incoming.length} Crexi parcels into ${substation} (${
        user.email || user.userId
      })`
    );

    return NextResponse.json({
      leads: merged,
      meta,
      substation,
      imported: incoming.length,
      added: merged.length - before,
      total: merged.length,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Crexi import failed" }, { status: 500 });
  }
}
