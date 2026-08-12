import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mergeLeadsByApn } from "@/lib/csv";
import { loadLeads, saveLeads } from "@/lib/data-store";
import type { Lead } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const { leads, meta } = await loadLeads();
    return NextResponse.json({ leads, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { lead?: Lead };
    if (!body.lead?.apn) {
      return NextResponse.json({ error: "APN is required" }, { status: 400 });
    }

    const { leads } = await loadLeads();
    const key = normalizeApn(body.lead.apn);
    if (leads.some((l) => normalizeApn(l.apn) === key)) {
      return NextResponse.json({ error: "Lead with this APN already exists" }, { status: 409 });
    }

    const next = [...leads, { ...body.lead, apn: key }];
    const meta = await saveLeads(next, `Add lead ${key} (${user.email || user.userId})`);
    return NextResponse.json({ leads: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { lead?: Lead; leads?: Lead[] };

    if (body.leads) {
      const meta = await saveLeads(
        body.leads,
        `Bulk update leads (${user.email || user.userId})`
      );
      return NextResponse.json({ leads: body.leads, meta });
    }

    if (!body.lead?.apn) {
      return NextResponse.json({ error: "lead is required" }, { status: 400 });
    }

    const { leads } = await loadLeads();
    const key = normalizeApn(body.lead.apn);
    const idx = leads.findIndex((l) => normalizeApn(l.apn) === key);
    if (idx === -1) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const next = [...leads];
    next[idx] = { ...body.lead, apn: key };
    const meta = await saveLeads(next, `Update lead ${key} (${user.email || user.userId})`);
    return NextResponse.json({ leads: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to update leads" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const apn = req.nextUrl.searchParams.get("apn");
    if (!apn) return NextResponse.json({ error: "apn required" }, { status: 400 });

    const { leads } = await loadLeads();
    const key = normalizeApn(apn);
    const next = leads.filter((l) => normalizeApn(l.apn) !== key);
    if (next.length === leads.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const meta = await saveLeads(next, `Delete lead ${key} (${user.email || user.userId})`);
    return NextResponse.json({ leads: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}

// keep merge helper imported for potential future use / tree-shake silence
void mergeLeadsByApn;
