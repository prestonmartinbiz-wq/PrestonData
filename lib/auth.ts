import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkConfigured } from "@/lib/env";

export { clerkConfigured };

export async function requireUser() {
  if (!clerkConfigured()) {
    return {
      userId: "local-demo",
      email: "demo@local.dev",
      fullName: "Local Demo",
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
  };
}
