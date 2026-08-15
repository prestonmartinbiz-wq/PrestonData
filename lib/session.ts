/**
 * Stateless, signed session cookie for username/password accounts. The cookie
 * holds `base64url(payload).hmac` where payload = { uid, iat }. It's verified
 * with HMAC-SHA256 via Web Crypto so it works in both the edge middleware and
 * Node route handlers, with no database lookup needed to check the signature.
 */
import { getSitePassword } from "@/lib/gate";

export const SESSION_COOKIE = "rmax_user";
/** 30 days. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sessionSecret(): string {
  return process.env.SESSION_SECRET || `session:${getSitePassword()}`;
}

function toB64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(b64u: string): string {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signSession(userId: string): Promise<string> {
  const payload = toB64Url(JSON.stringify({ uid: userId, iat: Date.now() }));
  const sig = await hmacHex(sessionSecret(), payload);
  return `${payload}.${sig}`;
}

export async function verifySession(
  token: string | undefined | null
): Promise<{ uid: string; iat: number } | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmacHex(sessionSecret(), payload);
  if (sig !== expected) return null;
  try {
    const obj = JSON.parse(fromB64Url(payload)) as { uid?: string; iat?: number };
    if (!obj || typeof obj.uid !== "string") return null;
    if (Date.now() - (obj.iat || 0) > SESSION_MAX_AGE * 1000) return null;
    return { uid: obj.uid, iat: obj.iat || 0 };
  } catch {
    return null;
  }
}
