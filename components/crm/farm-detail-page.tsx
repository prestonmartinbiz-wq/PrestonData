"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Trash2 } from "lucide-react";
import { MarkersMap } from "@/components/crm/markers-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Farm, Lead, TeamMember } from "@/lib/types";

type MemberRow = {
  apn: string;
  addedVia: "polygon" | "manual";
  addedAt: string;
  lead: Lead | null;
};

export function FarmDetailClient({
  farm,
  members,
  teamMembers,
  substationNames,
  mapCenter,
}: {
  farm: Farm;
  members: MemberRow[];
  teamMembers: TeamMember[];
  substationNames: string[];
  mapCenter: { lat: number; lng: number };
}) {
  const router = useRouter();
  const [name, setName] = useState(farm.name);
  const [assignedTo, setAssignedTo] = useState(farm.assignedTo);
  const [substationOfInterest, setSubstationOfInterest] = useState(
    farm.substationOfInterest
  );
  const [notes, setNotes] = useState(farm.notes);
  const [saving, setSaving] = useState(false);
  const [memberRows, setMemberRows] = useState(members);

  async function saveMeta() {
    setSaving(true);
    try {
      const res = await fetch(`/api/farms/${encodeURIComponent(farm.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          assignedTo: assignedTo.trim(),
          substationOfInterest: substationOfInterest.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      toast.success("Farm updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(apn: string) {
    try {
      const res = await fetch(
        `/api/farms/${encodeURIComponent(farm.id)}/members?apn=${encodeURIComponent(apn)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      setMemberRows((rows) => rows.filter((r) => r.apn !== apn));
      toast.success("Removed from farm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function deleteFarm() {
    if (!confirm(`Delete farm "${farm.name}"? Leads are not deleted.`)) return;
    try {
      const res = await fetch(`/api/farms/${encodeURIComponent(farm.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      toast.success("Farm deleted");
      router.push("/farms");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/farms"
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            ← All farms
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
            {farm.name}
          </h1>
          <p className="text-sm text-slate-500">
            {memberRows.length} parcel{memberRows.length === 1 ? "" : "s"} ·{" "}
            <span
              className="inline-flex items-center gap-1"
              style={{ color: farm.color }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: farm.color }}
              />
              {farm.assignedTo}
            </span>
          </p>
        </div>
        <Button type="button" variant="destructive" size="sm" onClick={deleteFarm}>
          <Trash2 className="h-4 w-4" />
          Delete farm
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">Details</h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Assigned to</Label>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                {teamMembers.map((m) => (
                  <option key={m.email || m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Substation of interest</Label>
              <Input
                list="detail-farm-sub-names"
                value={substationOfInterest}
                onChange={(e) => setSubstationOfInterest(e.target.value)}
              />
              <datalist id="detail-farm-sub-names">
                {substationNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <Button type="button" onClick={saveMeta} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Territory</h2>
          <MarkersMap
            parcels={[]}
            substations={[]}
            center={mapCenter}
            height={320}
            farms={[farm]}
            showFarmLayer
            readOnlyMap
            highlightFarmId={farm.id}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Parcels in this farm
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">APN</th>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {memberRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No parcels in this farm yet.
                  </td>
                </tr>
              ) : (
                memberRows.map((row) => (
                  <tr key={row.apn} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs">{row.apn}</td>
                    <td className="px-4 py-2">
                      {row.lead?.propertyAddress || "—"}
                    </td>
                    <td className="px-4 py-2">
                      {row.lead?.ownerEntity || "—"}
                    </td>
                    <td className="px-4 py-2">
                      {row.lead?.status || "No lead record"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {row.addedVia}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.lead ? (
                        <Link
                          href={`/lead/${encodeURIComponent(row.apn)}`}
                          className="text-sky-700 hover:underline inline-flex items-center gap-0.5"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="ml-3 text-xs text-red-600 hover:underline"
                        onClick={() => removeMember(row.apn)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
