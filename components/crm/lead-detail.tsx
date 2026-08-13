"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Bell, Pencil, Phone, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LeadForm } from "@/components/crm/lead-form";
import { LogCallForm } from "@/components/crm/log-call-form";
import { PropertyLinks } from "@/components/crm/property-links";
import { GoogleMapEmbed } from "@/components/crm/google-map-embed";
import { ALLOWED_AUDIO_EXTENSIONS } from "@/lib/types";
import type { CallRecord, Lead, Task, TeamMember } from "@/lib/types";
import { getPhones } from "@/lib/phones";
import { needsContact } from "@/lib/utils";
import { parseLeadMeta } from "@/lib/substation";

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`mt-0.5 text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value && value.trim() ? value : <span className="text-slate-400">—</span>}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function reminderPresets(): { label: string; iso: string }[] {
  const now = new Date();
  const mk = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(now.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);
  return [
    { label: "In 1 hour", iso: mk(60 * 60 * 1000) },
    { label: "In 3 hours", iso: mk(3 * 60 * 60 * 1000) },
    { label: "Tomorrow 9am", iso: tomorrow9.toISOString() },
    { label: "In 3 days", iso: mk(3 * 24 * 60 * 60 * 1000) },
    { label: "Next week", iso: nextWeek.toISOString() },
  ];
}

export function LeadDetail({
  lead: initialLead,
  initialCalls,
  team,
  currentUserEmail,
  currentUserName,
  initialTasks,
  backHref = "/dashboard",
}: {
  lead: Lead;
  initialCalls: CallRecord[];
  team: TeamMember[];
  currentUserEmail?: string;
  currentUserName?: string;
  initialTasks: Task[];
  backHref?: string;
}) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead>(initialLead);
  const [draft, setDraft] = useState<Lead>(initialLead);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [calls, setCalls] = useState<CallRecord[]>(initialCalls);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [remindOpen, setRemindOpen] = useState(false);
  const [customDue, setCustomDue] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [dropping, setDropping] = useState(false);
  const [busyDrop, setBusyDrop] = useState(false);
  const [now] = useState(() => Date.now());
  const dropRef = useRef<HTMLDivElement>(null);

  const phones = getPhones(lead);
  const meta = parseLeadMeta(lead.notes);
  const openReminders = useMemo(
    () => tasks.filter((t) => t.status === "open").sort((a, b) => (Date.parse(a.dueAt) || 0) - (Date.parse(b.dueAt) || 0)),
    [tasks]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const fresh = (data.leads as Lead[]).find((l) => l.apn === draft.apn) || draft;
      setLead(fresh);
      setDraft(fresh);
      setMode("view");
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete lead " + lead.apn + "?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leads?apn=" + encodeURIComponent(lead.apn), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Lead deleted");
      router.push(backHref);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  }

  async function skipTrace() {
    setSaving(true);
    try {
      const updated = { ...lead, needsSkipTrace: `requested ${new Date().toISOString().slice(0, 10)}` };
      const res = await fetch("/api/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: updated }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Skip trace failed");
      const fresh = (data.leads as Lead[]).find((l) => l.apn === updated.apn) || updated;
      setLead(fresh);
      setDraft(fresh);
      toast.success("Skip trace requested — contacts will be pulled from ZoomInfo (integration pending)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skip trace failed");
    } finally {
      setSaving(false);
    }
  }

  async function createReminder(dueIso: string) {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apn: lead.apn,
          propertyAddress: lead.propertyAddress,
          title: `Call ${lead.ownerEntity || lead.decisionMaker || lead.apn}`,
          note: reminderNote,
          dueAt: dueIso,
          assignedTo: currentUserEmail || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not set reminder");
      setTasks((t) => [data.task, ...t]);
      setRemindOpen(false);
      setReminderNote("");
      setCustomDue("");
      toast.success(`Reminder set for ${formatWhen(dueIso)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not set reminder");
    }
  }

  async function completeReminder(id: string) {
    try {
      const res = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch: { status: "done" } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTasks((t) => t.map((x) => (x.id === id ? data.task : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDroppedFile(file: File) {
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const isAudio = (ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
    const isText = ext === ".txt";
    if (!isAudio && !isText) {
      toast.error("Drop an audio recording or a .txt transcript");
      return;
    }
    setBusyDrop(true);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call: {
            apn: lead.apn,
            outcome: "connected",
            calledAt: new Date().toISOString(),
            caller: currentUserName || currentUserEmail || "",
            source: "drop",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create call");
      const callId: string = data.call.callId;
      let finalCalls: CallRecord[] = data.calls;

      if (isAudio) {
        const form = new FormData();
        form.append("file", file);
        const up = await fetch(`/api/calls/${encodeURIComponent(callId)}/audio`, {
          method: "POST",
          body: form,
        });
        const upData = await up.json();
        if (up.ok) finalCalls = upData.calls;
      } else {
        const text = await file.text();
        const up = await fetch(`/api/calls/${encodeURIComponent(callId)}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        });
        const upData = await up.json();
        if (up.ok) finalCalls = upData.calls;
      }
      setCalls(finalCalls.filter((c) => c.apn === lead.apn));
      if (data.leads) {
        const fresh = (data.leads as Lead[]).find((l) => l.apn === lead.apn);
        if (fresh) setLead(fresh);
      }
      toast.success("Recording added to the call log");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add recording");
    } finally {
      setBusyDrop(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
            {lead.propertyAddress || lead.ownerEntity || lead.apn}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-mono text-xs">{lead.apn}</span>
            <Badge>{lead.status || "New"}</Badge>
            {meta.substation ? (
              <span className="text-slate-400">· Substation: {meta.substation}</span>
            ) : null}
            {lead.needsSkipTrace ? (
              <Badge className="border-violet-200 bg-violet-50 text-violet-700">
                Skip trace: {lead.needsSkipTrace}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "view" ? (
            <>
              <Button size="sm" onClick={() => { setDraft(lead); setMode("edit"); }}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRemindOpen(true)}>
                <Bell className="h-4 w-4" /> Remind me to call
              </Button>
              {needsContact(lead) ? (
                <Button size="sm" variant="outline" onClick={skipTrace} disabled={saving}>
                  <Search className="h-4 w-4" /> Skip trace
                </Button>
              ) : null}
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => { setDraft(lead); setMode("view"); }}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {mode === "edit" ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <LeadForm
                mode="edit"
                lead={draft}
                team={team}
                currentUserEmail={currentUserEmail}
                onChange={setDraft}
                onSubmit={save}
                onDelete={remove}
                saving={saving}
              />
            </div>
          ) : (
            <>
              <Card title="Owner & contact">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Owner entity" value={lead.ownerEntity} />
                  <Field label="Decision maker" value={lead.decisionMaker} />
                  <Field label="Title" value={lead.title} />
                  <Field label="Email" value={lead.email} />
                  <div className="col-span-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Phone numbers
                      </p>
                      <button
                        className="text-xs font-medium text-slate-600 underline"
                        onClick={() => { setDraft(lead); setMode("edit"); }}
                      >
                        + Add / edit
                      </button>
                    </div>
                    {phones.length ? (
                      <ul className="mt-1 space-y-1">
                        {phones.map((p, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-slate-900">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            <a href={`tel:${p.replace(/[^0-9+]/g, "")}`} className="hover:underline">
                              {p}
                            </a>
                            {i === 0 ? (
                              <span className="text-[11px] text-slate-400">primary</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-amber-700">
                        No phone numbers. Use Edit to add one, or Skip trace to pull from
                        ZoomInfo.
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <Field label="Mailing / RA address" value={lead.mailingAddress} />
                  </div>
                </div>
              </Card>

              <Card title="Property">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="APN" value={lead.apn} mono />
                  <Field label="Address" value={lead.propertyAddress} />
                  <Field label="Type" value={meta.type} />
                  <Field label="Acres" value={meta.acres !== null ? String(meta.acres) : ""} />
                  <Field label="Confidence" value={lead.confidence} />
                  <Field label="Assigned to" value={lead.assignedTo || "Unassigned"} />
                  <div className="col-span-2">
                    <PropertyLinks
                      apn={lead.apn}
                      propertyAddress={lead.propertyAddress}
                      lat={lead.latitude}
                      lng={lead.longitude}
                    />
                  </div>
                  <div className="col-span-2">
                    <GoogleMapEmbed
                      lat={Number.isFinite(Number(lead.latitude)) && Number(lead.latitude) !== 0 ? Number(lead.latitude) : undefined}
                      lng={Number.isFinite(Number(lead.longitude)) && Number(lead.longitude) !== 0 ? Number(lead.longitude) : undefined}
                      query={lead.propertyAddress}
                      zoom={17}
                      height={260}
                      label={`${lead.apn} map`}
                    />
                  </div>
                </div>
              </Card>

              {lead.notes ? (
                <Card title="Notes">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</p>
                </Card>
              ) : null}
              {lead.sources ? (
                <Card title="Sources">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{lead.sources}</p>
                </Card>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Reminders">
            {openReminders.length ? (
              <ul className="space-y-2">
                {openReminders.map((t) => {
                  const overdue = (Date.parse(t.dueAt) || 0) < now;
                  return (
                    <li
                      key={t.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <div>
                        <div className={overdue ? "font-medium text-rose-700" : "font-medium text-slate-800"}>
                          {formatWhen(t.dueAt)} {overdue ? "· overdue" : ""}
                        </div>
                        {t.note ? <div className="mt-0.5 text-slate-500">{t.note}</div> : null}
                      </div>
                      <button
                        className="text-slate-500 underline"
                        onClick={() => completeReminder(t.id)}
                      >
                        Done
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No reminders. Use “Remind me to call”.</p>
            )}
          </Card>

          <Card title="Call log">
            <div
              ref={dropRef}
              onDragOver={(e) => {
                e.preventDefault();
                setDropping(true);
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropping(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleDroppedFile(f);
              }}
              className={`mb-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-5 text-center text-xs ${
                dropping ? "border-slate-900 bg-slate-50" : "border-slate-300"
              }`}
            >
              <Upload className="mb-1 h-4 w-4 text-slate-400" />
              {busyDrop ? (
                <span className="text-slate-600">Saving recording…</span>
              ) : (
                <span className="text-slate-500">
                  Drag a call recording (mp3/mp4/wav…) or a .txt transcript here to add it
                  to the log
                </span>
              )}
            </div>
            <LogCallForm
              lead={lead}
              currentUserEmail={currentUserEmail}
              currentUserName={currentUserName}
              recentCalls={calls}
              onLogged={({ calls: nextCalls, leads: nextLeads }) => {
                setCalls(nextCalls.filter((c) => c.apn === lead.apn));
                if (nextLeads?.length) {
                  const fresh = nextLeads.find((l) => l.apn === lead.apn);
                  if (fresh) setLead(fresh);
                }
              }}
            />
          </Card>
        </div>
      </div>

      <Dialog open={remindOpen} onOpenChange={setRemindOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remind me to call</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Adds a task to your list. You&apos;ll see it (and overdue ones) under Tasks.
            </p>
            <div>
              <Label htmlFor="reminder-note">Note (optional)</Label>
              <Input
                id="reminder-note"
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                placeholder="e.g. Follow up on offer"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {reminderPresets().map((p) => (
                <Button key={p.label} variant="outline" size="sm" onClick={() => createReminder(p.iso)}>
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="flex items-end gap-2 border-t border-slate-100 pt-3">
              <div className="flex-1">
                <Label htmlFor="reminder-custom">Custom date/time</Label>
                <Input
                  id="reminder-custom"
                  type="datetime-local"
                  value={customDue}
                  onChange={(e) => setCustomDue(e.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  const d = new Date(customDue);
                  if (Number.isNaN(d.getTime())) {
                    toast.error("Pick a valid date/time");
                    return;
                  }
                  createReminder(d.toISOString());
                }}
              >
                Set
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
