import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadUsers } from "@/lib/data-store";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { publicUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const payload = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!payload) return NextResponse.json({ user: null });
  const { users } = await loadUsers();
  const user = users.find((u) => u.id === payload.uid);
  return NextResponse.json({ user: user ? publicUser(user) : null });
}
