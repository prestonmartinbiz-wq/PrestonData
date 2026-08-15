import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { loadUsers } from "@/lib/data-store";
import { clerkConfigured } from "@/lib/env";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export { clerkConfigured };

export type CurrentUser = {
  userId: string;
  email: string;
  fullName: string;
  username: string;
  /** true when signed in with a username/password account (vs. passcode guest). */
  account: boolean;
};

/** Resolve the signed-in account from our session cookie, if any. */
async function accountUser(): Promise<CurrentUser | null> {
  try {
    const jar = await cookies();
    const payload = await verifySession(jar.get(SESSION_COOKIE)?.value);
    if (!payload) return null;
    const { users } = await loadUsers();
    const u = users.find((x) => x.id === payload.uid);
    if (!u) return null;
    return {
      userId: u.id,
      email: u.email,
      fullName: u.name || u.username,
      username: u.username,
      account: true,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<CurrentUser> {
  // A username/password account (our own auth) takes precedence when present.
  const acct = await accountUser();
  if (acct) return acct;

  if (!clerkConfigured()) {
    return {
      userId: "local-demo",
      email: "demo@local.dev",
      fullName: "Local Demo",
      username: "",
      account: false,
    };
  }

  const { userId } = await auth();
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  const allow = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allow.length && email && !allow.includes(email.toLowerCase())) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    userId,
    email,
    fullName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || email,
    username: user?.username || email,
    account: true,
  };
}
