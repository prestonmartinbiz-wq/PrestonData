"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownUp,
  Download,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { LeadForm, EMPTY_LEAD } from "@/components/crm/lead-form";
import { LeadDrawer } from "@/components/crm/lead-drawer";
import { PropertyLinks } from "@/components/crm/property-links";
import { isNeverCalled, isOverdueCallback, outcomeLabel } from "@/lib/calls";
import type { Lead, SaveMeta, TeamMember } from "@/lib/types";
import { needsContact } from "@/lib/utils";

type SortKey =
  | "apn"
  | "propertyAddress"
  | "ownerEntity"
  | "status"
  | "assignedTo"
  | "lastCalledAt"
  | "nextCallbackAt"
  | "callCount";

type QueueFilter = "all" | "overdue" | "never_called";

function csvEscape(value: string) {
  return '"' + (value || "").replace(/"/g, '""') + '"';
}

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeadsDashboard({
  initialLeads,
  initialMeta,
  team,
  currentUserEmail,
  currentUserName,
}: {
  initialLeads: Lead[];
  initialMeta: SaveMeta;
  team: TeamMember[];
  currentUserEmail?: string;
  currentUserName?: string;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [meta, setMeta] = useState(initialMeta);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [needsContactOnly, setNeedsContactOnly] = useState(false);
  const [myLeadsOnly, setMyLeadsOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("apn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Lead>(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const statuses = useMemo(
    () => Array.from(new Set(leads.map((l) => l.status).filter(Boolean))).sort(),
    [leads]
  );

  const assignees = useMemo(() => {
    const fromTeam = team.map((t) => t.email).filter(Boolean);
    const fromLeads = leads.map((l) => l.assignedTo).filter(Boolean);
    return Array.from(
      new Set([...fromTeam, ...fromLeads, currentUserEmail || ""].filter(Boolean))
    ).sort();
  }, [team, leads, currentUserEmail]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (assigneeFilter === "__unassigned__" && (l.assignedTo || "").trim()) return false;
      if (
        assigneeFilter !== "all" &&
        assigneeFilter !== "__unassigned__" &&
        (l.assignedTo || "") !== assigneeFilter
      ) {
        return false;
      }
      if (needsContactOnly && !needsContact(l)) return false;
      if (
        myLeadsOnly &&
        currentUserEmail &&
        (l.assignedTo || "").toLowerCase() !== currentUserEmail.toLowerCase()
      ) {
        return false;
      }
      if (queueFilter === "overdue" && !isOverdueCallback(l)) return false;
      if (queueFilter === "never_called" && !isNeverCalled(l)) return false;
      if (!q) return true;
      const hay = [
        l.apn,
        l.propertyAddress,
        l.ownerEntity,
        l.decisionMaker,
        l.email,
        l.phone,
        l.notes,
        l.status,
        l.assignedTo,
        l.lastOutcome,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      if (sortKey === "callCount") {
        const av = Number(a.callCount || 0);
        const bv = Number(b.callCount || 0);
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      }
      if (sortKey === "lastCalledAt" || sortKey === "nextCallbackAt") {
        const av = Date.parse(a[sortKey] || "") || 0;
        const bv = Date.parse(b[sortKey] || "") || 0;
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      }
      const av = (a[sortKey] || "").toString().toLowerCase();
      const bv = (b[sortKey] || "").toString().toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [
    leads,
    query,
    statusFilter,
    assigneeFilter,
    queueFilter,
    needsContactOnly,
    myLeadsOnly,
    currentUserEmail,
    sortKey,
    sortDir,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function refresh() {
    const res = await fetch("/api/leads");
    if (!res.ok) {
      toast.error("Failed to refresh leads");
      return;
    }
    const data = await res.json();
    setLeads(data.leads);
    setMeta(data.meta);
  }

  function openLead(lead: Lead) {
    setSelected(lead);
  }

  async function createLead() {
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setLeads(data.leads);
      setMeta(data.meta);
      setCreating(false);
      toast.success("Lead added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onImport(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/leads/import", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Import failed");
      return;
    }
    setLeads(data.leads);
    setMeta(data.meta);
    toast.success("Imported " + data.imported + " rows (" + data.total + " total)");
  }

  function exportCsv() {
    const headers = [
      "APN",
      "Property Address",
      "Owner Entity",
      "Decision Maker",
      "Title",
      "Phone",
      "Email",
      "Alt Phone",
      "Phones",
      "Mailing / RA Address",
      "Confidence",
      "Sources",
      "Notes",
      "Status",
      "Assigned To",
      "Latitude",
      "Longitude",
      "Last Called At",
      "Last Outcome",
      "Next Callback At",
      "Call Count",
      "Needs Skip Trace",
    ];
    const lines = [
      headers.join(","),
      ...filtered.map((l) =>
        [
          l.apn,
          l.propertyAddress,
          l.ownerEntity,
          l.decisionMaker,
          l.title,
          l.phone,
          l.email,
          l.altPhone,
          l.phones || [l.phone, l.altPhone].filter(Boolean).join("|"),
          l.mailingAddress,
          l.confidence,
          l.sources,
          l.notes,
          l.status,
          l.assignedTo,
          l.latitude || "",
          l.longitude || "",
          l.lastCalledAt || "",
          l.lastOutcome || "",
          l.nextCallbackAt || "",
          l.callCount || "",
          l.needsSkipTrace || "",
        ]
          .map(csvEscape)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const lastSaved = meta.lastSavedAt
    ? new Date(meta.lastSavedAt).toLocaleString()
    : "unknown";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-slate-500">
            Source: <Badge className="ml-1">{meta.source}</Badge>
            <span className="ml-2">Last saved: {lastSaved}</span>
            {meta.path ? <span className="ml-2 text-slate-400">({meta.path})</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setDraft({ ...EMPTY_LEAD, assignedTo: currentUserEmail || "" });
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add lead
          </Button>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-7">
        <div className="relative md:col-span-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search APN, owner, address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="__unassigned__">Unassigned</SelectItem>
            {assignees.map((email) => (
              <SelectItem key={email} value={email}>
                {email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={queueFilter}
          onValueChange={(v) => setQueueFilter(v as QueueFilter)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Call queue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All call states</SelectItem>
            <SelectItem value="overdue">Overdue callback</SelectItem>
            <SelectItem value="never_called">Never called</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={needsContactOnly ? "default" : "outline"}
          onClick={() => setNeedsContactOnly((v) => !v)}
        >
          Needs contact
        </Button>
        <Button
          variant={myLeadsOnly ? "default" : "outline"}
          onClick={() => setMyLeadsOnly((v) => !v)}
          disabled={!currentUserEmail}
        >
          My leads
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {(
                  [
                    ["apn", "APN"],
                    ["propertyAddress", "Address"],
                    ["ownerEntity", "Owner"],
                    ["status", "Status"],
                    ["assignedTo", "Assigned"],
                    ["lastCalledAt", "Last call"],
                    ["nextCallbackAt", "Callback"],
                    ["callCount", "Calls"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 font-medium">
                    <button
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      <ArrowDownUp className="h-3 w-3" />
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const overdue = isOverdueCallback(lead);
                const never = isNeverCalled(lead);
                return (
                  <tr
                    key={lead.apn}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => openLead(lead)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span>{lead.apn}</span>
                        <PropertyLinks
                          apn={lead.apn}
                          propertyAddress={lead.propertyAddress}
                          lat={lead.latitude}
                          lng={lead.longitude}
                          compact
                        />
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2">
                      {lead.propertyAddress}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2">
                      {lead.ownerEntity}
                    </td>
                    <td className="px-3 py-2">
                      <Badge>{lead.status || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {lead.assignedTo || "Unassigned"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {never ? (
                        <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                          Never
                        </Badge>
                      ) : (
                        <span title={outcomeLabel(lead.lastOutcome)}>
                          {formatShortDate(lead.lastCalledAt)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {lead.nextCallbackAt ? (
                        <Badge
                          className={
                            overdue
                              ? "border-rose-200 bg-rose-50 text-rose-800"
                              : "border-sky-200 bg-sky-50 text-sky-800"
                          }
                        >
                          {formatShortDate(lead.nextCallbackAt)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {lead.callCount || "0"}
                    </td>
                    <td className="px-3 py-2">
                      {needsContact(lead) ? (
                        <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                          Needs info
                        </Badge>
                      ) : (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                          OK
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                    No leads match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          Showing {filtered.length} of {leads.length} leads
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            mode="create"
            lead={draft}
            team={team}
            currentUserEmail={currentUserEmail}
            onChange={setDraft}
            onSubmit={createLead}
            saving={saving}
          />
        </DialogContent>
      </Dialog>

      {selected ? (
        <LeadDrawer
          key={selected.apn}
          lead={selected}
          team={team}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          onClose={() => setSelected(null)}
          onLeadsUpdated={(nextLeads, nextMeta) => {
            setLeads(nextLeads);
            if (nextMeta) setMeta(nextMeta);
          }}
          onDeleted={(_apn, nextLeads, nextMeta) => {
            setLeads(nextLeads);
            setMeta(nextMeta);
            setSelected(null);
          }}
        />
      ) : null}
    </div>
  );
}
