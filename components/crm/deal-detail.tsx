"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileText,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Zap,
} from "lucide-react";
import { GoogleMapEmbed } from "@/components/crm/google-map-embed";
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
import {
  DEAL_DOC_STATUSES,
  DEAL_STAGES,
  DEAL_TYPES,
  type Deal,
  type DealContact,
  type DealDocStatus,
  type DealDocument,
  type DealMilestone,
  type DealStage,
  type DealType,
  type PipelineSubstation,
} from "@/lib/types";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function docStatusClass(status: DealDocStatus): string {
  switch (status) {
    case "submitted":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "received":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "in_progress":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "na":
      return "border-slate-200 bg-slate-100 text-slate-400";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function DealDetail({
  deal: initialDeal,
  substation,
  substationNames,
  currentUser,
}: {
  deal: Deal;
  substation: PipelineSubstation | null;
  substationNames: string[];
  currentUser?: string;
}) {
  const router = useRouter();
  const [deal, setDeal] = useState<Deal>(initialDeal);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Deal>(initialDeal);
  const [busy, setBusy] = useState(false);

  const [contactOpen, setContactOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState<DealContact | null>(null);

  const [expandedResp, setExpandedResp] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadKey, setUploadKey] = useState<string>("");

  async function patchDeal(patch: Partial<Deal>, quiet = false): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/deals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setDeal(data.item);
      if (!quiet) toast.success("Saved");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveOverview() {
    const ok = await patchDeal({
      name: draft.name.trim(),
      type: draft.type,
      stage: draft.stage,
      apn: draft.apn.trim(),
      address: draft.address.trim(),
      substation: draft.substation.trim(),
      mw: String(draft.mw ?? "").trim() ? Number(draft.mw) : null,
      keyDate: draft.keyDate,
      summary: draft.summary.trim(),
    });
    if (ok) setEditing(false);
  }

  async function removeDeal() {
    if (!confirm(`Delete deal "${deal.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/deals?id=${encodeURIComponent(deal.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Deleted");
      router.push("/deals");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  // Contacts ---------------------------------------------------------------
  function openNewContact() {
    setContactDraft({
      id: uid(),
      name: "",
      role: "",
      company: "",
      phone: "",
      email: "",
      notes: "",
    });
    setContactOpen(true);
  }
  function openEditContact(c: DealContact) {
    setContactDraft({ ...c });
    setContactOpen(true);
  }
  async function saveContact() {
    if (!contactDraft) return;
    if (!contactDraft.name.trim()) {
      toast.error("Contact name is required");
      return;
    }
    const exists = deal.contacts.some((c) => c.id === contactDraft.id);
    const next = exists
      ? deal.contacts.map((c) => (c.id === contactDraft.id ? contactDraft : c))
      : [...deal.contacts, contactDraft];
    const ok = await patchDeal({ contacts: next }, true);
    if (ok) {
      setContactOpen(false);
      setContactDraft(null);
      toast.success("Contact saved");
    }
  }
  async function deleteContact(id: string) {
    if (!confirm("Delete this contact?")) return;
    await patchDeal({ contacts: deal.contacts.filter((c) => c.id !== id) });
  }

  // Documents --------------------------------------------------------------
  async function updateDoc(id: string, patch: Partial<DealDocument>) {
    const next = deal.documents.map((d) =>
      d.id === id
        ? {
            ...d,
            ...patch,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser || d.updatedBy,
          }
        : d
    );
    await patchDeal({ documents: next }, true);
  }
  async function addOtherDoc() {
    const label = prompt("Document name?");
    if (!label || !label.trim()) return;
    const next: DealDocument[] = [
      ...deal.documents,
      {
        id: uid(),
        key: "other",
        label: label.trim(),
        status: "needed",
        fileUrl: "",
        fileName: "",
        link: "",
        note: "",
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser || "",
      },
    ];
    await patchDeal({ documents: next });
  }
  async function deleteDoc(id: string) {
    if (!confirm("Remove this document row?")) return;
    await patchDeal({ documents: deal.documents.filter((d) => d.id !== id) });
  }
  function triggerUpload(key: string) {
    setUploadKey(key);
    uploadInputRef.current?.click();
  }
  async function onUploadFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("key", uploadKey);
      const res = await fetch(`/api/deals/${deal.id}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDeal(data.item);
      toast.success("File attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setUploadKey("");
    }
  }

  // Milestones -------------------------------------------------------------
  async function addMilestone() {
    const title = prompt("Milestone / timeline item?");
    if (!title || !title.trim()) return;
    const next: DealMilestone[] = [
      ...deal.milestones,
      { id: uid(), title: title.trim(), dueAt: "", doneAt: "", note: "" },
    ];
    await patchDeal({ milestones: next });
  }
  async function updateMilestone(id: string, patch: Partial<DealMilestone>) {
    const next = deal.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m));
    await patchDeal({ milestones: next }, true);
  }
  async function deleteMilestone(id: string) {
    await patchDeal({ milestones: deal.milestones.filter((m) => m.id !== id) });
  }

  const typeLabel =
    DEAL_TYPES.find((t) => t.value === deal.type)?.label || deal.type;
  const stageLabel =
    DEAL_STAGES.find((s) => s.value === deal.stage)?.label || deal.stage;

  return (
    <div className="space-y-4">
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadFile(f);
          e.target.value = "";
        }}
      />

      <div className="flex items-center justify-between">
        <Link
          href="/deals"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> All deals
        </Link>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(deal);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={saveOverview} disabled={busy}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(deal);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={removeDeal}
                disabled={busy}
                title="Delete deal"
              >
                <Trash2 className="h-4 w-4 text-slate-400" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Overview */}
      <Section title="Overview" icon={<FileText className="h-4 w-4 text-slate-400" />}>
        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={draft.type}
                onValueChange={(v) => setDraft({ ...draft, type: v as DealType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stage</Label>
              <Select
                value={draft.stage}
                onValueChange={(v) => setDraft({ ...draft, stage: v as DealStage })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>APN</Label>
              <Input
                value={draft.apn}
                onChange={(e) => setDraft({ ...draft, apn: e.target.value })}
              />
            </div>
            <div>
              <Label>Target MW</Label>
              <Input
                value={draft.mw ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    mw: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>
            <div>
              <Label>Substation</Label>
              <Input
                list="deal-sub-names"
                value={draft.substation}
                onChange={(e) => setDraft({ ...draft, substation: e.target.value })}
              />
              <datalist id="deal-sub-names">
                {substationNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Key date</Label>
              <Input
                type="date"
                value={draft.keyDate}
                onChange={(e) => setDraft({ ...draft, keyDate: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Summary</Label>
              <Textarea
                rows={3}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{deal.name}</h1>
              <Badge
                className={
                  deal.type === "under_contract"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }
              >
                {typeLabel}
              </Badge>
              <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                {stageLabel}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-slate-400">APN</div>
                <div className="text-slate-800">{deal.apn || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Target MW</div>
                <div className="text-slate-800">{deal.mw ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Substation</div>
                <div className="text-slate-800">{deal.substation || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Key date</div>
                <div className="text-slate-800">{deal.keyDate ? fmtDate(deal.keyDate) : "—"}</div>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <div className="text-xs text-slate-400">Address</div>
                <div className="text-slate-800">{deal.address || "—"}</div>
              </div>
            </div>
            {deal.summary ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{deal.summary}</p>
            ) : null}
            {deal.address ? (
              <GoogleMapEmbed query={deal.address} height={220} label={deal.name} />
            ) : null}
          </div>
        )}
      </Section>

      {/* Contacts */}
      <Section
        title={`Owner / stakeholder contacts (${deal.contacts.length})`}
        icon={<UserPlus className="h-4 w-4 text-slate-400" />}
        action={
          <Button size="sm" variant="outline" onClick={openNewContact}>
            <Plus className="h-4 w-4" /> Add contact
          </Button>
        }
      >
        {deal.contacts.length ? (
          <div className="divide-y divide-slate-100">
            {deal.contacts.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 py-2">
                <div className="text-sm">
                  <div className="font-medium text-slate-900">
                    {c.name}
                    {c.role ? <span className="text-slate-400"> · {c.role}</span> : null}
                    {c.company ? <span className="text-slate-400"> · {c.company}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-xs text-slate-600">
                    {c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : null}
                    {c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : null}
                  </div>
                  {c.notes ? <p className="mt-0.5 text-xs text-slate-500">{c.notes}</p> : null}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEditContact(c)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteContact(c.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No contacts yet.</p>
        )}
      </Section>

      {/* Documents checklist */}
      <Section
        title="Documentation checklist"
        icon={<Paperclip className="h-4 w-4 text-slate-400" />}
        action={
          <Button size="sm" variant="outline" onClick={addOtherDoc}>
            <Plus className="h-4 w-4" /> Add document
          </Button>
        }
      >
        <div className="space-y-2">
          {deal.documents.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {d.status === "received" || d.status === "submitted" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-slate-300" />
                  )}
                  <span className="text-sm font-medium text-slate-800">{d.label}</span>
                  <Badge className={docStatusClass(d.status)}>
                    {DEAL_DOC_STATUSES.find((s) => s.value === d.status)?.label || d.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={d.status}
                    onValueChange={(v) => updateDoc(d.id, { status: v as DealDocStatus })}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEAL_DOC_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerUpload(d.key)}
                    disabled={busy}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </Button>
                  {d.key === "other" ? (
                    <Button size="sm" variant="ghost" onClick={() => deleteDoc(d.id)} title="Remove">
                      <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  className="h-8 text-xs"
                  placeholder="External link (e.g. Google Drive)"
                  defaultValue={d.link}
                  onBlur={(e) => {
                    if (e.target.value !== d.link) updateDoc(d.id, { link: e.target.value.trim() });
                  }}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="Note"
                  defaultValue={d.note}
                  onBlur={(e) => {
                    if (e.target.value !== d.note) updateDoc(d.id, { note: e.target.value.trim() });
                  }}
                />
              </div>
              {(d.fileUrl || d.link) && (
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                  {d.fileUrl ? (
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                    >
                      <Paperclip className="h-3 w-3" /> {d.fileName || "file"}
                    </a>
                  ) : null}
                  {d.link ? (
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Link
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Timeline */}
      <Section
        title={`Timeline (${deal.milestones.length})`}
        icon={<FileText className="h-4 w-4 text-slate-400" />}
        action={
          <Button size="sm" variant="outline" onClick={addMilestone}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        }
      >
        {deal.milestones.length ? (
          <div className="space-y-2">
            {deal.milestones.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      updateMilestone(m.id, {
                        doneAt: m.doneAt ? "" : new Date().toISOString(),
                      })
                    }
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      m.doneAt
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-300"
                    }`}
                    title={m.doneAt ? "Mark not done" : "Mark done"}
                  >
                    {m.doneAt ? <Check className="h-3 w-3" /> : null}
                  </button>
                  <span
                    className={`text-sm ${m.doneAt ? "text-slate-400 line-through" : "text-slate-800"}`}
                  >
                    {m.title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="h-8 w-36 text-xs"
                    defaultValue={m.dueAt ? m.dueAt.slice(0, 10) : ""}
                    onBlur={(e) => {
                      if (e.target.value !== (m.dueAt ? m.dueAt.slice(0, 10) : ""))
                        updateMilestone(m.id, { dueAt: e.target.value });
                    }}
                  />
                  <Button size="sm" variant="ghost" onClick={() => deleteMilestone(m.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No timeline items yet.</p>
        )}
      </Section>

      {/* Power availability (Chad's NVE emails) */}
      <Section
        title="Power availability (NVE emails)"
        icon={<Zap className="h-4 w-4 text-amber-500" />}
        action={
          substation ? (
            <Link
              href={`/pipeline`}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Open in pipeline
            </Link>
          ) : null
        }
      >
        {substation ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              <span className="font-medium">{substation.name}</span>
              {substation.mwAvailable != null ? <span>{substation.mwAvailable} MW available</span> : null}
              {substation.isdDate ? <span>ISD {fmtDate(substation.isdDate)}</span> : null}
              {substation.feeders?.length ? <span>{substation.feeders.length} feeders</span> : null}
            </div>
            {substation.responses?.length ? (
              substation.responses.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {r.subject || r.sourceFile || "NVE response"}
                    </p>
                    <button
                      className="text-xs text-slate-500 underline"
                      onClick={() => setExpandedResp(expandedResp === r.id ? null : r.id)}
                    >
                      {expandedResp === r.id ? "Hide" : "Show email"}
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
                    {[r.from, r.date].filter(Boolean).join(" · ") || "—"}
                    {r.mwAvailable != null ? <span>MW: {r.mwAvailable}</span> : null}
                    {r.isdDate ? <span>ISD: {fmtDate(r.isdDate)}</span> : null}
                  </div>
                  {expandedResp === r.id && r.text ? (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                      {r.text}
                    </pre>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Linked to {substation.name}, but no NVE pulls captured yet. Upload one in
                the pipeline.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {deal.substation
              ? `No pipeline substation named “${deal.substation}” yet — add power via the Pipeline tab.`
              : "Set a substation in Overview to link this deal's NVE power emails."}
          </p>
        )}
      </Section>

      {/* Contact dialog */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{contactDraft && deal.contacts.some((c) => c.id === contactDraft.id) ? "Edit contact" : "Add contact"}</DialogTitle>
          </DialogHeader>
          {contactDraft ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input
                  value={contactDraft.name}
                  onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Role</Label>
                <Input
                  value={contactDraft.role}
                  onChange={(e) => setContactDraft({ ...contactDraft, role: e.target.value })}
                  placeholder="Owner / Broker / Attorney"
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  value={contactDraft.company}
                  onChange={(e) => setContactDraft({ ...contactDraft, company: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={contactDraft.phone}
                  onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={contactDraft.email}
                  onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={contactDraft.notes}
                  onChange={(e) => setContactDraft({ ...contactDraft, notes: e.target.value })}
                />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveContact} disabled={busy}>
              Save contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
