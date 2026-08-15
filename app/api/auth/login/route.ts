import { NextRequest, NextResponse } from "next/server";
import { loadUsers } from "@/lib/data-store";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import { normalizeUsername, publicUser, verifyPassword } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      next?: string;
    };
    const username = normalizeUsername(body.username || "");
    const password = body.password || "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const { users } = await loadUsers();
    const user = users.find((u) => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Incorrect username or password" },
        { status: 401 }
      );
    }

    let next = body.next || "/board";
    if (!next.startsWith("/") || next.startsWith("//")) next = "/board";

    const token = await signSession(user.id);
    const res = NextResponse.json({ ok: true, next, user: publicUser(user) });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
