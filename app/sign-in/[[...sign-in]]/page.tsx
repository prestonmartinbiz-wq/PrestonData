import { SignIn } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/env";

export default function SignInPage() {
  if (!clerkConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
          Clerk keys are not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and
          CLERK_SECRET_KEY in .env.local, or use local demo mode at /dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <SignIn />
    </div>
  );
}
