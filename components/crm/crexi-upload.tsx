"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Upload Crexi export" button + dialog. Imports a Crexi property-export CSV and
 * tags every parcel with the chosen substation so it lands in that bucket.
 */
export function CrexiUpload({
  defaultSubstation = "",
  substationOptions = [],
  variant = "default",
  label = "Upload Crexi export",
}: {
  defaultSubstation?: string;
  substationOptions?: string[];
  variant?: "default" | "outline";
  label?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [substation, setSubstation] = useState(defaultSubstation);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!substation.trim()) {
      toast.error("Enter a substation");
      return;
    }
    if (!file) {
      toast.error("Choose a Crexi CSV file");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("substation", substation.trim());
      const res = await fetch("/api/leads/crexi", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      toast.success(
        `Imported ${data.imported} parcels into ${data.substation}` +
          (data.added ? ` (${data.added} new)` : "")
      );
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={() => {
          setSubstation(defaultSubstation);
          setFile(null);
          setOpen(true);
        }}
      >
        <Upload className="h-4 w-4" /> {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Crexi export</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Every parcel in this export is added to the substation you choose and
              merged into leads by APN.
            </p>
            <div>
              <Label htmlFor="crexi-sub">Substation</Label>
              <Input
                id="crexi-sub"
                list="crexi-sub-options"
                value={substation}
                onChange={(e) => setSubstation(e.target.value)}
                placeholder="e.g. Highland"
              />
              <datalist id="crexi-sub-options">
                {substationOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="crexi-file">Crexi CSV</Label>
              <input
                id="crexi-file"
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-white hover:file:bg-slate-800"
              />
              {file ? (
                <p className="mt-1 text-xs text-slate-500">{file.name}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? "Importing…" : "Import parcels"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
