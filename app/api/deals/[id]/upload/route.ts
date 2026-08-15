import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { mutateDeals } from "@/lib/data-store";
import { MAX_DEAL_DOC_BYTES, storeDealDoc } from "@/lib/doc-store";
import type { Deal, DealDocument } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Upload a document file for a deal and attach it to the matching checklist
 * item (by key). Files persist via Vercel Blob (or local in dev). When neither
 * is available (prod without Blob), we return a clear message so the user
 * records an external link instead — the checklist still tracks status.
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    const key = String(form.get("key") || "other").trim() || "other";
    const label = String(form.get("label") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_DEAL_DOC_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${Math.round(MAX_DEAL_DOC_BYTES / (1024 * 1024))}MB limit` },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await storeDealDoc(id, key, bytes, {
      filename: file.name,
      contentType: file.type,
    });

    if (!stored) {
      return NextResponse.json(
        {
          stored: false,
          error:
            "File storage isn't configured on this deployment. Add BLOB_READ_WRITE_TOKEN to upload files, or paste an external link (e.g. Google Drive) instead.",
        },
        { status: 501 }
      );
    }

    const now = new Date().toISOString();
    let deal: Deal | null = null;
    let notFound = false;
    const { items } = await mutateDeals((list) => {
      const idx = list.findIndex((d) => d.id === id);
      if (idx === -1) {
        notFound = true;
        return list;
      }
      // Diagrams are images shown at the top of the deal / in exports.
      if (key === "diagram") {
        const diagrams = [
          ...(list[idx].diagrams || []),
          {
            id: randomUUID(),
            url: stored.url,
            name: file.name,
            caption: label || "",
            source: "upload",
          },
        ];
        deal = { ...list[idx], diagrams, updatedAt: now };
        const next = [...list];
        next[idx] = deal;
        return next;
      }
      const docs = [...(list[idx].documents || [])];
      const dIdx = docs.findIndex((d) => d.key === key);
      const patch = {
        fileUrl: stored.url,
        fileName: file.name,
        status: "received" as const,
        updatedAt: now,
        updatedBy: user.email || user.userId || "",
      };
      if (dIdx === -1) {
        const newDoc: DealDocument = {
          id: randomUUID(),
          key,
          label: label || key,
          link: "",
          note: "",
          ...patch,
        };
        docs.push(newDoc);
      } else {
        docs[dIdx] = { ...docs[dIdx], ...patch };
      }
      deal = { ...list[idx], documents: docs, updatedAt: now };
      const next = [...list];
      next[idx] = deal;
      return next;
    }, `Attach ${key} document to deal ${id} (${user.email || user.userId})`);

    if (notFound || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    return NextResponse.json({ item: deal, items, stored: true, storage: stored.storage });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
