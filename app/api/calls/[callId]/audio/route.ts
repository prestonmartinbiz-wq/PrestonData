import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  readCallAudio,
  storeCallAudio,
  validateAudioFile,
} from "@/lib/audio-store";
import { getCallById, updateCallMedia } from "@/lib/data-store";
import { openaiConfigured, summarizeTranscript, transcribeAudio } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ callId: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    await requireUser();
    const { callId } = await ctx.params;
    const call = await getCallById(callId);
    if (!call?.audioPath) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }

    const stored = await readCallAudio(call.audioPath);
    if (!stored) {
      return NextResponse.json({ error: "Audio file missing" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(stored.data), {
      status: 200,
      headers: {
        "Content-Type": stored.contentType,
        "Content-Length": String(stored.data.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${callId}-recording"`,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load audio" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const user = await requireUser();
    const { callId } = await ctx.params;
    const call = await getCallById(callId);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file") || form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "multipart field 'file' (audio) is required" },
        { status: 400 }
      );
    }

    const validationError = validateAudioFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await storeCallAudio(callId, bytes, {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    });

    // Mark pending while we attempt transcription
    await updateCallMedia(
      callId,
      {
        audioUrl: stored.audioUrl,
        audioPath: stored.audioPath,
        transcriptStatus: "pending",
        transcript: call.transcript || "",
        transcriptSummary: call.transcriptSummary || "",
      },
      `Attach audio to call ${callId} (${user.email || user.userId})`
    );

    let transcript = "";
    let transcriptSummary = "";
    let transcriptStatus: "ready" | "failed" | "skipped" = "skipped";
    let transcriptNote = "";

    if (!openaiConfigured()) {
      transcriptStatus = "skipped";
      transcriptNote = "Transcription needs OPENAI_API_KEY";
    } else {
      try {
        const result = await transcribeAudio({
          bytes,
          filename: file.name || `${callId}.webm`,
          contentType: file.type,
        });
        if (!result) {
          transcriptStatus = "skipped";
          transcriptNote = "Transcription needs OPENAI_API_KEY";
        } else {
          transcript = result.transcript;
          transcriptStatus = "ready";
          transcriptSummary = await summarizeTranscript(transcript);
        }
      } catch (err) {
        console.error("Transcription failed", err);
        transcriptStatus = "failed";
        transcriptNote =
          err instanceof Error ? err.message : "Transcription failed";
      }
    }

    const updated = await updateCallMedia(
      callId,
      {
        audioUrl: stored.audioUrl,
        audioPath: stored.audioPath,
        transcript,
        transcriptStatus,
        transcriptSummary,
      },
      `Transcribe call ${callId} (${transcriptStatus})`
    );

    return NextResponse.json({
      call: updated.call,
      calls: updated.calls,
      meta: updated.meta,
      storage: stored.storage,
      transcriptNote: transcriptNote || undefined,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload audio" },
      { status: 500 }
    );
  }
}
