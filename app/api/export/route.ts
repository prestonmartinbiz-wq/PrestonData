import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  loadCalls,
  loadLeads,
  loadPipeline,
  loadPower,
  loadSubstations,
  loadTasks,
  loadTeam,
} from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download a full backup of all CRM data as a single JSON file. Redundancy you
 * can keep offline — no external service required.
 */
export async function GET() {
  try {
    await requireUser();
    const [leads, calls, team, power, substations, tasks, pipeline] = await Promise.all([
      loadLeads(),
      loadCalls(),
      loadTeam(),
      loadPower(),
      loadSubstations(),
      loadTasks(),
      loadPipeline(),
    ]);

    const bundle = {
      app: "RMax CRM",
      exportedAt: new Date().toISOString(),
      leads: leads.leads,
      calls: calls.calls,
      team: team.team,
      power: power.power,
      substations: substations.substations,
      tasks: tasks.tasks,
      pipeline: pipeline.items,
    };

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="rmax-crm-backup-${stamp}.json"`,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
