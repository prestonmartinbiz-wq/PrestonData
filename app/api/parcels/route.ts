import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parcelAtPoint, parcelByApn, parcelsInBbox } from "@/lib/parcels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy to Clark County's free public parcel service (server-side, avoids CORS).
 *   /api/parcels?bbox=west,south,east,north   → parcels in the current map view
 *   /api/parcels?point=lng,lat                → the parcel clicked
 *   /api/parcels?apn=16220210008              → a parcel by APN
 * Returns GeoJSON (FeatureCollection) with APN + acreage per parcel.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const bbox = sp.get("bbox");
    const point = sp.get("point");
    const apn = sp.get("apn");

    let data;
    if (bbox) {
      const [w, s, e, n] = bbox.split(",").map(Number);
      if ([w, s, e, n].some((v) => !Number.isFinite(v))) {
        return NextResponse.json({ error: "bad bbox" }, { status: 400 });
      }
      data = await parcelsInBbox(w, s, e, n);
    } else if (point) {
      const [lng, lat] = point.split(",").map(Number);
      if (![lng, lat].every((v) => Number.isFinite(v))) {
        return NextResponse.json({ error: "bad point" }, { status: 400 });
      }
      data = await parcelAtPoint(lng, lat);
    } else if (apn) {
      data = await parcelByApn(apn);
    } else {
      return NextResponse.json({ error: "bbox, point, or apn required" }, { status: 400 });
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load parcels" }, { status: 502 });
  }
}
