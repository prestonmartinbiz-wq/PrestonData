import { DealsBoard } from "@/components/crm/deals-board";
import { requireUser } from "@/lib/auth";
import { loadDeals, loadPipeline } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const user = await requireUser();
  const [{ items }, { items: pipeline }] = await Promise.all([
    loadDeals(),
    loadPipeline(),
  ]);

  const substationNames = Array.from(
    new Set(
      pipeline
        .filter((p) => (p.kind ?? "substation") === "substation")
        .map((p) => p.name.trim())
        .filter(Boolean)
    )
  ).sort();

  return (
    <DealsBoard
      initialItems={items}
      substationNames={substationNames}
      currentUser={user.email}
    />
  );
}
