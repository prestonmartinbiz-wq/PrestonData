import { promises as fs } from "fs";
import path from "path";
import {
  applyOutcomeToStatus,
  applyRollupsToLead,
  computeCallRollups,
  newCallId,
} from "@/lib/calls";
import { callsToCsv, leadsToCsv, parseCallsCsv, parseLeadsCsv } from "@/lib/csv";
import { hasGitHubToken, readGitHubFile, writeGitHubFile } from "@/lib/github";
import type { CallRecord, Lead, SaveMeta, TeamData } from "@/lib/types";
import { normalizeApn } from "@/lib/utils";

const LEADS_PATH = "data/leads.csv";
const CALLS_PATH = "data/calls.csv";
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

async function readText(rel: string): Promise<{ content: string; meta: SaveMeta }> {
  if (hasGitHubToken()) {
    try {
      return await readGitHubFile(rel);
    } catch (err) {
      console.warn(`GitHub read failed for ${rel}, falling back to local`, err);
    }
  }
  try {
    return await readLocal(rel);
  } catch (err) {
    if (rel === CALLS_PATH) {
      return {
        content: callsToCsv([]),
        meta: { source: "local", path: rel },
      };
    }
    throw err;
  }
}

export async function loadLeads(): Promise<{ leads: Lead[]; meta: SaveMeta }> {
  const { content, meta } = await readText(LEADS_PATH);
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

export async function loadCalls(): Promise<{ calls: CallRecord[]; meta: SaveMeta }> {
  const { content, meta } = await readText(CALLS_PATH);
  return { calls: parseCallsCsv(content), meta };
}

export async function saveCalls(
  calls: CallRecord[],
  message = "Update calls.csv via RMax CRM"
): Promise<SaveMeta> {
  const csv = callsToCsv(calls);
  if (hasGitHubToken()) {
    return writeGitHubFile(CALLS_PATH, csv, message);
  }
  return writeLocal(CALLS_PATH, csv);
}

export type AppendCallInput = {
  apn: string;
  caller?: string;
  contactName?: string;
  phoneUsed?: string;
  calledAt?: string;
  outcome: string;
  callbackAt?: string;
  notes?: string;
  durationSec?: string | number;
  source?: string;
  callId?: string;
};

/**
 * Append-only call log write. Never edits/deletes prior rows.
 * Recomputes lead rollups for the APN from the full history and may
 * bump lead status based on outcome (without wiping richer statuses).
 */
export async function appendCall(input: AppendCallInput): Promise<{
  call: CallRecord;
  calls: CallRecord[];
  leads: Lead[];
  callsMeta: SaveMeta;
  leadsMeta: SaveMeta;
}> {
  const key = normalizeApn(input.apn);
  if (!key) throw new Error("APN is required");
  if (!(input.outcome || "").trim()) throw new Error("outcome is required");

  const [{ calls }, { leads }] = await Promise.all([loadCalls(), loadLeads()]);
  const leadIdx = leads.findIndex((l) => normalizeApn(l.apn) === key);
  if (leadIdx === -1) throw new Error("Lead not found for APN");

  const call: CallRecord = {
    callId: (input.callId || "").trim() || newCallId(),
    apn: key,
    caller: (input.caller || "").trim(),
    contactName: (input.contactName || "").trim(),
    phoneUsed: (input.phoneUsed || "").trim(),
    calledAt: (input.calledAt || "").trim() || new Date().toISOString(),
    outcome: (input.outcome || "").trim(),
    callbackAt: (input.callbackAt || "").trim(),
    notes: (input.notes || "").trim(),
    durationSec:
      input.durationSec === undefined || input.durationSec === null
        ? ""
        : String(input.durationSec).trim(),
    source: (input.source || "").trim() || "crm_ui",
  };

  if (calls.some((c) => c.callId === call.callId)) {
    throw new Error("callId already exists");
  }

  const nextCalls = [...calls, call];
  const rollups = computeCallRollups(nextCalls, key);
  const prev = leads[leadIdx];
  const nextLead: Lead = applyRollupsToLead(
    {
      ...prev,
      status: applyOutcomeToStatus(prev.status, call.outcome),
    },
    nextCalls
  );
  // ensure rollups from this write win
  Object.assign(nextLead, rollups, { needsSkipTrace: prev.needsSkipTrace || "" });

  const nextLeads = [...leads];
  nextLeads[leadIdx] = nextLead;

  const who = call.caller || "crm";
  const [callsMeta, leadsMeta] = await Promise.all([
    saveCalls(nextCalls, `Log call ${call.callId} for ${key} (${who})`),
    saveLeads(nextLeads, `Update call rollups for ${key} (${who})`),
  ]);

  return { call, calls: nextCalls, leads: nextLeads, callsMeta, leadsMeta };
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
