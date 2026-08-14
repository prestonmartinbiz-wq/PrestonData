import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { loadDeals, mutateDeals } from "@/lib/data-store";
import {
  DEAL_DOC_CHECKLIST,
  type Deal,
  type DealDocument,
  type DealStage,
  type DealType,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: DealType[] = ["under_contract", "landowner_relationship"];
const STAGES: DealStage[] = [
  "prospecting",
  "negotiating",
  "secured",
  "power_reservation",
  "design",
  "submitted",
  "closed",
  "dead",
];

/** Seed a deal's document list: the agreement plus the NVE doc checklist. */
function defaultDocuments(type: DealType): DealDocument[] {
  const now = new Date().toISOString();
  const mk = (key: string, label: string): DealDocument => ({
    id: randomUUID(),
    key,
    label,
    status: "needed",
    fileUrl: "",
    fileName: "",
    link: "",
    note: "",
    updatedAt: now,
    updatedBy: "",
  });
  const agreement =
    type === "under_contract"
      ? mk("psa", "Purchase & Sale Agreement (PSA)")
      : mk("contract", "Landowner agreement / contract");
  return [agreement, ...DEAL_DOC_CHECKLIST.map((c) => mk(c.key, c.label))];
}

export async function GET() {
  try {
    await requireUser();
    const { items, meta } = await loadDeals();
    return NextResponse.json({ items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load deals" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Partial<Deal>;
    if (!(body.name || "").trim()) {
      return NextResponse.json({ error: "Deal name is required" }, { status: 400 });
    }
    const type: DealType = TYPES.includes(body.type as DealType)
      ? (body.type as DealType)
      : "landowner_relationship";
    const stage: DealStage = STAGES.includes(body.stage as DealStage)
      ? (body.stage as DealStage)
      : "secured";

    const now = new Date().toISOString();
    const deal: Deal = {
      id: randomUUID(),
      name: body.name!.trim(),
      type,
      stage,
      apn: (body.apn || "").trim(),
      address: (body.address || "").trim(),
      substation: (body.substation || "").trim(),
      mw:
        body.mw === null || body.mw === undefined || !Number.isFinite(Number(body.mw))
          ? null
          : Number(body.mw),
      summary: (body.summary || "").trim(),
      keyDate: (body.keyDate || "").trim(),
      contacts: Array.isArray(body.contacts) ? body.contacts : [],
      documents:
        Array.isArray(body.documents) && body.documents.length
          ? body.documents
          : defaultDocuments(type),
      milestones: Array.isArray(body.milestones) ? body.milestones : [],
      createdBy: user.email || user.userId || "",
      createdAt: now,
      updatedAt: now,
    };

    const { items, meta } = await mutateDeals(
      (list) => [deal, ...list],
      `Add deal ${deal.name} (${user.email || user.userId})`
    );
    return NextResponse.json({ item: deal, items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { id?: string; patch?: Partial<Deal> };
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const patch = body.patch || {};
    if (patch.type && !TYPES.includes(patch.type)) {
      return NextResponse.json({ error: "Invalid deal type" }, { status: 400 });
    }
    if (patch.stage && !STAGES.includes(patch.stage)) {
      return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    let record: Deal | null = null;
    let notFound = false;
    const { items, meta } = await mutateDeals((list) => {
      const idx = list.findIndex((d) => d.id === body.id);
      if (idx === -1) {
        notFound = true;
        return list;
      }
      record = {
        ...list[idx],
        ...patch,
        id: list[idx].id,
        updatedAt: new Date().toISOString(),
      };
      const next = [...list];
      next[idx] = record;
      return next;
    }, `Update deal ${body.id} (${user.email || user.userId})`);

    if (notFound || !record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: record, items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    let existed = false;
    const { items, meta } = await mutateDeals((list) => {
      const next = list.filter((d) => d.id !== id);
      existed = next.length !== list.length;
      return next;
    }, `Delete deal ${id} (${user.email || user.userId})`);
    if (!existed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to delete deal" }, { status: 500 });
  }
}
