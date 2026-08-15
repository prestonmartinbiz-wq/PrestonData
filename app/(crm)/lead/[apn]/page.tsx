import { notFound } from "next/navigation";
import { LeadDetail } from "@/components/crm/lead-detail";
import { requireUser } from "@/lib/auth";
import { loadCalls, loadLeads, loadTasks, loadTeam } from "@/lib/data-store";
import { normalizeApn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ apn: string }>;
}) {
  const user = await requireUser();
  const { apn } = await params;
  const key = normalizeApn(apn);

  const [{ leads }, { calls }, { team }, { tasks }] = await Promise.all([
    loadLeads(),
    loadCalls(),
    loadTeam(),
    loadTasks(),
  ]);

  const lead = leads.find((l) => normalizeApn(l.apn) === key);
  if (!lead) notFound();

  const leadCalls = calls
    .filter((c) => normalizeApn(c.apn) === key)
    .sort((a, b) => (Date.parse(b.calledAt) || 0) - (Date.parse(a.calledAt) || 0));
  const leadTasks = tasks.filter((t) => normalizeApn(t.apn) === key);

  return (
    <LeadDetail
      lead={lead}
      initialCalls={leadCalls}
      team={team.members}
      currentUserEmail={user.email}
      currentUserName={user.fullName}
      initialTasks={leadTasks}
    />
  );
}
