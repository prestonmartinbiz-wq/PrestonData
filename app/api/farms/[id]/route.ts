import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadFarms, loadLeads, mutateFarms } from "@/lib/data-store";
import {
  colorForAssignee,
  computeMembersForBoundary,
  mergeFarmMembers,
} from "@/lib/farms";
import type { Farm, FarmBoundary } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBoundary(v: unknown): v is FarmBoundary {
  if (!v || typeof v !== "object") return false;
  const b = v as FarmBoundary;
  return (
    b.type === "Polygon" &&
    Array.isArray(b.coordinates) &&
    b.coordinates.length > 0
  );
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const { items } = await loadFarms();
    const farm = items.find((f) => f.id === id);
    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    const { leads } = await loadLeads();
    const leadByApn = new Map(leads.map((l) => [normalizeApn(l.apn), l]));
    const members = farm.members.map((m) => ({
      ...m,
      lead: leadByApn.get(normalizeApn(m.apn)) ?? null,
    }));

    return NextResponse.json({ farm: { ...farm, members } });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load farm" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as Partial<Farm> & { boundary?: FarmBoundary };

    const { items, meta } = await mutateFarms((cur) => {
      const idx = cur.findIndex((f) => f.id === id);
      if (idx === -1) throw new Error("not_found");

      const prev = cur[idx];
      let next: Farm = { ...prev, updatedAt: new Date().toISOString() };

      if (typeof body.name === "string" && body.name.trim()) {
        next.name = body.name.trim();
      }
      if (typeof body.assignedTo === "string" && body.assignedTo.trim()) {
        next.assignedTo = body.assignedTo.trim();
        next.color = colorForAssignee(next.assignedTo, cur);
      }
      if (typeof body.substationOfInterest === "string") {
        next.substationOfInterest = body.substationOfInterest.trim();
      }
      if (typeof body.notes === "string") {
        next.notes = body.notes.trim();
      }

      const copy = [...cur];
      copy[idx] = next;
      return copy;
    }, `Update farm ${id} (${user.email || user.userId})`);

    let farm = items.find((f) => f.id === id);
    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    if (isBoundary(body.boundary)) {
      const polygonMembers = await computeMembersForBoundary(body.boundary);
      const merged = mergeFarmMembers(farm.members, polygonMembers);
      const { items: updated, meta: m2 } = await mutateFarms(
        (cur) =>
          cur.map((f) =>
            f.id === id
              ? {
                  ...f,
                  boundary: body.boundary!,
                  members: merged,
                  updatedAt: new Date().toISOString(),
                }
              : f
          ),
        `Redraw farm boundary ${id} (${user.email || user.userId})`
      );
      farm = updated.find((f) => f.id === id)!;
      return NextResponse.json({ farm, items: updated, meta: m2 });
    }

    return NextResponse.json({ farm, items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message === "not_found") {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update farm" }, { status: 502 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const { items, meta } = await mutateFarms(
      (cur) => {
        const exists = cur.some((f) => f.id === id);
        if (!exists) throw new Error("not_found");
        return cur.filter((f) => f.id !== id);
      },
      `Delete farm ${id} (${user.email || user.userId})`
    );

    return NextResponse.json({ ok: true, items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message === "not_found") {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete farm" }, { status: 502 });
  }
}
