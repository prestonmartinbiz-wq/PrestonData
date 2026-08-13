import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseEml } from "@/lib/eml";
import { extractNve } from "@/lib/nve-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Extract structured fields from an NV Energy response. Accepts a .eml upload
 * (parsed to plain text server-side) or pasted text. Returns the extracted
 * fields plus the raw text so the EE can review/edit before confirming.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const contentType = req.headers.get("content-type") || "";

    let text = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: ".eml file required" }, { status: 400 });
      }
      const raw = await file.text();
      text = parseEml(raw).text;
    } else {
      const body = (await req.json()) as { text?: string };
      text = (body.text || "").trim();
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "No email text found" }, { status: 400 });
    }

    const { fields, via } = await extractNve(text);
    return NextResponse.json({ fields, via, raw: text });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
