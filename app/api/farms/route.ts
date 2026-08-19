import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadFarms, mutateFarms } from "@/lib/data-store";
import {
  colorForAssignee,
  computeMembersForBoundary,
  newFarmId,
} from "@/lib/farms";
import type { Farm, FarmBoundary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBoundary(v: unknown): v is FarmBoundary {
  if (!v || typeof v !== "object") return false;
  const b = v as FarmBoundary;
  return (
    b.type === "Polygon" &&
    Array.isArray(b.coordinates) &&
    b.coordinates.length > 0 &&
    Array.isArray(b.coordinates[0]) &&
    b.coordinates[0].length >= 4
  );
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const assignedTo = req.nextUrl.searchParams.get("assignedTo")?.trim();
    const { items, meta } = await loadFarms();
    const filtered = assignedTo
      ? items.filter((f) => f.assignedTo === assignedTo)
      : items;
    return NextResponse.json({ items: filtered, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load farms" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Partial<Farm>;
    const name = (body.name || "").trim();
    const assignedTo = (body.assignedTo || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Farm name is required" }, { status: 400 });
    }
    if (!assignedTo) {
      return NextResponse.json({ error: "Assigned team member is required" }, { status: 400 });
    }
    if (!isBoundary(body.boundary)) {
      return NextResponse.json({ error: "Valid polygon boundary is required" }, { status: 400 });
    }

    const members = await computeMembersForBoundary(body.boundary);
    const now = new Date().toISOString();
    const creator = user.email || user.userId || "unknown";

    const { items: existing } = await loadFarms();
    const farm: Farm = {
      id: newFarmId(name),
      name,
      assignedTo,
      substationOfInterest: (body.substationOfInterest || "").trim(),
      notes: (body.notes || "").trim(),
      color: colorForAssignee(assignedTo, existing),
      boundary: body.boundary,
      members,
      createdBy: creator,
      createdAt: now,
      updatedAt: now,
    };

    const { items, meta } = await mutateFarms(
      (cur) => [...cur, farm],
      `Create farm "${name}" (${user.email || user.userId})`
    );

    return NextResponse.json({ farm, items, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to create farm" }, { status: 502 });
  }
}
