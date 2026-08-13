import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { loadPipeline, savePipeline } from "@/lib/data-store";
import { monthsUntil, scoreSubstation } from "@/lib/scoring";
import type { PipelinePriority, PipelineStatus, PipelineSubstation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: PipelineStatus[] = [
  "to_be_searched",
  "awaiting_nve_response",
  "confirmed",
];

/** Recompute derived fields (long-lead flag + composite score for confirmed). */
function finalize(record: PipelineSubstation): PipelineSubstation {
  const longLeadPresent = (record.longLeadItems || []).length > 0;
  let compositeScore = record.compositeScore;
  if (record.status === "confirmed") {
    compositeScore = scoreSubstation({
      mwAvailable: record.mwAvailable ?? 0,
      longLeadPresent,
      monthsToISD: monthsUntil(record.isdDate),
    });
  }
  return { ...record, longLeadPresent, compositeScore, updatedAt: new Date().toISOString() };
}

export async function GET() {
  try {
    await requireUser();
    const { items, meta } = await loadPipeline();
    return NextResponse.json({ items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load pipeline" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Partial<PipelineSubstation>;
    if (!(body.name || "").trim()) {
      return NextResponse.json({ error: "Substation name is required" }, { status: 400 });
    }
    const priority: PipelinePriority = (["High", "Medium", "Low"] as const).includes(
      body.priority as PipelinePriority
    )
      ? (body.priority as PipelinePriority)
      : "Medium";

    const now = new Date().toISOString();
    const record: PipelineSubstation = finalize({
      id: randomUUID(),
      name: body.name!.trim(),
      address: (body.address || "").trim(),
      latitude: (body.latitude || "").toString().trim(),
      longitude: (body.longitude || "").toString().trim(),
      status: "to_be_searched",
      submittedBy: (body.submittedBy || user.email || user.userId || "").trim(),
      dateAdded: now,
      justification: (body.justification || "").trim(),
      priority,
      assignedEe: "",
      dateStudySubmittedToNve: "",
      nveResponseRaw: "",
      mwAvailable: null,
      isdDate: "",
      longLeadItems: [],
      longLeadPresent: false,
      compositeScore: null,
      dateResponseReceived: "",
      notes: (body.notes || "").trim(),
      createdAt: now,
      updatedAt: now,
    });

    const { items } = await loadPipeline();
    const next = [record, ...items];
    const meta = await savePipeline(next, `Add substation ${record.name} to pipeline (${user.email || user.userId})`);
    return NextResponse.json({ item: record, items: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to create substation" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      id?: string;
      patch?: Partial<PipelineSubstation>;
    };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { items } = await loadPipeline();
    const idx = items.findIndex((i) => i.id === body.id);
    if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const patch = body.patch || {};
    if (patch.status && !STATUSES.includes(patch.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const merged: PipelineSubstation = { ...items[idx], ...patch, id: items[idx].id };
    // Set response-received timestamp when a record first becomes confirmed.
    if (patch.status === "confirmed" && !merged.dateResponseReceived) {
      merged.dateResponseReceived = new Date().toISOString();
    }
    const record = finalize(merged);

    const next = [...items];
    next[idx] = record;
    const meta = await savePipeline(
      next,
      `Update pipeline substation ${record.name} -> ${record.status} (${user.email || user.userId})`
    );
    return NextResponse.json({ item: record, items: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to update substation" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { items } = await loadPipeline();
    const next = items.filter((i) => i.id !== id);
    if (next.length === items.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const meta = await savePipeline(next, `Delete pipeline substation ${id} (${user.email || user.userId})`);
    return NextResponse.json({ items: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to delete substation" }, { status: 500 });
  }
}
