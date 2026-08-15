import { NextRequest, NextResponse } from "next/server";
import {
  GATE_COOKIE,
  GATE_MAX_AGE,
  computeGateToken,
  getSitePassword,
} from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { password?: string; next?: string };
    const password = (body.password || "").trim();
    if (!password || password !== getSitePassword()) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Only allow same-site relative redirects.
    let next = body.next || "/board";
    if (!next.startsWith("/") || next.startsWith("//")) next = "/board";

    const token = await computeGateToken(password);
    const res = NextResponse.json({ ok: true, next });
    res.cookies.set(GATE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GATE_MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Unlock failed" }, { status: 500 });
  }
}
