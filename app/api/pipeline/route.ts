import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { loadPipeline, mutatePipeline } from "@/lib/data-store";
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
      peakDemand: "",
      feeders: [],
      trenchingFt: null,
      isdDate: "",
      longLeadItems: [],
      longLeadPresent: false,
      compositeScore: null,
      dateResponseReceived: "",
      notes: (body.notes || "").trim(),
      responses: [],
      images: [],
      createdAt: now,
      updatedAt: now,
    });

    const { items, meta } = await mutatePipeline(
      (list) => [record, ...list],
      `Add substation ${record.name} to pipeline (${user.email || user.userId})`
    );
    return NextResponse.json({ item: record, items, meta });
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

    const patch = body.patch || {};
    if (patch.status && !STATUSES.includes(patch.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    let record: PipelineSubstation | null = null;
    let notFound = false;
    const { items, meta } = await mutatePipeline((list) => {
      const idx = list.findIndex((i) => i.id === body.id);
      if (idx === -1) {
        notFound = true;
        return list;
      }
      const merged: PipelineSubstation = { ...list[idx], ...patch, id: list[idx].id };
      if (patch.status === "confirmed" && !merged.dateResponseReceived) {
        merged.dateResponseReceived = new Date().toISOString();
      }
      record = finalize(merged);
      const next = [...list];
      next[idx] = record;
      return next;
    }, `Update pipeline substation ${body.id} (${user.email || user.userId})`);

    if (notFound || !record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: record, items, meta });
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
    let existed = false;
    const { items, meta } = await mutatePipeline((list) => {
      const next = list.filter((i) => i.id !== id);
      existed = next.length !== list.length;
      return next;
    }, `Delete pipeline substation ${id} (${user.email || user.userId})`);
    if (!existed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to delete substation" }, { status: 500 });
  }
}
