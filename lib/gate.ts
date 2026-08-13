/**
 * Simple shared-password gate for the whole site.
 *
 * The password defaults to "megawatt" but can be overridden with the
 * SITE_PASSWORD environment variable (recommended in production so the value
 * isn't in the repo). The unlock cookie stores a SHA-256 token derived from the
 * password (not the password itself), and the middleware compares against the
 * same token. Uses Web Crypto so it works in both the edge and node runtimes.
 */

export const GATE_COOKIE = "rmax_gate";

/** Cookie lifetime: 30 days. */
export const GATE_MAX_AGE = 60 * 60 * 24 * 30;

export function getSitePassword(): string {
  return process.env.SITE_PASSWORD || "megawatt";
}

/** Derive an opaque cookie token from a password (SHA-256 hex). */
export async function computeGateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`rmax-gate:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
