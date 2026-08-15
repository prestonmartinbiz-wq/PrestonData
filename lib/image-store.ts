import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import type { EmlAttachment } from "@/lib/eml";

const LOCAL_IMAGE_DIR = path.join(process.cwd(), "public", "pipeline-images");

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** True when running on Vercel's read-only serverless filesystem. */
function onVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function extFor(contentType: string): string {
  const m = /image\/(\w+)/i.exec(contentType || "");
  const e = (m?.[1] || "png").toLowerCase();
  return e === "jpeg" ? "jpg" : e;
}

/**
 * Persist diagram images extracted from an NVE .eml and return public URLs to
 * store on the pipeline record.
 *
 * - Vercel Blob when configured (durable, immediately servable).
 * - Local `public/pipeline-images/` in dev.
 * - On Vercel without Blob we skip persistence and return [] — we never embed
 *   large base64 data URLs into the GitHub-backed JSON, which would risk
 *   exceeding the Contents API read limit and breaking the whole store.
 */
export async function storePipelineImages(
  attachments: EmlAttachment[],
  keyPrefix: string,
  opts: { maxCount?: number; maxBytes?: number } = {}
): Promise<{ urls: string[]; skipped: number }> {
  const maxCount = opts.maxCount ?? 8;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const images = (attachments || []).filter((a) =>
    /^image\//i.test(a.contentType)
  );
  if (!images.length) return { urls: [], skipped: 0 };

  const usable = images.filter((a) => a.data.length <= maxBytes).slice(0, maxCount);
  const skipped = images.length - usable.length;

  if (blobConfigured()) {
    const urls: string[] = [];
    for (let i = 0; i < usable.length; i++) {
      const a = usable[i];
      const pathname = `pipeline-images/${keyPrefix}-${i}.${extFor(a.contentType)}`;
      const result = await put(pathname, a.data, {
        access: "public",
        contentType: a.contentType,
        addRandomSuffix: true,
      });
      urls.push(result.url);
    }
    return { urls, skipped };
  }

  if (onVercel()) {
    // No durable store available — keep the datastore safe, skip images.
    return { urls: [], skipped: images.length };
  }

  await fs.mkdir(LOCAL_IMAGE_DIR, { recursive: true });
  const urls: string[] = [];
  for (let i = 0; i < usable.length; i++) {
    const a = usable[i];
    const filename = `${keyPrefix}-${i}.${extFor(a.contentType)}`;
    await fs.writeFile(path.join(LOCAL_IMAGE_DIR, filename), a.data);
    urls.push(`/pipeline-images/${filename}`);
  }
  return { urls, skipped };
}
