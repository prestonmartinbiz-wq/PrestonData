import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { loadPipeline, mutatePipeline, mutatePower } from "@/lib/data-store";
import { parseEml } from "@/lib/eml";
import { extractPowerFromText } from "@/lib/power";
import { extractNve } from "@/lib/nve-extract";
import { storePipelineImages } from "@/lib/image-store";
import { applyResponse, finalizePipeline } from "@/lib/pipeline";
import type {
  PipelineResponse,
  PipelineSubstation,
  PowerAvailability,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newConfirmed(name: string, who: string): PipelineSubstation {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind: "substation",
    name,
    address: "",
    latitude: "",
    longitude: "",
    status: "confirmed",
    submittedBy: who,
    dateAdded: now,
    justification: "",
    priority: "Medium",
    assignedEe: who,
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
    dateResponseReceived: now,
    notes: "",
    responses: [],
    images: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Upload a Power Availability Request (.eml) and file it under a substation the
 * user picks (existing tracked substation) or names (new). One upload writes to
 * BOTH stores:
 *   - the pipeline (a new "pull" appended to the substation, kept in Tracked), and
 *   - the board's power data (a PowerAvailability record), so it shows up on the
 *     Coverage board / substation detail.
 * This lets the same substation accumulate multiple requests over time.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const who = user.email || user.userId || "crm";
    const contentType = req.headers.get("content-type") || "";

    let emlText = "";
    let subject = "";
    let date = "";
    let from = "";
    let sourceFile = "";
    let images: string[] = [];
    let imagesSkipped = 0;
    let substationId = "";
    let substationName = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      substationId = String(form.get("substationId") || "").trim();
      substationName = String(form.get("substationName") || "").trim();
      const file = form.get("file");
      const pastedText = String(form.get("text") || "").trim();

      if (file instanceof File) {
        const raw = await file.text();
        const email = parseEml(raw);
        emlText = email.text;
        subject = email.subject;
        date = email.date;
        from = email.from;
        sourceFile = file.name || "";
        const stored = await storePipelineImages(
          email.attachments,
          randomUUID().slice(0, 8)
        );
        images = stored.urls;
        imagesSkipped = stored.skipped;
      } else if (pastedText) {
        emlText = pastedText;
        sourceFile = "pasted text";
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        text?: string;
        substationId?: string;
        substationName?: string;
      };
      substationId = (body.substationId || "").trim();
      substationName = (body.substationName || "").trim();
      emlText = (body.text || "").trim();
      sourceFile = "pasted text";
    }

    if (!emlText.trim()) {
      return NextResponse.json(
        { error: "Upload a .eml file or paste the request text" },
        { status: 400 }
      );
    }

    // Resolve the target substation name (existing id wins, else the typed name).
    const { items: existing } = await loadPipeline();
    let targetName = substationName;
    if (substationId) {
      const found = existing.find((i) => i.id === substationId);
      if (!found) {
        return NextResponse.json(
          { error: "Selected substation no longer exists" },
          { status: 400 }
        );
      }
      targetName = found.name;
    }
    if (!targetName.trim()) {
      return NextResponse.json(
        { error: "Choose an existing substation or enter a new name" },
        { status: 400 }
      );
    }

    const nve = extractNve(emlText);
    const parsedPower = extractPowerFromText(emlText, {
      subject,
      date,
      from,
      sourceFile,
    });

    const response: PipelineResponse = {
      id: randomUUID(),
      subject: subject || sourceFile || "Power availability request",
      date: date || new Date().toISOString(),
      from: from || who,
      text: emlText.slice(0, 12000),
      mwAvailable: nve.mwAvailable,
      peakDemand: nve.peakDemand,
      isdDate: nve.isdDate,
      feeders: nve.feeders,
      trenchingFt: nve.trenchingFt,
      longLeadItems: nve.longLeadItems,
      images,
      sourceFile,
    };

    // Write to the pipeline: append to the matching substation (by id, else by
    // case-insensitive name), or create a new confirmed substation.
    let saved: PipelineSubstation | null = null;
    const { items } = await mutatePipeline((list) => {
      const idx = substationId
        ? list.findIndex((i) => i.id === substationId)
        : list.findIndex(
            (i) => i.name.trim().toLowerCase() === targetName.trim().toLowerCase()
          );
      if (idx === -1) {
        const base = newConfirmed(targetName.trim(), who);
        saved = finalizePipeline(applyResponse(base, response));
        return [saved, ...list];
      }
      const merged = applyResponse(
        { ...list[idx], status: "confirmed" as const },
        response
      );
      if (!merged.dateResponseReceived) {
        merged.dateResponseReceived = new Date().toISOString();
      }
      saved = finalizePipeline(merged);
      const next = [...list];
      next[idx] = saved;
      return next;
    }, `Power availability request for ${targetName} (${who})`);

    // Port over to the board's power data.
    const powerRecord: PowerAvailability = {
      ...parsedPower,
      substation: targetName.trim(),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await mutatePower(
      (list) => [powerRecord, ...list],
      `Power availability for ${targetName} from request (${who})`
    );

    return NextResponse.json({
      items,
      item: saved,
      power: powerRecord,
      imagesSkipped,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json(
      { error: "Failed to save power availability request" },
      { status: 500 }
    );
  }
}
