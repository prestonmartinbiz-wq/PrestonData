import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadLeads, saveLeads } from "@/lib/data-store";
import { geocodeTiered, hasCoords, sleep } from "@/lib/geocode";
import { normalizeApn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cap per request so a serverless invocation stays well under its timeout. */
const BATCH = 6;

/**
 * Geocode leads that are missing coordinates via keyless OSM Nominatim and
 * persist the results. Optionally pass { apn } to geocode a single lead (e.g.
 * right after importing it). Returns how many were updated and how many remain,
 * so the client can call again to finish a large backlog.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { apn?: string };
    const onlyApn = body.apn ? normalizeApn(body.apn) : "";

    const { leads } = await loadLeads();
    const pending = leads.filter((l) => {
      if (hasCoords(l.latitude, l.longitude)) return false;
      if (!(l.propertyAddress || "").trim()) return false;
      if (onlyApn) return normalizeApn(l.apn) === onlyApn;
      return true;
    });

    if (!pending.length) {
      return NextResponse.json({ updated: 0, remaining: 0, done: true });
    }

    const batch = pending.slice(0, onlyApn ? pending.length : BATCH);
    let updated = 0;
    for (let i = 0; i < batch.length; i++) {
      const lead = batch[i];
      const hit = await geocodeTiered(lead.propertyAddress);
      if (hit) {
        lead.latitude = String(hit.lat);
        lead.longitude = String(hit.lng);
        updated++;
      }
      if (i < batch.length - 1) await sleep(1100);
    }

    if (updated > 0) {
      await saveLeads(
        leads,
        `Geocode ${updated} parcel(s) (${user.email || user.userId})`
      );
    }

    const remaining = pending.length - batch.length;
    return NextResponse.json({
      updated,
      remaining,
      done: remaining === 0,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
