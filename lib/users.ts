import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { PublicUser, User } from "@/lib/types";

/** Hash a password as "salt:hash" using scrypt (no external deps). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    computed.length === expected.length && timingSafeEqual(computed, expected)
  );
}

export function normalizeUsername(username: string): string {
  return (username || "").trim().toLowerCase();
}

/** Username rules: 3–32 chars, letters/numbers/._- only. */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,32}$/.test(normalizeUsername(username));
}

/** Strip the password hash before returning a user to the client. */
export function publicUser(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  void _omit;
  return rest;
}
