"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LeadForm } from "@/components/crm/lead-form";
import { LogCallForm } from "@/components/crm/log-call-form";
import { PropertyLinks } from "@/components/crm/property-links";
import type { CallRecord, Lead, SaveMeta, TeamMember } from "@/lib/types";
import { needsContact } from "@/lib/utils";

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

/**
 * Self-contained lead editing drawer: view/edit a lead (including the phone
 * editor), request a skip trace when there's no contact info, and log calls
 * with transcripts. Used by both the leads dashboard and the substation pages so
 * every parcel is clickable and behaves the same everywhere.
 *
 * Mount this only while a lead is selected, and give it a `key={lead.apn}` so a
 * fresh instance initializes per parcel.
 */
export function LeadDrawer({
  lead,
  team,
  currentUserEmail,
  currentUserName,
  onClose,
  onLeadsUpdated,
  onDeleted,
}: {
  lead: Lead;
  team: TeamMember[];
  currentUserEmail?: string;
  currentUserName?: string;
  onClose: () => void;
  onLeadsUpdated: (leads: Lead[], meta?: SaveMeta) => void;
  onDeleted: (apn: string, leads: Lead[], meta: SaveMeta) => void;
}) {
  const [draft, setDraft] = useState<Lead>(lead);
  const [loggingCall, setLoggingCall] = useState(false);
  const [leadCalls, setLeadCalls] = useState<CallRecord[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/calls?apn=" + encodeURIComponent(lead.apn));
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setLeadCalls(data.calls || []);
      } catch {
        if (!cancelled) setLeadCalls([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lead.apn]);

  async function saveLead() {
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onLeadsUpdated(data.leads, data.meta);
      toast.success("Lead saved");
      onClose();
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
      onDeleted(draft.apn, data.leads, data.meta);
      toast.success("Lead deleted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function skipTrace() {
    if (!draft.apn) return;
    setSaving(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const updated = { ...draft, needsSkipTrace: `requested ${stamp}` };
      const res = await fetch("/api/leads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: updated }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Skip trace failed");
      onLeadsUpdated(data.leads, data.meta);
      const fresh = (data.leads as Lead[]).find((l) => l.apn === updated.apn);
      setDraft(fresh || updated);
      toast.success(
        "Skip trace requested — contacts will be pulled from ZoomInfo (integration pending)"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Skip trace failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {loggingCall ? `Log call · ${draft.apn}` : `Owner & parcel · ${draft.apn}`}
          </DialogTitle>
        </DialogHeader>

        {!loggingCall ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
              <Button type="button" size="sm" onClick={() => setLoggingCall(true)}>
                <Phone className="h-4 w-4" /> Log call
              </Button>
              {needsContact(draft) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={skipTrace}
                  disabled={saving}
                  title="No contact info — pull from ZoomInfo (integration pending)"
                >
                  <Search className="h-4 w-4" /> Skip trace
                </Button>
              ) : null}
              {draft.needsSkipTrace ? (
                <Badge className="border-violet-200 bg-violet-50 text-violet-700">
                  Skip trace: {draft.needsSkipTrace}
                </Badge>
              ) : null}
              <PropertyLinks
                apn={draft.apn}
                propertyAddress={draft.propertyAddress}
                lat={draft.latitude}
                lng={draft.longitude}
              />
              {draft.callCount ? (
                <span className="text-xs text-slate-500">
                  {draft.callCount} call{draft.callCount === "1" ? "" : "s"}
                  {draft.lastCalledAt ? ` · last ${formatShortDate(draft.lastCalledAt)}` : ""}
                </span>
              ) : (
                <span className="text-xs text-slate-500">No calls yet</span>
              )}
            </div>
            {needsContact(draft) ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No contact info on file. Type a phone/email below, or use{" "}
                <span className="font-medium">Skip trace</span> to request contacts from
                ZoomInfo.
              </p>
            ) : null}
            <LeadForm
              mode="edit"
              lead={draft}
              team={team}
              currentUserEmail={currentUserEmail}
              onChange={setDraft}
              onSubmit={saveLead}
              onDelete={deleteLead}
              saving={saving}
            />
          </>
        ) : (
          <LogCallForm
            lead={draft}
            currentUserEmail={currentUserEmail}
            currentUserName={currentUserName}
            recentCalls={leadCalls}
            onCancel={() => setLoggingCall(false)}
            onLogged={({ call, leads: nextLeads, calls }) => {
              if (nextLeads?.length) {
                const updated = nextLeads.find((l) => l.apn === draft.apn);
                if (updated) setDraft(updated);
                onLeadsUpdated(nextLeads);
              }
              setLeadCalls(
                [...calls]
                  .filter((c) => c.apn === draft.apn)
                  .sort(
                    (a, b) => (Date.parse(b.calledAt) || 0) - (Date.parse(a.calledAt) || 0)
                  )
              );
              void call;
              setLoggingCall(true);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
