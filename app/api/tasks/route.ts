import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { loadTasks, saveTasks } from "@/lib/data-store";
import type { Task } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { tasks, meta } = await loadTasks();
    const apn = req.nextUrl.searchParams.get("apn");
    const scope = req.nextUrl.searchParams.get("scope"); // "mine" | "all"

    let filtered = tasks;
    if (apn) {
      const key = normalizeApn(apn);
      filtered = filtered.filter((t) => normalizeApn(t.apn) === key);
    }
    if (scope === "mine" && user.email) {
      filtered = filtered.filter(
        (t) => (t.assignedTo || "").toLowerCase() === user.email.toLowerCase()
      );
    }

    const sorted = [...filtered].sort(
      (a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0)
    );
    return NextResponse.json({ tasks: sorted, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as Partial<Task>;
    if (!body.dueAt) {
      return NextResponse.json({ error: "dueAt is required" }, { status: 400 });
    }

    const { tasks } = await loadTasks();
    const task: Task = {
      id: randomUUID(),
      apn: normalizeApn(body.apn || "") || (body.apn || ""),
      propertyAddress: body.propertyAddress || "",
      title: (body.title || "Call owner").trim(),
      note: (body.note || "").trim(),
      dueAt: body.dueAt,
      assignedTo: (body.assignedTo || user.email || "").trim(),
      status: "open",
      createdBy: user.email || user.userId,
      createdAt: new Date().toISOString(),
      completedAt: "",
    };
    const next = [task, ...tasks];
    const meta = await saveTasks(
      next,
      `Add task for ${task.apn || "lead"} (${user.email || user.userId})`
    );
    return NextResponse.json({ task, tasks: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { id?: string; patch?: Partial<Task> };
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const { tasks } = await loadTasks();
    const idx = tasks.findIndex((t) => t.id === body.id);
    if (idx === -1) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const patch = body.patch || {};
    const updated: Task = { ...tasks[idx], ...patch, id: tasks[idx].id };
    if (patch.status === "done" && !updated.completedAt) {
      updated.completedAt = new Date().toISOString();
    }
    if (patch.status === "open") updated.completedAt = "";
    const next = [...tasks];
    next[idx] = updated;
    const meta = await saveTasks(next, `Update task ${updated.id} (${user.email || user.userId})`);
    return NextResponse.json({ task: updated, tasks: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { tasks } = await loadTasks();
    const next = tasks.filter((t) => t.id !== id);
    if (next.length === tasks.length) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const meta = await saveTasks(next, `Delete task ${id} (${user.email || user.userId})`);
    return NextResponse.json({ tasks: next, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
