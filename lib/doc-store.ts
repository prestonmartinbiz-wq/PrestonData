import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";

const LOCAL_DOC_DIR = path.join(process.cwd(), "public", "deal-docs");

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function onVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

/** Deal-document files can be large (CAD/PDF); allow up to 50MB. */
export const MAX_DEAL_DOC_BYTES = 50 * 1024 * 1024;

export type StoredDoc = { url: string; storage: "blob" | "local" } | null;

function safe(part: string): string {
  return (part || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

/**
 * Persist a deal document. Prefers Vercel Blob, falls back to local `public/`
 * in dev. Returns null when neither is available (prod without Blob) — the
 * caller should tell the user to record an external link instead. We never
 * embed binaries in the GitHub-backed JSON store.
 */
export async function storeDealDoc(
  dealId: string,
  key: string,
  bytes: Buffer,
  opts: { filename?: string; contentType?: string } = {}
): Promise<StoredDoc> {
  const contentType = opts.contentType || "application/octet-stream";
  const name = safe(opts.filename || `${key}.bin`);
  const pathname = `deal-docs/${safe(dealId)}/${safe(key)}-${name}`;

  if (blobConfigured()) {
    const result = await put(pathname, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return { url: result.url, storage: "blob" };
  }

  if (onVercel()) return null;

  const dir = path.join(LOCAL_DOC_DIR, safe(dealId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${safe(key)}-${name}`;
  await fs.writeFile(path.join(dir, filename), bytes);
  return { url: `/deal-docs/${safe(dealId)}/${filename}`, storage: "local" };
}
