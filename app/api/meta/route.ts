import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { hasGitHubToken } from "@/lib/github";
import { loadLeads, loadTeam } from "@/lib/data-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const [leadsRes, teamRes] = await Promise.all([loadLeads(), loadTeam()]);
    return NextResponse.json({
      githubEnabled: hasGitHubToken(),
      leadsMeta: leadsRes.meta,
      teamMeta: teamRes.meta,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
