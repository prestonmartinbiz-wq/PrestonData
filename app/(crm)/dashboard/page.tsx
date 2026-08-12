import { LeadsDashboard } from "@/components/crm/leads-dashboard";
import { requireUser } from "@/lib/auth";
import { loadLeads, loadTeam } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [{ leads, meta }, { team }] = await Promise.all([loadLeads(), loadTeam()]);

  return (
    <LeadsDashboard
      initialLeads={leads}
      initialMeta={meta}
      team={team.members}
      currentUserEmail={user.email}
    />
  );
}
