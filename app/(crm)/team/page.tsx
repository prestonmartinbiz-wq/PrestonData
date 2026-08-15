import { TeamPageClient } from "@/components/crm/team-page";
import { requireUser } from "@/lib/auth";
import { loadTeam, loadUsers } from "@/lib/data-store";
import { publicUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireUser();
  const [{ team, meta }, { users }] = await Promise.all([loadTeam(), loadUsers()]);
  return (
    <TeamPageClient
      initialMembers={team.members}
      initialMeta={meta}
      accounts={users.map(publicUser)}
      currentUsername={user.username}
      loggedIn={user.account}
    />
  );
}
