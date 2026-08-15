import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { loadPower, mutatePower } from "@/lib/data-store";
import { extractPowerFromText, parsePowerEml, type ParsedPower } from "@/lib/power";
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

      const record = finalize(parsed);
      const { power: next, meta } = await mutatePower(
        (list) => [record, ...list],
        `Add power availability for ${record.substation || "unknown"} (${
          user.email || user.userId
        })`
      );
      return NextResponse.json({ power: next, meta, added: record });
    }

    // JSON body — either parse pasted text (preview) or save a record.
    const body = (await req.json()) as {
      item?: ParsedPower & Partial<PowerAvailability>;
      text?: string;
    };

    // Parse pasted NVE email text into a preview (no save).
    if (typeof body.text === "string") {
      if (!body.text.trim()) {
        return NextResponse.json({ error: "Paste some text first" }, { status: 400 });
      }
      const parsed = extractPowerFromText(body.text, { sourceFile: "pasted text" });
      return NextResponse.json({ preview: parsed });
    }

    if (!body.item) {
      return NextResponse.json({ error: "item is required" }, { status: 400 });
    }
    if (!(body.item.substation || "").trim()) {
      return NextResponse.json({ error: "Substation is required" }, { status: 400 });
    }

    const record: PowerAvailability = {
      ...finalize(body.item as ParsedPower),
      // Respect an id/createdAt if the client supplied one (edit-in-place).
      id: body.item.id || randomUUID(),
      createdAt: body.item.createdAt || new Date().toISOString(),
    };
    const { power: next, meta } = await mutatePower(
      (list) => [record, ...list.filter((p) => p.id !== record.id)],
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

    let existed = false;
    const { power: next, meta } = await mutatePower((list) => {
      const filtered = list.filter((p) => p.id !== id);
      existed = filtered.length !== list.length;
      return filtered;
    }, `Delete power availability ${id} (${user.email || user.userId})`);
    if (!existed) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    return NextResponse.json({ power: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to delete power data" }, { status: 500 });
  }
}
