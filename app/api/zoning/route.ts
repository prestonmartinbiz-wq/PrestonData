import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { zoningAtPoint } from "@/lib/zoning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /api/zoning?point=lng,lat → { jurisdiction, zone, description } | null */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const point = req.nextUrl.searchParams.get("point");
    if (!point) {
      return NextResponse.json({ error: "point=lng,lat required" }, { status: 400 });
    }
    const [lng, lat] = point.split(",").map(Number);
    if (![lng, lat].every((v) => Number.isFinite(v))) {
      return NextResponse.json({ error: "bad point" }, { status: 400 });
    }
    const zoning = await zoningAtPoint(lng, lat);
    return NextResponse.json(
      { zoning },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load zoning" }, { status: 502 });
  }
}
