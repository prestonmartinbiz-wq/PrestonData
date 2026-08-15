import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadUsers, mutateUsers } from "@/lib/data-store";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import {
  hashPassword,
  isValidUsername,
  normalizeUsername,
  publicUser,
} from "@/lib/users";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a login account. Reachable only from inside the gated app (the site
 * passcode / an existing session is required to get here), so accounts can only
 * be created by people who already have access. The new account is logged in.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      name?: string;
      email?: string;
    };
    const username = normalizeUsername(body.username || "");
    const password = body.password || "";
    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();

    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: "Username must be 3–32 chars: letters, numbers, . _ -" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const { users } = await loadUsers();
    if (users.some((u) => u.username === username)) {
      return NextResponse.json(
        { error: "That username is taken" },
        { status: 409 }
      );
    }

    const user: User = {
      id: randomUUID(),
      username,
      name: name || username,
      email,
      passwordHash: hashPassword(password),
      role: users.length === 0 ? "admin" : "member",
      createdAt: new Date().toISOString(),
    };

    await mutateUsers((list) => [...list, user], `Create account ${username}`);

    const token = await signSession(user.id);
    const res = NextResponse.json({ ok: true, user: publicUser(user) });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
