import { promises as fs } from "fs";
import path from "path";
import { hasGitHubToken, readGitHubFile, writeGitHubFile } from "@/lib/github";
import { leadsToCsv, parseLeadsCsv } from "@/lib/csv";
import type { Lead, SaveMeta, TeamData } from "@/lib/types";

const LEADS_PATH = "data/leads.csv";
const TEAM_PATH = "data/team.json";

function localPath(rel: string) {
  // Scope to data/ so Turbopack does not trace the whole project
  const base = path.join(process.cwd(), "data");
  const name = path.basename(rel);
  return path.join(base, name);
}

async function readLocal(rel: string): Promise<{ content: string; meta: SaveMeta }> {
  const content = await fs.readFile(localPath(rel), "utf-8");
  const stat = await fs.stat(localPath(rel));
  return {
    content,
    meta: {
      source: "local",
      path: rel,
      lastSavedAt: stat.mtime.toISOString(),
    },
  };
}

async function writeLocal(rel: string, content: string): Promise<SaveMeta> {
  await fs.mkdir(path.dirname(localPath(rel)), { recursive: true });
  await fs.writeFile(localPath(rel), content, "utf-8");
  return {
    source: "local",
    path: rel,
    lastSavedAt: new Date().toISOString(),
  };
}

export async function loadLeads(): Promise<{ leads: Lead[]; meta: SaveMeta }> {
  if (hasGitHubToken()) {
    try {
      const { content, meta } = await readGitHubFile(LEADS_PATH);
      return { leads: parseLeadsCsv(content), meta };
    } catch (err) {
      console.warn("GitHub leads read failed, falling back to local", err);
    }
  }
  const { content, meta } = await readLocal(LEADS_PATH);
  return { leads: parseLeadsCsv(content), meta };
}

export async function saveLeads(
  leads: Lead[],
  message = "Update leads.csv via RMax CRM"
): Promise<SaveMeta> {
  const csv = leadsToCsv(leads);
  if (hasGitHubToken()) {
    return writeGitHubFile(LEADS_PATH, csv, message);
  }
  return writeLocal(LEADS_PATH, csv);
}

export async function loadTeam(): Promise<{ team: TeamData; meta: SaveMeta }> {
  if (hasGitHubToken()) {
    try {
      const { content, meta } = await readGitHubFile(TEAM_PATH);
      return { team: JSON.parse(content) as TeamData, meta };
    } catch (err) {
      console.warn("GitHub team read failed, falling back to local", err);
    }
  }
  const { content, meta } = await readLocal(TEAM_PATH);
  return { team: JSON.parse(content) as TeamData, meta };
}

export async function saveTeam(
  team: TeamData,
  message = "Update team.json via RMax CRM"
): Promise<SaveMeta> {
  const json = JSON.stringify(team, null, 2) + "\n";
  if (hasGitHubToken()) {
    return writeGitHubFile(TEAM_PATH, json, message);
  }
  return writeLocal(TEAM_PATH, json);
}
