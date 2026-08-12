import { promises as fs } from "fs";
import path from "path";
import { get, put } from "@vercel/blob";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_AUDIO_MIME,
  MAX_CALL_AUDIO_BYTES,
} from "@/lib/types";

const LOCAL_AUDIO_DIR = path.join(process.cwd(), "data", "call-audio");

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function callAudioAppUrl(callId: string): string {
  return `/api/calls/${encodeURIComponent(callId)}/audio`;
}

function extensionFromName(filename: string, mime: string): string {
  const lower = (filename || "").toLowerCase();
  for (const ext of ALLOWED_AUDIO_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext.slice(1);
  }
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  if (mime.includes("webm")) return "webm";
  return "webm";
}

export function validateAudioFile(file: {
  name?: string;
  type?: string;
  size?: number;
}): string | null {
  const size = file.size ?? 0;
  if (!size) return "Audio file is empty";
  if (size > MAX_CALL_AUDIO_BYTES) {
    return `Audio file exceeds ${Math.round(MAX_CALL_AUDIO_BYTES / (1024 * 1024))}MB limit`;
  }
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const extOk = ALLOWED_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (mime && !ALLOWED_AUDIO_MIME.has(mime) && !extOk) {
    return "Unsupported audio type. Use mp3, m4a, wav, webm, or ogg.";
  }
  if (!mime && !extOk) {
    return "Unsupported audio type. Use mp3, m4a, wav, webm, or ogg.";
  }
  return null;
}

export type StoredAudio = {
  audioPath: string;
  audioUrl: string;
  contentType: string;
  bytes: number;
  storage: "blob" | "local";
};

/**
 * Persist call audio. Prefer Vercel Blob when BLOB_READ_WRITE_TOKEN is set;
 * otherwise write under data/call-audio/ (dev / local only — use object storage in prod).
 */
export async function storeCallAudio(
  callId: string,
  bytes: Buffer,
  opts: { filename?: string; contentType?: string } = {}
): Promise<StoredAudio> {
  const contentType = opts.contentType || "application/octet-stream";
  const ext = extensionFromName(opts.filename || "", contentType);
  const safeId = callId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("Invalid callId");

  const audioUrl = callAudioAppUrl(safeId);

  if (blobConfigured()) {
    const pathname = `call-audio/${safeId}.${ext}`;
    const result = await put(pathname, bytes, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return {
      audioPath: `blob:${result.pathname}`,
      audioUrl,
      contentType,
      bytes: bytes.length,
      storage: "blob",
    };
  }

  await fs.mkdir(LOCAL_AUDIO_DIR, { recursive: true });
  const filename = `${safeId}.${ext}`;
  const full = path.join(LOCAL_AUDIO_DIR, filename);
  await fs.writeFile(full, bytes);
  return {
    audioPath: `local:call-audio/${filename}`,
    audioUrl,
    contentType,
    bytes: bytes.length,
    storage: "local",
  };
}

export async function readCallAudio(audioPath: string): Promise<{
  data: Buffer;
  contentType: string;
} | null> {
  if (!audioPath) return null;

  if (audioPath.startsWith("blob:")) {
    if (!blobConfigured()) return null;
    const pathname = audioPath.slice("blob:".length);
    const result = await get(pathname, { access: "private" });
    if (!result?.stream) return null;
    const data = Buffer.from(await new Response(result.stream).arrayBuffer());
    return {
      data,
      contentType: result.blob.contentType || "application/octet-stream",
    };
  }

  if (audioPath.startsWith("local:")) {
    const rel = audioPath.slice("local:".length); // call-audio/foo.webm
    const base = path.basename(rel);
    const full = path.join(LOCAL_AUDIO_DIR, base);
    try {
      const data = await fs.readFile(full);
      const ext = path.extname(base).toLowerCase();
      const contentType =
        ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".wav"
            ? "audio/wav"
            : ext === ".ogg"
              ? "audio/ogg"
              : ext === ".m4a" || ext === ".mp4"
                ? "audio/mp4"
                : "audio/webm";
      return { data, contentType };
    } catch {
      return null;
    }
  }

  return null;
}
