"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Table2, Upload, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrexiUpload } from "@/components/crm/crexi-upload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ParsedPower } from "@/lib/power";
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

const EMPTY_PARSED: ParsedPower = {
  substation: "",
  apn: "",
  address: "",
  isd: "",
  peakDemand: "",
  feeders: [],
  trenchingFt: null,
  trenchingSegments: 0,
  contactName: "",
  contactEmail: "",
  emailSubject: "",
  emailDate: "",
  sourceFile: "",
};

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ParsedPower | null>(null);

  async function onFile(file: File) {
    setParsing(true);
    setPreview(null);
    setUploadOpen(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/power?preview=1", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read email");
      setPreview({ ...EMPTY_PARSED, ...data.preview });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read email");
      setUploadOpen(false);
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!preview) return;
    if (!preview.substation.trim()) {
      toast.error("Substation is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: preview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(`Power added to ${data.added.substation}`);
      setUploadOpen(false);
      setPreview(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

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
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload power email (.eml)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".eml,message/rfc822,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
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
          to populate substation buckets.
        </div>
      )}

      <p className="text-xs text-slate-400">
        Source: {meta.source}
        {leadCount ? ` · ${leadCount} leads loaded` : ""}
      </p>

      <Dialog
        open={uploadOpen}
        onOpenChange={(o) => {
          setUploadOpen(o);
          if (!o) setPreview(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Power email → substation</DialogTitle>
          </DialogHeader>

          {parsing ? (
            <p className="py-8 text-center text-sm text-slate-500">Reading email…</p>
          ) : preview ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                We scraped the details below from{" "}
                <span className="font-medium text-slate-700">
                  {preview.sourceFile || "the email"}
                </span>
                . Confirm the substation, then add it to the board.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="pw-sub">Substation</Label>
                  <Input
                    id="pw-sub"
                    value={preview.substation}
                    onChange={(e) =>
                      setPreview({ ...preview, substation: e.target.value })
                    }
                    placeholder="e.g. Highland"
                  />
                </div>
                <div>
                  <Label htmlFor="pw-isd">ISD</Label>
                  <Input
                    id="pw-isd"
                    value={preview.isd}
                    onChange={(e) => setPreview({ ...preview, isd: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="pw-peak">Peak demand</Label>
                  <Input
                    id="pw-peak"
                    value={preview.peakDemand}
                    onChange={(e) =>
                      setPreview({ ...preview, peakDemand: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="pw-apn">APN</Label>
                  <Input
                    id="pw-apn"
                    value={preview.apn}
                    onChange={(e) => setPreview({ ...preview, apn: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="pw-addr">Address</Label>
                  <Input
                    id="pw-addr"
                    value={preview.address}
                    onChange={(e) => setPreview({ ...preview, address: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Feeders ({preview.feeders.length})</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {preview.feeders.length ? (
                    preview.feeders.map((f) => (
                      <Badge
                        key={f.id}
                        className="border-amber-200 bg-amber-50 text-amber-800"
                      >
                        {f.id} · {fmtMva(f.mva)}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">None detected</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-600">
                <span>
                  Trenching:{" "}
                  <span className="font-medium text-slate-900">
                    {preview.trenchingFt !== null
                      ? `${preview.trenchingFt.toLocaleString()} ft`
                      : "—"}
                  </span>
                  {preview.trenchingSegments
                    ? ` (${preview.trenchingSegments} segments)`
                    : ""}
                </span>
              </div>

              {preview.contactName || preview.contactEmail ? (
                <p className="text-xs text-slate-400">
                  From {preview.contactName}
                  {preview.contactEmail ? ` · ${preview.contactEmail}` : ""}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadOpen(false);
                    setPreview(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : `Add to ${preview.substation || "board"}`}
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              Choose a .eml file to continue.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
