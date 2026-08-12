"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PowerAvailability } from "@/lib/types";
import type { ParcelSummary, SubstationBucket } from "@/lib/substation";

function fmtMva(mva: number | null): string {
  return mva === null ? "—" : `${mva} MVA`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function PowerCard({
  record,
  onDelete,
  deleting,
}: {
  record: PowerAvailability;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {record.apn ? `APN ${record.apn}` : "Power availability"}
              {record.address ? ` · ${record.address}` : ""}
            </p>
            <p className="text-xs text-slate-500">
              {record.emailSubject || record.sourceFile || "Coordinator email"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(record.id)}
          disabled={deleting}
          title="Remove"
        >
          <Trash2 className="h-4 w-4 text-slate-400" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">ISD</p>
          <p className="text-sm font-medium text-slate-900">{record.isd || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            Peak demand
          </p>
          <p className="text-sm font-medium text-slate-900">
            {record.peakDemand || "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Feeders</p>
          <p className="text-sm font-medium text-slate-900">{record.feeders.length}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Trenching</p>
          <p className="text-sm font-medium text-slate-900">
            {record.trenchingFt !== null
              ? `${record.trenchingFt.toLocaleString()} ft`
              : "—"}
          </p>
        </div>
      </div>

      {record.feeders.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {record.feeders.map((f) => (
            <Badge key={f.id} className="border-amber-200 bg-white text-amber-800">
              {f.id} · {fmtMva(f.mva)}
            </Badge>
          ))}
        </div>
      ) : null}

      {record.contactName || record.contactEmail ? (
        <p className="mt-3 text-xs text-slate-400">
          From {record.contactName}
          {record.contactEmail ? ` · ${record.contactEmail}` : ""}
          {record.emailDate ? ` · ${record.emailDate}` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function SubstationDetail({
  bucket,
  parcels,
  power,
}: {
  bucket: SubstationBucket;
  parcels: ParcelSummary[];
  power: PowerAvailability[];
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deletePower(id: string) {
    if (!confirm("Remove this power-availability record?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/power?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast.success("Removed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/board"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Coverage board
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
              Substation
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{bucket.name}</h1>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">Open in leads</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Parcels" value={bucket.parcels} />
        <Stat label="Land" value={bucket.land} />
        <Stat label="Built" value={bucket.built} />
        <Stat label="No contact" value={bucket.noContact} />
        <Stat label="Worked" value={`${bucket.workedPct}%`} />
        <Stat label="Feeder MVA" value={fmtMva(bucket.totalMva)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Power availability{" "}
          <span className="text-slate-400">({power.length})</span>
        </h2>
        {power.length ? (
          <div className="grid gap-3">
            {power.map((record) => (
              <PowerCard
                key={record.id}
                record={record}
                onDelete={deletePower}
                deleting={deletingId === record.id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No power emails yet. Upload a coordinator .eml from the Coverage board to
            capture feeders, ISD, and trenching for this substation.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Parcels <span className="text-slate-400">({parcels.length})</span>
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">APN</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Acres</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map((p) => (
                  <tr key={p.apn} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{p.apn}</td>
                    <td className="max-w-[220px] truncate px-3 py-2">
                      {p.propertyAddress}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2">{p.ownerEntity}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{p.type || "—"}</td>
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-600">
                      {p.acres !== null ? p.acres.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge>{p.status || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {p.needsContact ? (
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
                {!parcels.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      No parcels in this substation yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
