import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCallById, updateCallMedia } from "@/lib/data-store";
import { openaiConfigured, summarizeTranscript } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ callId: string }> };

/**
 * Attach a transcript to a call from pasted text or an uploaded .txt file,
 * without requiring an audio recording. Useful when the caller already has a
 * transcript, or when Whisper transcription is unavailable.
 */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const user = await requireUser();
    const { callId } = await ctx.params;
    const call = await getCallById(callId);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    let transcript = "";
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const text = form.get("transcript");
      if (file instanceof File) transcript = await file.text();
      else if (typeof text === "string") transcript = text;
    } else {
      const body = (await req.json()) as { transcript?: string };
      transcript = body.transcript || "";
    }

    transcript = transcript.trim();
    if (!transcript) {
      return NextResponse.json({ error: "Transcript text is required" }, { status: 400 });
    }

    const transcriptSummary = openaiConfigured()
      ? await summarizeTranscript(transcript)
      : "";

    const updated = await updateCallMedia(
      callId,
      {
        transcript,
        transcriptStatus: "ready",
        transcriptSummary,
      },
      `Add text transcript to call ${callId} (${user.email || user.userId})`
    );

    return NextResponse.json({ call: updated.call, calls: updated.calls, meta: updated.meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to save transcript" }, { status: 500 });
  }
}
