import OpenAI, { toFile } from "openai";

export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Transcribe call audio with OpenAI Whisper when OPENAI_API_KEY is set.
 * Returns null when the key is missing (caller should mark transcriptStatus=skipped).
 */
export async function transcribeAudio(opts: {
  bytes: Buffer;
  filename: string;
  contentType?: string;
}): Promise<{ transcript: string; model: string } | null> {
  if (!openaiConfigured()) return null;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const file = await toFile(opts.bytes, opts.filename || "recording.webm", {
    type: opts.contentType || undefined,
  });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "text",
  });

  const transcript = typeof result === "string" ? result : String(result || "");
  return { transcript: transcript.trim(), model: "whisper-1" };
}

/** Short seller-conversation summary for Dispatch; best-effort when key present. */
export async function summarizeTranscript(
  transcript: string
): Promise<string> {
  if (!openaiConfigured() || !(transcript || "").trim()) return "";

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You summarize land-acquisition outreach calls. In 2-3 sentences cover: seller stance, interest level, objections, and any agreed next step/callback. No fluff.",
        },
        { role: "user", content: transcript.slice(0, 12000) },
      ],
    });
    return (completion.choices[0]?.message?.content || "").trim();
  } catch (err) {
    console.warn("Transcript summary failed", err);
    return "";
  }
}
