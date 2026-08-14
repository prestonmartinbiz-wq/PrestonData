"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scoreLabel } from "@/lib/scoring";
import {
  PIPELINE_PRIORITIES,
  type PipelinePriority,
  type PipelineResponse,
  type PipelineStatus,
  type PipelineSubstation,
} from "@/lib/types";

const STATUS_OPTIONS: { value: PipelineStatus; label: string }[] = [
  { value: "to_be_searched", label: "To be searched" },
  { value: "awaiting_nve_response", label: "Awaiting NVE response" },
  { value: "confirmed", label: "Confirmed" },
];

const STATUS_LABEL: Record<PipelineStatus, string> = {
  to_be_searched: "To be searched",
  awaiting_nve_response: "Awaiting NVE response",
  confirmed: "Confirmed",
};

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/** Small read-only label/value pair. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

function ResponseBlock({ r }: { r: PipelineResponse }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">
            {r.subject || r.sourceFile || "NVE response"}
          </p>
          <p className="text-xs text-slate-500">
            {[r.from, r.date].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {r.mwAvailable !== null ? <span>MW: {r.mwAvailable}</span> : null}
        {r.isdDate ? <span>ISD: {fmtDate(r.isdDate)}</span> : null}
        {r.trenchingFt !== null ? <span>Trenching: {r.trenchingFt.toLocaleString()} ft</span> : null}
        {r.peakDemand ? <span>Peak: {r.peakDemand}</span> : null}
      </div>
      {r.feeders.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.feeders.map((f) => (
            <Badge key={f.id} className="border-amber-200 bg-amber-50 text-amber-800">
              {f.id}
              {f.mva !== null ? ` · ${f.mva} MVA` : ""}
            </Badge>
          ))}
        </div>
      ) : null}
      {r.images.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {r.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="NVE feeder diagram"
                className="h-28 w-full rounded-lg border border-slate-200 object-cover"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      ) : null}
      {r.text ? (
        <div className="mt-2">
          <button className="text-xs text-slate-500 underline" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide email text" : "Show email text"}
          </button>
          {open ? (
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              {r.text}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PipelineDetail({
  item,
  currentUser,
  onClose,
  onUpdated,
  onDeleted,
}: {
  item: PipelineSubstation;
  currentUser?: string;
  onClose: () => void;
  onUpdated: (items: PipelineSubstation[]) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: item.name,
    status: item.status,
    priority: item.priority,
    mwAvailable: item.mwAvailable !== null ? String(item.mwAvailable) : "",
    isdDate: item.isdDate,
    peakDemand: item.peakDemand,
    notes: item.notes,
    justification: item.justification,
  });
  const [saving, setSaving] = useState(false);
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);
  const [responses, setResponses] = useState<PipelineResponse[]>(item.responses || []);
  const images = item.images || [];

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          patch: {
            name: draft.name.trim(),
            status: draft.status,
            priority: draft.priority,
            mwAvailable: draft.mwAvailable.trim() ? Number(draft.mwAvailable) : null,
            isdDate: draft.isdDate.trim(),
            peakDemand: draft.peakDemand.trim(),
            notes: draft.notes.trim(),
            justification: draft.justification.trim(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onUpdated(data.items);
      toast.success("Saved");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${item.name}" from the pipeline?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pipeline?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted(item.id);
      toast.success("Deleted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function addPull() {
    if (!addText.trim()) {
      toast.error("Paste the NVE response text first");
      return;
    }
    setAdding(true);
    try {
      const exRes = await fetch("/api/pipeline/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: addText }),
      });
      const ex = await exRes.json();
      if (!exRes.ok) throw new Error(ex.error || "Could not parse text");
      const f = ex.fields;
      const newResp: PipelineResponse = {
        id: crypto.randomUUID(),
        subject: "Pasted NVE response",
        date: new Date().toISOString(),
        from: currentUser || "",
        text: addText.slice(0, 8000),
        mwAvailable: f.mwAvailable,
        peakDemand: f.peakDemand,
        isdDate: f.isdDate,
        feeders: f.feeders || [],
        trenchingFt: f.trenchingFt ?? null,
        longLeadItems: f.longLeadItems || [],
        images: [],
        sourceFile: "",
      };
      const nextResponses = [...responses, newResp];
      const putRes = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, patch: { responses: nextResponses } }),
      });
      const put = await putRes.json();
      if (!putRes.ok) throw new Error(put.error || "Save failed");
      setResponses(nextResponses);
      setAddText("");
      onUpdated(put.items);
      toast.success("Added NVE pull");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAdding(false);
    }
  }

  const score = item.compositeScore;
  const isSite = item.kind === "site";
  const totalMva = (item.feeders || []).reduce((s, f) => s + (f.mva ?? 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent variant="center" className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {item.name}
              {isSite ? (
                <Badge className="border-sky-200 bg-sky-50 text-sky-700">Site</Badge>
              ) : null}
              <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                {STATUS_LABEL[item.status]}
              </Badge>
              {item.status === "confirmed" && score !== null ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Score {score} · {scoreLabel(score)}
                </Badge>
              ) : null}
            </DialogTitle>
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {editing ? (
            /* ---------------- Edit mode ---------------- */
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="pd-name">Substation name</Label>
                <Input id="pd-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as PipelineStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as PipelinePriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pd-mw">MW available</Label>
                <Input id="pd-mw" value={draft.mwAvailable} onChange={(e) => setDraft({ ...draft, mwAvailable: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pd-isd">ISD date</Label>
                <Input id="pd-isd" type="date" value={draft.isdDate} onChange={(e) => setDraft({ ...draft, isdDate: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="pd-peak">Peak demand</Label>
                <Input id="pd-peak" value={draft.peakDemand} onChange={(e) => setDraft({ ...draft, peakDemand: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="pd-just">Justification</Label>
                <Textarea id="pd-just" rows={2} value={draft.justification} onChange={(e) => setDraft({ ...draft, justification: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="pd-notes">Notes</Label>
                <Textarea id="pd-notes" rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </div>
              <div className="col-span-2 flex items-center justify-between border-t border-slate-100 pt-3">
                <Button variant="destructive" onClick={remove} disabled={saving}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDraft({
                        name: item.name,
                        status: item.status,
                        priority: item.priority,
                        mwAvailable: item.mwAvailable !== null ? String(item.mwAvailable) : "",
                        isdDate: item.isdDate,
                        peakDemand: item.peakDemand,
                        notes: item.notes,
                        justification: item.justification,
                      });
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
                </div>
              </div>
            </div>
          ) : (
            /* ---------------- Read-only view ---------------- */
            <div className="space-y-4">
              {isSite ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-slate-600">
                  {item.apn ? <span>APN: {item.apn}</span> : null}
                  {item.mwRequested != null ? <span>MW requested: {item.mwRequested}</span> : null}
                  {item.expectedSubstation ? <span>Expected: {item.expectedSubstation}</span> : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Field label="MW available">{item.mwAvailable ?? "—"}</Field>
                <Field label="ISD">{item.isdDate ? fmtDate(item.isdDate) : "—"}</Field>
                <Field label="Priority">{item.priority}</Field>
                <Field label="Long lead">
                  {item.longLeadPresent ? (
                    <Badge className="border-rose-200 bg-rose-50 text-rose-700">Long lead</Badge>
                  ) : (
                    "None"
                  )}
                </Field>
                <Field label="Peak demand">{item.peakDemand || "—"}</Field>
                <Field label="Trenching">
                  {item.trenchingFt != null ? `${item.trenchingFt.toLocaleString()} ft` : "—"}
                </Field>
                <Field label="NVE pulls">{(item.responses || []).length}</Field>
                <Field label="Composite score">{item.compositeScore ?? "—"}</Field>
                {item.address ? <Field label="Address">{item.address}</Field> : null}
                {item.assignedEe ? <Field label="Assigned EE">{item.assignedEe}</Field> : null}
                {item.submittedBy ? <Field label="Submitted by">{item.submittedBy}</Field> : null}
                {item.dateAdded ? <Field label="Date added">{fmtDate(item.dateAdded)}</Field> : null}
                {item.dateStudySubmittedToNve ? (
                  <Field label="Study submitted">{fmtDate(item.dateStudySubmittedToNve)}</Field>
                ) : null}
                {item.dateResponseReceived ? (
                  <Field label="Response received">{fmtDate(item.dateResponseReceived)}</Field>
                ) : null}
              </div>

              {item.feeders && item.feeders.length ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">
                    Feeders{totalMva ? ` · ${Math.round(totalMva * 100) / 100} MVA` : ""}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.feeders.map((f) => (
                      <Badge key={f.id} className="border-amber-200 bg-amber-50 text-amber-800">
                        {f.id}
                        {f.mva !== null ? ` · ${f.mva} MVA` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {item.justification ? (
                <Field label="Justification">
                  <p className="whitespace-pre-wrap">{item.justification}</p>
                </Field>
              ) : null}
              {item.notes ? (
                <Field label="Notes">
                  <p className="whitespace-pre-wrap">{item.notes}</p>
                </Field>
              ) : null}
            </div>
          )}

          {/* Responses / pulls (always visible, read-only) */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Zap className="h-4 w-4 text-amber-500" /> NVE pulls ({responses.length})
              {images.length ? <span className="text-xs font-normal text-slate-400">· {images.length} diagram(s)</span> : null}
            </h3>
            {responses.length ? (
              <div className="space-y-2">
                {responses.map((r) => <ResponseBlock key={r.id} r={r} />)}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No NVE pulls captured yet.</p>
            )}
          </div>

          {/* Add data (only while editing, to keep the default view clean) */}
          {editing ? (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <Label htmlFor="pd-add">Add another NVE pull (paste text)</Label>
              <Textarea id="pd-add" rows={3} value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="Paste an NVE response email…" />
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={addPull} disabled={adding}>
                  <Plus className="h-4 w-4" /> {adding ? "Adding…" : "Pull & add"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
