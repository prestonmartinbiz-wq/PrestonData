"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Table2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CrexiUpload } from "@/components/crm/crexi-upload";
import { PowerForm } from "@/components/crm/power-form";
import type { SaveMeta } from "@/lib/types";
import type { SubstationBucket } from "@/lib/substation";

function fmtMva(mva: number | null): string {
  if (mva === null) return "—";
  return `${mva} MVA`;
}

function PowerSummaryLine({ bucket }: { bucket: SubstationBucket }) {
  if (!bucket.power.length) return null;
  const isd = bucket.power.map((p) => p.isd).filter(Boolean)[0];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
      <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="font-medium">{bucket.feederCount} feeders</span>
      {bucket.totalMva !== null ? <span>· {fmtMva(bucket.totalMva)} avail</span> : null}
      {isd ? <span>· ISD {isd}</span> : null}
    </div>
  );
}

function BucketCard({ bucket }: { bucket: SubstationBucket }) {
  return (
    <Link
      href={`/substation/${bucket.slug}`}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Substation
          </p>
          <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">
            {bucket.name}
          </h3>
          {bucket.location ? (
            <p className="mt-0.5 text-xs text-slate-400">{bucket.location}</p>
          ) : null}
          {bucket.members.length > 1 ? (
            <p className="mt-0.5 text-[11px] text-slate-400">
              Group: {bucket.members.join(" + ")}
            </p>
          ) : null}
        </div>
        <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums text-slate-900">
          {bucket.parcels}
        </span>
        <span className="text-sm text-slate-500">parcels</span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{bucket.worked} worked</span>
          <span className="tabular-nums">{bucket.workedPct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-amber-400"
            style={{ width: `${Math.min(100, bucket.workedPct)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge className="border-slate-200 bg-slate-50 text-slate-600">
          {bucket.land} land
        </Badge>
        <Badge className="border-slate-200 bg-slate-50 text-slate-600">
          {bucket.built} built
        </Badge>
        {bucket.noContact > 0 ? (
          <Badge className="border-rose-200 bg-rose-50 text-rose-700">
            {bucket.noContact} no contact
          </Badge>
        ) : null}
      </div>

      <PowerSummaryLine bucket={bucket} />
    </Link>
  );
}

export function CoverageBoard({
  initialBuckets,
  leadCount,
  meta,
}: {
  initialBuckets: SubstationBucket[];
  leadCount: number;
  meta: SaveMeta;
}) {
  const router = useRouter();
  const [powerOpen, setPowerOpen] = useState(false);

  const totalParcels = initialBuckets.reduce((a, b) => a + b.parcels, 0);
  const withPower = initialBuckets.filter((b) => b.power.length).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
            Outreach by substation
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Coverage board</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every parcel we&apos;re working, bucketed by its substation.{" "}
            <span className="text-slate-400">
              {totalParcels} parcels · {initialBuckets.length} substations · {withPower}{" "}
              with power data
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">
              <Table2 className="h-4 w-4" /> All leads
            </Link>
          </Button>
          <CrexiUpload
            variant="outline"
            substationOptions={initialBuckets.map((b) => b.name)}
          />
          <Button size="sm" onClick={() => setPowerOpen(true)}>
            <Zap className="h-4 w-4" /> Add power data
          </Button>
        </div>
      </div>

      {initialBuckets.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initialBuckets.map((bucket) => (
            <BucketCard key={bucket.slug} bucket={bucket} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          No parcels yet. Import leads from the{" "}
          <Link href="/dashboard" className="font-medium text-slate-900 underline">
            leads page
          </Link>{" "}
          or add a Crexi export to populate substation buckets.
        </div>
      )}

      <p className="text-xs text-slate-400">
        Source: {meta.source}
        {leadCount ? ` · ${leadCount} leads loaded` : ""}
      </p>

      <Dialog open={powerOpen} onOpenChange={setPowerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add power data to a substation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Upload the coordinator .eml, paste the NVE email text, or type the details
            in — then pick the substation it belongs to.
          </p>
          <PowerForm
            title="Power availability"
            onSaved={() => {
              setPowerOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
