import { TeamPageClient } from "@/components/crm/team-page";
import { requireUser } from "@/lib/auth";
import { loadTeam } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireUser();
  const { team, meta } = await loadTeam();
  return <TeamPageClient initialMembers={team.members} initialMeta={meta} />;
}
