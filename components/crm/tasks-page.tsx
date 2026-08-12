"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, Check, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Task } from "@/lib/types";

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function TasksPageClient({
  initialTasks,
  currentUserEmail,
}: {
  initialTasks: Task[];
  currentUserEmail?: string;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [showDone, setShowDone] = useState(false);
  const [now] = useState(() => Date.now());

  const visible = useMemo(() => {
    const me = (currentUserEmail || "").toLowerCase();
    let rows = tasks;
    if (scope === "mine" && me) {
      rows = rows.filter(
        (t) => !t.assignedTo || t.assignedTo.toLowerCase() === me
      );
    }
    if (!showDone) rows = rows.filter((t) => t.status !== "done");
    return [...rows].sort((a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0));
  }, [tasks, scope, showDone, currentUserEmail]);

  const openCount = visible.filter((t) => t.status === "open").length;

  async function setStatus(id: string, status: "open" | "done") {
    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch: { status } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTasks((t) => t.map((x) => (x.id === id ? data.task : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch("/api/tasks?id=" + encodeURIComponent(id), { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTasks((t) => t.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-slate-500">
            Call reminders and follow-ups. {openCount} open.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={scope === "mine" ? "default" : "outline"} size="sm" onClick={() => setScope("mine")}>
            My tasks
          </Button>
          <Button variant={scope === "all" ? "default" : "outline"} size="sm" onClick={() => setScope("all")}>
            All
          </Button>
          <Button variant={showDone ? "default" : "outline"} size="sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide done" : "Show done"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {visible.map((t) => {
            const overdue = t.status === "open" && (Date.parse(t.dueAt) || 0) < now;
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Bell
                    className={`mt-0.5 h-4 w-4 shrink-0 ${overdue ? "text-rose-500" : "text-slate-400"}`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{t.title || "Call"}</span>
                      {overdue ? (
                        <Badge className="border-rose-200 bg-rose-50 text-rose-700">Overdue</Badge>
                      ) : null}
                      {t.status === "done" ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Done</Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Due {formatWhen(t.dueAt)}
                      {t.propertyAddress ? ` · ${t.propertyAddress}` : ""}
                    </div>
                    {t.note ? <div className="mt-0.5 text-xs text-slate-600">{t.note}</div> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.apn ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/lead/${encodeURIComponent(t.apn)}`}>Open</Link>
                    </Button>
                  ) : null}
                  {t.status === "open" ? (
                    <Button size="sm" onClick={() => setStatus(t.id, "done")}>
                      <Check className="h-4 w-4" /> Done
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "open")}>
                      Reopen
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(t.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </li>
            );
          })}
          {!visible.length ? (
            <li className="px-4 py-10 text-center text-slate-500">
              No tasks. Open a parcel and use “Remind me to call”.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
