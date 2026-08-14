"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, MapPin, Plus, Trash2, Upload, Zap } from "lucide-react";
import { PipelineDetail } from "@/components/crm/pipeline-detail";
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

type Tab = "tracked" | "interest" | "sites" | "queue";

/** Treat legacy records with no kind as substations. */
function kindOf(i: PipelineSubstation): "substation" | "site" {
  return i.kind === "site" ? "site" : "substation";
}

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
  const [detailItem, setDetailItem] = useState<PipelineSubstation | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function deleteItem(id: string) {
    if (!confirm("Delete this entry from the pipeline?")) return;
    try {
      const res = await fetch(`/api/pipeline?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setItems(data.items);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

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

  // Upload Power Availability Request
  const [preqOpen, setPreqOpen] = useState(false);
  const [preqMode, setPreqMode] = useState<"existing" | "new">("existing");
  const [preqExistingId, setPreqExistingId] = useState("");
  const [preqNewName, setPreqNewName] = useState("");
  const [preqFile, setPreqFile] = useState<File | null>(null);
  const [preqText, setPreqText] = useState("");
  const [preqPreview, setPreqPreview] = useState<{
    mwAvailable: number | null;
    isdDate: string;
    feeders: { id: string; mva: number | null }[];
    peakDemand: string;
  } | null>(null);
  const [preqDropping, setPreqDropping] = useState(false);
  const [preqSaving, setPreqSaving] = useState(false);
  const preqFileRef = useRef<HTMLInputElement>(null);

  // Add site
  const [siteOpen, setSiteOpen] = useState(false);
  const [site, setSite] = useState({
    apn: "",
    address: "",
    isdDate: "",
    mwRequested: "",
    expectedSubstation: "",
    priority: "Medium" as PipelinePriority,
  });
  const [savingSite, setSavingSite] = useState(false);

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
        .filter((i) => i.status !== "confirmed" && kindOf(i) === "substation")
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    [items]
  );
  const sites = useMemo(
    () =>
      items
        .filter((i) => i.status !== "confirmed" && kindOf(i) === "site")
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    [items]
  );
  const substationNames = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .filter((i) => kindOf(i) === "substation")
            .map((i) => i.name.trim())
            .filter(Boolean)
        )
      ).sort(),
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

  function resetPreq() {
    setPreqMode("existing");
    setPreqExistingId("");
    setPreqNewName("");
    setPreqFile(null);
    setPreqText("");
    setPreqPreview(null);
    setPreqSaving(false);
  }

  async function previewFromExtract(payload: FormData | { text: string }) {
    try {
      const res = await fetch("/api/pipeline/extract", {
        method: "POST",
        ...(payload instanceof FormData
          ? { body: payload }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read the file");
      setPreqPreview({
        mwAvailable: data.fields.mwAvailable ?? null,
        isdDate: data.fields.isdDate || "",
        feeders: data.fields.feeders || [],
        peakDemand: data.fields.peakDemand || "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file");
    }
  }

  function onPreqFile(file: File) {
    setPreqFile(file);
    setPreqText("");
    const form = new FormData();
    form.append("file", file);
    previewFromExtract(form);
  }

  async function savePowerRequest() {
    if (preqMode === "existing" && !preqExistingId) {
      toast.error("Choose a substation");
      return;
    }
    if (preqMode === "new" && !preqNewName.trim()) {
      toast.error("Enter the new substation name");
      return;
    }
    if (!preqFile && !preqText.trim()) {
      toast.error("Upload the .eml or paste the request text");
      return;
    }
    setPreqSaving(true);
    try {
      const form = new FormData();
      if (preqMode === "existing") form.append("substationId", preqExistingId);
      else form.append("substationName", preqNewName.trim());
      if (preqFile) form.append("file", preqFile);
      else form.append("text", preqText.trim());

      const res = await fetch("/api/pipeline/power-request", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setItems(data.items);
      setPreqOpen(false);
      resetPreq();
      toast.success(
        `Saved to pipeline + board${
          data.imagesSkipped
            ? ` · ${data.imagesSkipped} image(s) skipped (no blob storage)`
            : ""
        }`
      );
      setTab("tracked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPreqSaving(false);
    }
  }

  async function createSite() {
    if (!site.apn.trim() && !site.address.trim()) {
      toast.error("Enter the site APN and address");
      return;
    }
    setSavingSite(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "site",
          apn: site.apn.trim(),
          address: site.address.trim(),
          name: site.address.trim() || `APN ${site.apn.trim()}`,
          isdDate: site.isdDate.trim(),
          mwRequested: site.mwRequested.trim() ? Number(site.mwRequested) : null,
          expectedSubstation: site.expectedSubstation.trim(),
          priority: site.priority,
          submittedBy: currentUser,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setItems(data.items);
      setSiteOpen(false);
      setSite({
        apn: "",
        address: "",
        isdDate: "",
        mwRequested: "",
        expectedSubstation: "",
        priority: "Medium",
      });
      toast.success("Added to Sites of Interest");
      setTab("sites");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingSite(false);
    }
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "tracked", label: "Tracked", count: tracked.length },
    { id: "interest", label: "Substations of Interest", count: interest.length },
    { id: "sites", label: "Sites of Interest", count: sites.length },
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetPreq();
              setPreqOpen(true);
            }}
          >
            <FileUp className="h-4 w-4" /> Upload power request
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSiteOpen(true)}>
            <MapPin className="h-4 w-4" /> Add site
          </Button>
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
                    <tr
                      key={it.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => setDetailItem(it)}
                    >
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
              <div
                key={it.id}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300"
                onClick={() => setDetailItem(it)}
              >
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); openClaim(it); }}
                        >
                          Claim &amp; submit
                        </Button>
                      ) : (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); openResponse(it); }}>
                          Upload NVE response
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); deleteItem(it.id); }}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-slate-400" />
                      </Button>
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

      {tab === "sites" ? (
        <div className="space-y-2">
          {sites.map((it) => {
            const days = daysSince(
              it.status === "to_be_searched" ? it.dateAdded : it.dateStudySubmittedToNve
            );
            return (
              <div
                key={it.id}
                className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300"
                onClick={() => setDetailItem(it)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {it.address || it.name}
                      </span>
                      <Badge className="border-sky-200 bg-sky-50 text-sky-700">Site</Badge>
                      <Badge className={priorityBadgeClass(it.priority)}>{it.priority}</Badge>
                      <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                        {STATUS_LABEL[it.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {it.apn ? <span>APN: {it.apn}</span> : null}
                      {it.mwRequested != null ? <span>MW requested: {it.mwRequested}</span> : null}
                      {it.isdDate ? <span>ISD: {fmtDate(it.isdDate)}</span> : null}
                      {it.expectedSubstation ? (
                        <span>Expected: {it.expectedSubstation}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {days !== null ? <div>{days}d in status</div> : null}
                    {it.assignedEe ? <div>EE: {it.assignedEe}</div> : null}
                    <div className="mt-2 flex justify-end gap-2">
                      {it.status === "to_be_searched" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); openClaim(it); }}
                        >
                          Claim &amp; submit
                        </Button>
                      ) : (
                        <Button size="sm" onClick={(e) => { e.stopPropagation(); openResponse(it); }}>
                          Upload NVE response
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); deleteItem(it.id); }}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!sites.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              No sites yet. Use “Add site” to track a parcel expecting power from a substation.
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
                    <div
                      key={it.id}
                      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300"
                      onClick={() => setDetailItem(it)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{it.name}</span>
                        <div className="flex items-center gap-1">
                          {kindOf(it) === "site" ? (
                            <Badge className="border-sky-200 bg-sky-50 text-sky-700">Site</Badge>
                          ) : null}
                          <Badge className={priorityBadgeClass(it.priority)}>{it.priority}</Badge>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteItem(it.id); }}
                            title="Delete"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openClaim(it); }}>
                              Claim &amp; submit
                            </Button>
                          ) : (
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); openResponse(it); }}>
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

      {detailItem ? (
        <PipelineDetail
          key={detailItem.id}
          item={detailItem}
          currentUser={currentUser}
          onClose={() => setDetailItem(null)}
          onUpdated={(next) => {
            setItems(next);
            const fresh = next.find((i) => i.id === detailItem.id);
            setDetailItem(fresh || null);
          }}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((i) => i.id !== id));
            setDetailItem(null);
          }}
        />
      ) : null}

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

      {/* Upload Power Availability Request dialog */}
      <Dialog
        open={preqOpen}
        onOpenChange={(o) => {
          setPreqOpen(o);
          if (!o) resetPreq();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Power Availability Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              File a request under a substation. The same substation can hold many
              requests over time (e.g. 20 MW, then 40 MW). Saves to the pipeline
              (Tracked) <span className="font-medium">and</span> the board.
            </p>

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              <button
                type="button"
                onClick={() => setPreqMode("existing")}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
                  preqMode === "existing" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
                }`}
              >
                Existing substation
              </button>
              <button
                type="button"
                onClick={() => setPreqMode("new")}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium ${
                  preqMode === "new" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
                }`}
              >
                New substation
              </button>
            </div>

            {preqMode === "existing" ? (
              <div>
                <Label>Substation</Label>
                <Select value={preqExistingId} onValueChange={setPreqExistingId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a substation…" />
                  </SelectTrigger>
                  <SelectContent>
                    {items
                      .filter((i) => kindOf(i) === "substation")
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                          {i.status === "confirmed" ? "" : ` · ${STATUS_LABEL[i.status]}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!items.some((i) => kindOf(i) === "substation") ? (
                  <p className="mt-1 text-xs text-slate-400">
                    No substations yet — switch to “New substation”.
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <Label htmlFor="preq-name">New substation name</Label>
                <Input
                  id="preq-name"
                  value={preqNewName}
                  onChange={(e) => setPreqNewName(e.target.value)}
                  placeholder="e.g. Highland"
                />
              </div>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setPreqDropping(true);
              }}
              onDragLeave={() => setPreqDropping(false)}
              onDrop={(e) => {
                e.preventDefault();
                setPreqDropping(false);
                const f = e.dataTransfer.files?.[0];
                if (f) onPreqFile(f);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-5 text-center text-xs ${
                preqDropping ? "border-slate-900 bg-slate-50" : "border-slate-300"
              }`}
            >
              <Upload className="mb-1 h-4 w-4 text-slate-400" />
              {preqFile ? (
                <span className="text-slate-700">{preqFile.name}</span>
              ) : (
                <span className="text-slate-500">
                  Drag &amp; drop the .eml here, or{" "}
                  <button
                    type="button"
                    className="font-medium text-slate-900 underline"
                    onClick={() => preqFileRef.current?.click()}
                  >
                    choose a file
                  </button>
                </span>
              )}
              <input
                ref={preqFileRef}
                type="file"
                accept=".eml,message/rfc822,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPreqFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <Textarea
              rows={3}
              placeholder="…or paste the request email text here"
              value={preqText}
              onChange={(e) => {
                setPreqText(e.target.value);
                setPreqFile(null);
              }}
              onBlur={() => {
                if (!preqFile && preqText.trim()) previewFromExtract({ text: preqText.trim() });
              }}
            />

            {preqPreview ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-700">Pulled from email</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {preqPreview.mwAvailable !== null ? <span>MW: {preqPreview.mwAvailable}</span> : null}
                  {preqPreview.isdDate ? <span>ISD: {fmtDate(preqPreview.isdDate)}</span> : null}
                  {preqPreview.peakDemand ? <span>Peak: {preqPreview.peakDemand}</span> : null}
                </div>
                {preqPreview.feeders.length ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {preqPreview.feeders.map((f) => (
                      <Badge key={f.id} className="border-amber-200 bg-amber-50 text-amber-800">
                        {f.id}
                        {f.mva !== null ? ` · ${f.mva} MVA` : ""}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => { setPreqOpen(false); resetPreq(); }}>
              Cancel
            </Button>
            <Button onClick={savePowerRequest} disabled={preqSaving}>
              {preqSaving ? "Saving…" : "Save to pipeline + board"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add site dialog */}
      <Dialog open={siteOpen} onOpenChange={setSiteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a site of interest</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            A specific parcel expecting power from a substation. Flows into the EE
            Queue like a substation of interest.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="site-apn">APN</Label>
              <Input id="site-apn" value={site.apn} onChange={(e) => setSite({ ...site, apn: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="site-mw">MW request</Label>
              <Input id="site-mw" value={site.mwRequested} onChange={(e) => setSite({ ...site, mwRequested: e.target.value })} placeholder="e.g. 20" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="site-addr">Address</Label>
              <Input id="site-addr" value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="site-isd">ISD</Label>
              <Input id="site-isd" value={site.isdDate} onChange={(e) => setSite({ ...site, isdDate: e.target.value })} placeholder="e.g. Q2 2027 or 2027-06-01" />
            </div>
            <div>
              <Label htmlFor="site-sub">Expected substation</Label>
              <Input
                id="site-sub"
                list="preq-substation-names"
                value={site.expectedSubstation}
                onChange={(e) => setSite({ ...site, expectedSubstation: e.target.value })}
                placeholder="where power comes from"
              />
              <datalist id="preq-substation-names">
                {substationNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div className="col-span-2">
              <Label>Priority</Label>
              <Select value={site.priority} onValueChange={(v) => setSite({ ...site, priority: v as PipelinePriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setSiteOpen(false)}>Cancel</Button>
            <Button onClick={createSite} disabled={savingSite}>
              {savingSite ? "Saving…" : "Add to Sites of Interest"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
