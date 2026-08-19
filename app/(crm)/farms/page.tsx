import { FarmsPageClient } from "@/components/crm/farms-page";
import { requireUser } from "@/lib/auth";
import { loadFarms, loadTeam } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function FarmsPage() {
  await requireUser();
  const [{ items, meta }, { team }] = await Promise.all([loadFarms(), loadTeam()]);
  const teamNames = team.members.map((m) => m.name).filter(Boolean);

  return (
    <FarmsPageClient
      initialFarms={items}
      initialMeta={meta}
      teamNames={teamNames}
    />
  );
}
