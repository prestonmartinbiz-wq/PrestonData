import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { loadPower, savePower } from "@/lib/data-store";
import { parsePowerEml, type ParsedPower } from "@/lib/power";
import type { PowerAvailability } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const { power, meta } = await loadPower();
    return NextResponse.json({ power, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load power data" }, { status: 500 });
  }
}

function finalize(parsed: ParsedPower): PowerAvailability {
  return {
    ...parsed,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const contentType = req.headers.get("content-type") || "";

    // Multipart upload of a .eml file — parse and (optionally) preview.
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: ".eml file required" }, { status: 400 });
      }
      const raw = await file.text();
      const parsed = parsePowerEml(raw, file.name || "");

      const preview =
        req.nextUrl.searchParams.get("preview") === "1" ||
        form.get("preview") === "1";
      if (preview) {
        return NextResponse.json({ preview: parsed });
      }

      const { power } = await loadPower();
      const record = finalize(parsed);
      const next = [record, ...power];
      const meta = await savePower(
        next,
        `Add power availability for ${record.substation || "unknown"} (${
          user.email || user.userId
        })`
      );
      return NextResponse.json({ power: next, meta, added: record });
    }

    // JSON body — save a (possibly user-edited) record.
    const body = (await req.json()) as { item?: ParsedPower & Partial<PowerAvailability> };
    if (!body.item) {
      return NextResponse.json({ error: "item is required" }, { status: 400 });
    }
    if (!(body.item.substation || "").trim()) {
      return NextResponse.json({ error: "Substation is required" }, { status: 400 });
    }

    const { power } = await loadPower();
    const record: PowerAvailability = {
      ...finalize(body.item as ParsedPower),
      // Respect an id/createdAt if the client supplied one (edit-in-place).
      id: body.item.id || randomUUID(),
      createdAt: body.item.createdAt || new Date().toISOString(),
    };
    const withoutDupe = power.filter((p) => p.id !== record.id);
    const next = [record, ...withoutDupe];
    const meta = await savePower(
      next,
      `Save power availability for ${record.substation} (${user.email || user.userId})`
    );
    return NextResponse.json({ power: next, meta, added: record });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to save power data" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { power } = await loadPower();
    const next = power.filter((p) => p.id !== id);
    if (next.length === power.length) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    const meta = await savePower(
      next,
      `Delete power availability ${id} (${user.email || user.userId})`
    );
    return NextResponse.json({ power: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to delete power data" }, { status: 500 });
  }
}
