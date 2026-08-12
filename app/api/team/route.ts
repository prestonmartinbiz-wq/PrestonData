import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadTeam, saveTeam } from "@/lib/data-store";
import type { TeamData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const { team, meta } = await loadTeam();
    return NextResponse.json({ team, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { team?: TeamData };
    if (!body.team?.members || !Array.isArray(body.team.members)) {
      return NextResponse.json({ error: "team.members required" }, { status: 400 });
    }

    const cleaned: TeamData = {
      members: body.team.members
        .map((m) => ({
          name: (m.name || "").trim(),
          email: (m.email || "").trim().toLowerCase(),
        }))
        .filter((m) => m.name),
    };

    const meta = await saveTeam(
      cleaned,
      `Update team (${user.email || user.userId})`
    );
    return NextResponse.json({ team: cleaned, meta });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return NextResponse.json({ error: "Failed to save team" }, { status: 500 });
  }
}
