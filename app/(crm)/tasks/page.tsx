import { TasksPageClient } from "@/components/crm/tasks-page";
import { requireUser } from "@/lib/auth";
import { loadTasks } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireUser();
  const { tasks } = await loadTasks();
  return <TasksPageClient initialTasks={tasks} currentUserEmail={user.email} />;
}
