import { notFound } from "next/navigation";
import { DealDetail } from "@/components/crm/deal-detail";
import { requireUser } from "@/lib/auth";
import { loadDeals, loadPipeline } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const [{ items }, { items: pipeline }] = await Promise.all([
    loadDeals(),
    loadPipeline(),
  ]);

  const deal = items.find((d) => d.id === id);
  if (!deal) notFound();

  // Attach the matching pipeline substation so we can show Chad's NVE emails.
  const sub = deal.substation
    ? pipeline.find(
        (p) => p.name.trim().toLowerCase() === deal.substation.trim().toLowerCase()
      ) || null
    : null;

  const substationNames = Array.from(
    new Set(
      pipeline
        .filter((p) => (p.kind ?? "substation") === "substation")
        .map((p) => p.name.trim())
        .filter(Boolean)
    )
  ).sort();

  return (
    <DealDetail
      deal={deal}
      substation={sub}
      substationNames={substationNames}
      currentUser={user.email}
    />
  );
}
