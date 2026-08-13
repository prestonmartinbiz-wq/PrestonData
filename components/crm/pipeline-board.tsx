"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Upload, Zap } from "lucide-react";
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
  type PipelineStatus,
  type PipelineSubstation,
} from "@/lib/types";

type Tab = "tracked" | "interest" | "queue";

const STATUS_LABEL: Record<PipelineStatus, string> = {
  to_be_searched: "To be searched",
  awaiting_nve_response: "Awaiting NVE response",
  confirmed: "Confirmed",
};

const PRIORITY_RANK: Record<PipelinePriority, number> = { High: 0, Medium: 1, Low: 2 };

function priorityBadgeClass(p: PipelinePriority): string {
  if (p === "High") return "border-rose-200 bg-rose-50 text-rose-700";
  if (p === "Medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function labelBadgeClass(label: string): string {
  if (label === "Priority Target") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (label === "Good") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export function PipelineBoard({
  initialItems,
  currentUser,
}: {
  initialItems: PipelineSubstation[];
  currentUser?: string;
}) {
  const [items, setItems] = useState<PipelineSubstation[]>(initialItems);
  const [tab, setTab] = useState<Tab>("tracked");
  const [now] = useState(() => Date.now());
  const importRef = useRef<HTMLInputElement>(null);

  // Intake
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intake, setIntake] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    justification: "",
    priority: "Medium" as PipelinePriority,
  });
  const [savingIntake, setSavingIntake] = useState(false);

  // Claim
  const [claimItem, setClaimItem] = useState<PipelineSubstation | null>(null);
  const [claimEe, setClaimEe] = useState("");
  const [claimDate, setClaimDate] = useState("");

  // NVE response
  const [respItem, setRespItem] = useState<PipelineSubstation | null>(null);
  const [respText, setRespText] = useState("");
  const [respRaw, setRespRaw] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [review, setReview] = useState({
    mwAvailable: "",
    isdDate: "",
    longLeadItems: "",
    notes: "",
  });
  const [extra, setExtra] = useState<{
    feeders: { id: string; mva: number | null }[];
    trenchingFt: number | null;
    peakDemand: string;
  }>({ feeders: [], trenchingFt: null, peakDemand: "" });
  const respFileRef = useRef<HTMLInputElement>(null);

  const daysSince = (iso: string): number | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!t) return null;
    return Math.max(0, Math.floor((now - t) / 86400000));
  };

  const tracked = useMemo(
    () =>
      items
        .filter((i) => i.status === "confirmed")
        .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0)),
    [items]
  );
  const interest = useMemo(
    () =>
      items
        .filter((i) => i.status !== "confirmed")
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    [items]
  );
  const columns: { status: PipelineStatus; items: PipelineSubstation[] }[] = useMemo(
    () =>
      (["to_be_searched", "awaiting_nve_response", "confirmed"] as PipelineStatus[]).map(
        (status) => ({ status, items: items.filter((i) => i.status === status) })
      ),
    [items]
  );

  async function createIntake() {
    if (!intake.name.trim()) {
      toast.error("Substation name is required");
      return;
    }
    setSavingIntake(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...intake, submittedBy: currentUser }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setItems(data.items);
      setIntakeOpen(false);
      setIntake({ name: "", address: "", latitude: "", longitude: "", justification: "", priority: "Medium" });
      toast.success("Added to Substations of Interest");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingIntake(false);
    }
  }

  function openClaim(item: PipelineSubstation) {
    setClaimItem(item);
    setClaimEe(currentUser || "");
    setClaimDate(new Date().toISOString().slice(0, 10));
  }

  async function submitClaim() {
    if (!claimItem) return;
    if (!claimEe.trim() || !claimDate) {
      toast.error("Enter who claimed it and the date submitted to NVE");
      return;
    }
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: claimItem.id,
          patch: {
            status: "awaiting_nve_response",
            assignedEe: claimEe.trim(),
            dateStudySubmittedToNve: claimDate,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setItems(data.items);
      setClaimItem(null);
      toast.success("Moved to Awaiting NVE response");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  function openResponse(item: PipelineSubstation) {
    setRespItem(item);
    setRespText("");
    setRespRaw("");
    setReview({ mwAvailable: "", isdDate: "", longLeadItems: "", notes: "" });
    setExtra({ feeders: [], trenchingFt: null, peakDemand: "" });
  }

  function applyExtract(data: {
    fields: {
      mwAvailable: number | null;
      isdDate: string;
      longLeadItems: string[];
      notes: string;
      peakDemand?: string;
      feeders?: { id: string; mva: number | null }[];
      trenchingFt?: number | null;
    };
    raw: string;
  }) {
    setRespRaw(data.raw);
    setReview({
      mwAvailable: data.fields.mwAvailable !== null ? String(data.fields.mwAvailable) : "",
      isdDate: data.fields.isdDate || "",
      longLeadItems: (data.fields.longLeadItems || []).join("\n"),
      notes: data.fields.notes || "",
    });
    setExtra({
      feeders: data.fields.feeders || [],
      trenchingFt: data.fields.trenchingFt ?? null,
      peakDemand: data.fields.peakDemand || "",
    });
    toast.success("Pulled from email — review and confirm");
  }

  async function extractFromFile(file: File) {
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/pipeline/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      applyExtract(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function extractFromText() {
    if (!respText.trim()) {
      toast.error("Paste the NVE response text first");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/pipeline/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: respText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      applyExtract(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function confirmResponse() {
    if (!respItem) return;
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: respItem.id,
          patch: {
            status: "confirmed",
            mwAvailable: review.mwAvailable.trim() ? Number(review.mwAvailable) : null,
            isdDate: review.isdDate.trim(),
            longLeadItems: review.longLeadItems.split("\n").map((s) => s.trim()).filter(Boolean),
            notes: review.notes.trim(),
            peakDemand: extra.peakDemand,
            feeders: extra.feeders,
            trenchingFt: extra.trenchingFt,
            nveResponseRaw: respRaw || respText,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setItems(data.items);
      setRespItem(null);
      toast.success(`Confirmed — score ${data.item.compositeScore}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function onImport(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/pipeline/import", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Import failed");
      return;
    }
    setItems(data.items);
    toast.success(`Imported ${data.imported} substations`);
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "tracked", label: "Tracked", count: tracked.length },
    { id: "interest", label: "Substations of Interest", count: interest.length },
    { id: "queue", label: "EE Queue", count: items.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
            Substation Power Pipeline
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Power pipeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Interest → study submitted → NVE confirmed &amp; scored.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" onClick={() => setIntakeOpen(true)}>
            <Plus className="h-4 w-4" /> Add substation
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label} <span className="text-slate-400">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === "tracked" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Substation</th>
                  <th className="px-3 py-2 font-medium">MW avail</th>
                  <th className="px-3 py-2 font-medium">Feeders</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Rating</th>
                  <th className="px-3 py-2 font-medium">Long lead</th>
                  <th className="px-3 py-2 font-medium">ISD</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map((it, i) => {
                  const label = scoreLabel(it.compositeScore ?? 0);
                  return (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{it.name}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {it.mwAvailable !== null ? `${it.mwAvailable} MW` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {it.feeders && it.feeders.length ? (
                          <span title={it.feeders.map((f) => f.id + (f.mva !== null ? ` ${f.mva}MVA` : "")).join(", ")}>
                            {it.feeders.length} ·{" "}
                            {Math.round(
                              it.feeders.reduce((s, f) => s + (f.mva ?? 0), 0) * 100
                            ) / 100}{" "}
                            MVA
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">
                        {it.compositeScore ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={labelBadgeClass(label)}>{label}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        {it.longLeadPresent ? (
                          <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                            Long lead
                          </Badge>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{fmtDate(it.isdDate)}</td>
                    </tr>
                  );
                })}
                {!tracked.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                      No confirmed substations yet. Confirm an NVE response in the EE Queue.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "interest" ? (
        <div className="space-y-2">
          {interest.map((it) => {
            const days = daysSince(it.status === "to_be_searched" ? it.dateAdded : it.dateStudySubmittedToNve);
            return (
              <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{it.name}</span>
                      <Badge className={priorityBadgeClass(it.priority)}>{it.priority}</Badge>
                      <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                        {STATUS_LABEL[it.status]}
                      </Badge>
                    </div>
                    {it.address ? <p className="mt-0.5 text-xs text-slate-500">{it.address}</p> : null}
                    {it.justification ? (
                      <p className="mt-1 max-w-2xl text-sm text-slate-700">{it.justification}</p>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {days !== null ? <div>{days}d in status</div> : null}
                    {it.assignedEe ? <div>EE: {it.assignedEe}</div> : null}
                    <div className="mt-2 flex justify-end gap-2">
                      {it.status === "to_be_searched" ? (
                        <Button size="sm" variant="outline" onClick={() => openClaim(it)}>
                          Claim &amp; submit
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => openResponse(it)}>
                          Upload NVE response
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!interest.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Nothing in progress. Use “Add substation”.
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "queue" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {columns.map((col) => (
            <div key={col.status} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                {STATUS_LABEL[col.status]}
                <span className="text-slate-400">{col.items.length}</span>
              </h3>
              <div className="space-y-2">
                {col.items.map((it) => {
                  const days = daysSince(
                    it.status === "to_be_searched"
                      ? it.dateAdded
                      : it.status === "awaiting_nve_response"
                        ? it.dateStudySubmittedToNve
                        : it.dateResponseReceived
                  );
                  return (
                    <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{it.name}</span>
                        <Badge className={priorityBadgeClass(it.priority)}>{it.priority}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {days !== null ? `${days}d in status` : "—"}
                        {it.assignedEe ? ` · ${it.assignedEe}` : ""}
                      </div>
                      {it.status === "confirmed" ? (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <Zap className="h-3.5 w-3.5 text-amber-500" />
                          <span className="font-medium">Score {it.compositeScore}</span>
                          <span className="text-slate-500">
                            · {it.mwAvailable ?? "—"} MW · ISD {fmtDate(it.isdDate)}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2">
                          {it.status === "to_be_searched" ? (
                            <Button size="sm" variant="outline" onClick={() => openClaim(it)}>
                              Claim &amp; submit
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => openResponse(it)}>
                              Upload NVE response
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!col.items.length ? (
                  <p className="px-1 py-6 text-center text-xs text-slate-400">Empty</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Intake dialog */}
      <Dialog open={intakeOpen} onOpenChange={setIntakeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Flag a substation of interest</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="in-name">Substation name</Label>
              <Input id="in-name" value={intake.name} onChange={(e) => setIntake({ ...intake, name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="in-addr">Address</Label>
              <Input id="in-addr" value={intake.address} onChange={(e) => setIntake({ ...intake, address: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="in-lat">Latitude</Label>
              <Input id="in-lat" value={intake.latitude} onChange={(e) => setIntake({ ...intake, latitude: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="in-lng">Longitude</Label>
              <Input id="in-lng" value={intake.longitude} onChange={(e) => setIntake({ ...intake, longitude: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="in-just">Justification (why study this?)</Label>
              <Textarea id="in-just" rows={3} value={intake.justification} onChange={(e) => setIntake({ ...intake, justification: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Priority</Label>
              <Select value={intake.priority} onValueChange={(v) => setIntake({ ...intake, priority: v as PipelinePriority })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setIntakeOpen(false)}>Cancel</Button>
            <Button onClick={createIntake} disabled={savingIntake}>
              {savingIntake ? "Saving…" : "Add to pipeline"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Claim dialog */}
      <Dialog open={Boolean(claimItem)} onOpenChange={(o) => !o && setClaimItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Claim &amp; submit to NVE</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">{claimItem?.name}</p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="claim-ee">Assigned EE</Label>
              <Input id="claim-ee" value={claimEe} onChange={(e) => setClaimEe(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="claim-date">Date study submitted to NVE</Label>
              <Input id="claim-date" type="date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setClaimItem(null)}>Cancel</Button>
            <Button onClick={submitClaim}>Move to Awaiting NVE</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* NVE response upload + review dialog */}
      <Dialog open={Boolean(respItem)} onOpenChange={(o) => !o && setRespItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>NVE response · {respItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Drag in the .eml (or a .txt), or paste the response text. Fields are pulled
              automatically — no AI/API. Review and edit before confirming (nothing is
              scored until you confirm).
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDropping(true);
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropping(false);
                const f = e.dataTransfer.files?.[0];
                if (f) extractFromFile(f);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-5 text-center text-xs ${
                dropping ? "border-slate-900 bg-slate-50" : "border-slate-300"
              }`}
            >
              <Upload className="mb-1 h-4 w-4 text-slate-400" />
              {extracting ? (
                <span className="text-slate-600">Reading…</span>
              ) : (
                <span className="text-slate-500">
                  Drag &amp; drop the NVE .eml / .txt here, or{" "}
                  <button
                    type="button"
                    className="font-medium text-slate-900 underline"
                    onClick={() => respFileRef.current?.click()}
                  >
                    choose a file
                  </button>
                </span>
              )}
              <input
                ref={respFileRef}
                type="file"
                accept=".eml,message/rfc822,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) extractFromFile(f);
                  e.target.value = "";
                }}
                disabled={extracting}
              />
            </div>
            <Textarea
              rows={4}
              placeholder="…or paste the NVE response email text here"
              value={respText}
              onChange={(e) => setRespText(e.target.value)}
            />
            <Button variant="secondary" size="sm" onClick={extractFromText} disabled={extracting}>
              {extracting ? "Reading…" : "Pull from pasted text"}
            </Button>

            {extra.feeders.length || extra.trenchingFt !== null || extra.peakDemand ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-700">Pulled from email</div>
                {extra.peakDemand ? <div className="mt-1">Peak demand: {extra.peakDemand}</div> : null}
                {extra.feeders.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {extra.feeders.map((f) => (
                      <Badge key={f.id} className="border-amber-200 bg-amber-50 text-amber-800">
                        {f.id}
                        {f.mva !== null ? ` · ${f.mva} MVA` : ""}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {extra.trenchingFt !== null ? (
                  <div className="mt-1">Trenching: {extra.trenchingFt.toLocaleString()} ft</div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div>
                <Label htmlFor="rev-mw">MW available</Label>
                <Input id="rev-mw" value={review.mwAvailable} onChange={(e) => setReview({ ...review, mwAvailable: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="rev-isd">ISD date</Label>
                <Input id="rev-isd" type="date" value={review.isdDate} onChange={(e) => setReview({ ...review, isdDate: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="rev-ll">Long-lead items (one per line)</Label>
                <Textarea id="rev-ll" rows={3} value={review.longLeadItems} onChange={(e) => setReview({ ...review, longLeadItems: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="rev-notes">Notes</Label>
                <Textarea id="rev-notes" rows={2} value={review.notes} onChange={(e) => setReview({ ...review, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setRespItem(null)}>Cancel</Button>
            <Button onClick={confirmResponse}>Confirm &amp; score</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
