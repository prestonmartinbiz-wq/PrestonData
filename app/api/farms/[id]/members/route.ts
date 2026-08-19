import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mutateFarms } from "@/lib/data-store";
import type { FarmMember } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { apn?: string };
    const apn = (body.apn || "").trim();
    if (!apn) {
      return NextResponse.json({ error: "APN is required" }, { status: 400 });
    }
    const norm = normalizeApn(apn);
    const cleanApn = apn.replace(/[^0-9]/g, "") || apn;
    const now = new Date().toISOString();

    const { items, meta } = await mutateFarms(
      (cur) => {
        const idx = cur.findIndex((f) => f.id === id);
        if (idx === -1) throw new Error("not_found");
        const farm = cur[idx];
        const exists = farm.members.some((m) => normalizeApn(m.apn) === norm);
        if (exists) return cur;

        const member: FarmMember = {
          apn: cleanApn,
          addedVia: "manual",
          addedAt: now,
        };
        const copy = [...cur];
        copy[idx] = {
          ...farm,
          members: [...farm.members, member],
          updatedAt: now,
        };
        return copy;
      },
      `Add APN ${cleanApn} to farm ${id} (${user.email || user.userId})`
    );

    const farm = items.find((f) => f.id === id);
    return NextResponse.json({ farm, items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message === "not_found") {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to add member" }, { status: 502 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const apn = req.nextUrl.searchParams.get("apn")?.trim();
    if (!apn) {
      return NextResponse.json({ error: "apn query param required" }, { status: 400 });
    }
    const norm = normalizeApn(apn);

    const { items, meta } = await mutateFarms(
      (cur) => {
        const idx = cur.findIndex((f) => f.id === id);
        if (idx === -1) throw new Error("not_found");
        const farm = cur[idx];
        const copy = [...cur];
        copy[idx] = {
          ...farm,
          members: farm.members.filter((m) => normalizeApn(m.apn) !== norm),
          updatedAt: new Date().toISOString(),
        };
        return copy;
      },
      `Remove APN ${apn} from farm ${id} (${user.email || user.userId})`
    );

    const farm = items.find((f) => f.id === id);
    return NextResponse.json({ farm, items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message === "not_found") {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 502 });
  }
}
