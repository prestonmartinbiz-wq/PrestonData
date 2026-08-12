import { AppShell } from "@/components/crm/app-shell";
import { requireUser } from "@/lib/auth";
import { clerkConfigured } from "@/lib/env";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell userEmail={user.email} clerkEnabled={clerkConfigured()}>
      {children}
    </AppShell>
  );
}
