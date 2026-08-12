import { SignUp } from "@clerk/nextjs";
import { clerkConfigured } from "@/lib/env";

export default function SignUpPage() {
  if (!clerkConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
          Clerk keys are not configured. Set env keys to enable sign-up.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <SignUp />
    </div>
  );
}
