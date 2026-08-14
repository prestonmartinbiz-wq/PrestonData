"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, Zap } from "lucide-react";
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
  DEAL_STAGES,
  DEAL_TYPES,
  type Deal,
  type DealStage,
  type DealType,
} from "@/lib/types";

const STAGE_LABEL: Record<DealStage, string> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.value, s.label])
) as Record<DealStage, string>;

function stageBadgeClass(stage: DealStage): string {
  switch (stage) {
    case "submitted":
    case "closed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "power_reservation":
    case "design":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "dead":
      return "border-slate-200 bg-slate-100 text-slate-500";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

/** Fraction of applicable checklist docs that are received or submitted. */
export function docProgress(deal: Deal): { done: number; total: number } {
  const applicable = (deal.documents || []).filter((d) => d.status !== "na");
  const done = applicable.filter(
    (d) => d.status === "received" || d.status === "submitted"
  ).length;
  return { done, total: applicable.length };
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function DealsBoard({
  initialItems,
  substationNames,
  currentUser,
}: {
  initialItems: Deal[];
  substationNames: string[];
  currentUser?: string;
}) {
  const [items, setItems] = useState<Deal[]>(initialItems);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    type: "landowner_relationship" as DealType,
    stage: "secured" as DealStage,
    apn: "",
    address: "",
    substation: "",
    mw: "",
    keyDate: "",
    summary: "",
  });

  const active = useMemo(
    () => items.filter((d) => d.stage !== "dead" && d.stage !== "closed"),
    [items]
  );
  const inactive = useMemo(
    () => items.filter((d) => d.stage === "dead" || d.stage === "closed"),
    [items]
  );

  async function createDeal() {
    if (!draft.name.trim()) {
      toast.error("Deal name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          mw: draft.mw.trim() ? Number(draft.mw) : null,
          createdBy: currentUser,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setItems(data.items);
      setOpen(false);
      setDraft({
        name: "",
        type: "landowner_relationship",
        stage: "secured",
        apn: "",
        address: "",
        substation: "",
        mw: "",
        keyDate: "",
        summary: "",
      });
      toast.success("Deal created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  function DealCard({ deal }: { deal: Deal }) {
    const { done, total } = docProgress(deal);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
      <Link
        href={`/deals/${deal.id}`}
        className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{deal.name}</span>
              <Badge className={stageBadgeClass(deal.stage)}>
                {STAGE_LABEL[deal.stage]}
              </Badge>
              <Badge
                className={
                  deal.type === "under_contract"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }
              >
                {deal.type === "under_contract" ? "Under contract" : "Landowner"}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {deal.address ? <span>{deal.address}</span> : null}
              {deal.substation ? (
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3 w-3 text-amber-500" />
                  {deal.substation}
                </span>
              ) : null}
              {deal.mw != null ? <span>{deal.mw} MW</span> : null}
              {deal.keyDate ? <span>Key date: {fmtDate(deal.keyDate)}</span> : null}
            </div>
            {deal.summary ? (
              <p className="mt-2 max-w-2xl text-sm text-slate-600 line-clamp-2">
                {deal.summary}
              </p>
            ) : null}
          </div>
          <div className="w-40 shrink-0">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" /> Docs
              </span>
              <span className="tabular-nums">
                {done}/{total}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
            Live deal tracking
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sites under contract or landowner relationships, working through power
            reservation — contacts, NVE emails, documents &amp; timelines.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New deal
        </Button>
      </div>

      <div className="space-y-2">
        {active.map((d) => (
          <DealCard key={d.id} deal={d} />
        ))}
        {!active.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            No active deals yet. Use “New deal” to start tracking one.
          </div>
        ) : null}
      </div>

      {inactive.length ? (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Closed / dead ({inactive.length})
          </h2>
          {inactive.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New deal</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="deal-name">Deal / site name</Label>
              <Input
                id="deal-name"
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
              <Label htmlFor="deal-apn">APN</Label>
              <Input
                id="deal-apn"
                value={draft.apn}
                onChange={(e) => setDraft({ ...draft, apn: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="deal-mw">Target MW</Label>
              <Input
                id="deal-mw"
                value={draft.mw}
                onChange={(e) => setDraft({ ...draft, mw: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="deal-addr">Address</Label>
              <Input
                id="deal-addr"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="deal-sub">Substation</Label>
              <Input
                id="deal-sub"
                list="deal-substation-names"
                value={draft.substation}
                onChange={(e) => setDraft({ ...draft, substation: e.target.value })}
              />
              <datalist id="deal-substation-names">
                {substationNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="deal-key">Key date</Label>
              <Input
                id="deal-key"
                type="date"
                value={draft.keyDate}
                onChange={(e) => setDraft({ ...draft, keyDate: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="deal-sum">Summary</Label>
              <Textarea
                id="deal-sum"
                rows={3}
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                placeholder="High level: what is this deal, how much power, current status…"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createDeal} disabled={saving}>
              {saving ? "Saving…" : "Create deal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
