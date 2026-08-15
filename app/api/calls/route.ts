import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { callsToCsv } from "@/lib/csv";
import { appendCall, deleteCall, loadCalls, updateCall } from "@/lib/data-store";
import type { CallRecord } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { calls, meta } = await loadCalls();
    const apn = req.nextUrl.searchParams.get("apn");
    const format = req.nextUrl.searchParams.get("format");

    const filtered = apn
      ? calls.filter((c) => normalizeApn(c.apn) === normalizeApn(apn))
      : calls;

    // Newest first for UI / Dispatch consumers
    const sorted = [...filtered].sort((a, b) => {
      const at = Date.parse(a.calledAt || "") || 0;
      const bt = Date.parse(b.calledAt || "") || 0;
      return bt - at;
    });

    if (format === "csv") {
      return new NextResponse(callsToCsv(sorted), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="calls.csv"',
        },
      });
    }

    return NextResponse.json({ calls: sorted, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load calls" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    type CallBody = {
      apn?: string;
      caller?: string;
      contactName?: string;
      phoneUsed?: string;
      calledAt?: string;
      outcome?: string;
      callbackAt?: string;
      notes?: string;
      durationSec?: string | number;
      source?: string;
      callId?: string;
    };

    const body = (await req.json()) as CallBody & { call?: CallBody };
    const payload: CallBody = body.call ?? body;
    const apn = payload.apn;
    const outcome = payload.outcome;
    if (!apn || !outcome) {
      return NextResponse.json(
        { error: "apn and outcome are required" },
        { status: 400 }
      );
    }

    const defaultCaller = user.fullName || user.email || user.userId;
    const result = await appendCall({
      apn,
      outcome,
      caller: payload.caller?.trim() || defaultCaller,
      contactName: payload.contactName,
      phoneUsed: payload.phoneUsed,
      calledAt: payload.calledAt,
      callbackAt: payload.callbackAt,
      notes: payload.notes,
      durationSec: payload.durationSec,
      source: payload.source || "crm_ui",
      callId: payload.callId,
    });

    return NextResponse.json({
      call: result.call,
      calls: result.calls,
      leads: result.leads,
      meta: result.callsMeta,
      leadsMeta: result.leadsMeta,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Failed to log call";
    const status =
      message === "Lead not found for APN"
        ? 404
        : message === "callId already exists"
          ? 409
          : message.includes("required")
            ? 400
            : 500;
    if (status === 500) console.error(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      callId?: string;
      patch?: Partial<CallRecord>;
    };
    if (!body.callId) {
      return NextResponse.json({ error: "callId is required" }, { status: 400 });
    }
    const who = user.fullName || user.email || user.userId;
    const result = await updateCall(body.callId, body.patch || {}, who);
    return NextResponse.json({ call: result.call, calls: result.calls, leads: result.leads });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Failed to edit call";
    const status = message === "Call not found" ? 404 : 500;
    if (status === 500) console.error(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const callId = req.nextUrl.searchParams.get("callId");
    if (!callId) {
      return NextResponse.json({ error: "callId is required" }, { status: 400 });
    }
    const who = user.fullName || user.email || user.userId;
    const result = await deleteCall(callId, who);
    return NextResponse.json({ calls: result.calls, leads: result.leads });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Failed to delete call";
    const status =
      message === "Lead not found for APN"
        ? 404
        : message === "callId already exists"
          ? 409
          : message.includes("required")
            ? 400
            : 500;
    if (status === 500) console.error(err);
    return NextResponse.json({ error: message }, { status });
  }
}
