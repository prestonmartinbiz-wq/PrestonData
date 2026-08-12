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
import type { Lead, SaveMeta, TeamMember } from "@/lib/types";
import { needsContact } from "@/lib/utils";

type SortKey = "apn" | "propertyAddress" | "ownerEntity" | "status" | "assignedTo";

function csvEscape(value: string) {
  return '"' + (value || "").replace(/"/g, '""') + '"';
}

export function LeadsDashboard({
  initialLeads,
  initialMeta,
  team,
  currentUserEmail,
}: {
  initialLeads: Lead[];
  initialMeta: SaveMeta;
  team: TeamMember[];
  currentUserEmail?: string;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [meta, setMeta] = useState(initialMeta);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
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
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
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

  async function saveLead(mode: "create" | "edit") {
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setLeads(data.leads);
      setMeta(data.meta);
      setCreating(false);
      setSelected(null);
      toast.success(mode === "create" ? "Lead added" : "Lead saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead() {
    if (!draft.apn) return;
    if (!confirm("Delete lead " + draft.apn + "?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leads?apn=" + encodeURIComponent(draft.apn), {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setLeads(data.leads);
      setMeta(data.meta);
      setSelected(null);
      toast.success("Lead deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
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
      "Mailing / RA Address",
      "Confidence",
      "Sources",
      "Notes",
      "Status",
      "Assigned To",
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
          l.mailingAddress,
          l.confidence,
          l.sources,
          l.notes,
          l.status,
          l.assignedTo,
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

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-6">
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
              {filtered.map((lead) => (
                <tr
                  key={lead.apn}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => {
                    setDraft(lead);
                    setSelected(lead);
                  }}
                >
                  <td className="px-3 py-2 font-mono text-xs">{lead.apn}</td>
                  <td className="max-w-[220px] truncate px-3 py-2">{lead.propertyAddress}</td>
                  <td className="max-w-[180px] truncate px-3 py-2">{lead.ownerEntity}</td>
                  <td className="px-3 py-2">
                    <Badge>{lead.status || "—"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {lead.assignedTo || "Unassigned"}
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
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
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
            onSubmit={() => saveLead("create")}
            saving={saving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit lead {draft.apn}</DialogTitle>
          </DialogHeader>
          <LeadForm
            mode="edit"
            lead={draft}
            team={team}
            currentUserEmail={currentUserEmail}
            onChange={setDraft}
            onSubmit={() => saveLead("edit")}
            onDelete={deleteLead}
            saving={saving}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
