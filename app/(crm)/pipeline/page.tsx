import { PipelineBoard } from "@/components/crm/pipeline-board";
import { requireUser } from "@/lib/auth";
import { loadPipeline } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const user = await requireUser();
  const { items } = await loadPipeline();
  return <PipelineBoard initialItems={items} currentUser={user.email} />;
}
