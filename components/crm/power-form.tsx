"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Keyboard, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { feedersToText, parseFeederText, type ParsedPower } from "@/lib/power";

type Method = "eml" | "text" | "manual";

type FormState = {
  substation: string;
  apn: string;
  address: string;
  isd: string;
  peakDemand: string;
  feedersText: string;
  trenchingFt: string;
  contactName: string;
  contactEmail: string;
  emailSubject: string;
  emailDate: string;
  sourceFile: string;
};

const EMPTY_FORM: FormState = {
  substation: "",
  apn: "",
  address: "",
  isd: "",
  peakDemand: "",
  feedersText: "",
  trenchingFt: "",
  contactName: "",
  contactEmail: "",
  emailSubject: "",
  emailDate: "",
  sourceFile: "",
};

function fromParsed(p: ParsedPower, substationFallback: string): FormState {
  return {
    substation: p.substation || substationFallback,
    apn: p.apn || "",
    address: p.address || "",
    isd: p.isd || "",
    peakDemand: p.peakDemand || "",
    feedersText: feedersToText(p.feeders || []),
    trenchingFt: p.trenchingFt !== null ? String(p.trenchingFt) : "",
    contactName: p.contactName || "",
    contactEmail: p.contactEmail || "",
    emailSubject: p.emailSubject || "",
    emailDate: p.emailDate || "",
    sourceFile: p.sourceFile || "",
  };
}

/**
 * Add power-availability data to a substation via three interchangeable methods:
 * upload the coordinator .eml, paste the NVE email text, or type it in manually.
 * All three converge on the same editable fields and save to /api/power.
 */
export function PowerForm({
  defaultSubstation = "",
  onSaved,
  title = "Add power data",
  defaultMethod = "eml",
}: {
  defaultSubstation?: string;
  onSaved?: () => void;
  title?: string;
  defaultMethod?: Method;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<Method>(defaultMethod);
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    substation: defaultSubstation,
  });
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  function applyParsed(parsed: ParsedPower) {
    setForm((f) => fromParsed(parsed, f.substation || defaultSubstation));
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/power?preview=1", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read email");
      applyParsed(data.preview);
      toast.success("Scraped from email — review and save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read email");
    } finally {
      setBusy(false);
    }
  }

  async function scrapeText() {
    if (!pasteText.trim()) {
      toast.error("Paste the NVE email text first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not parse text");
      applyParsed(data.preview);
      toast.success("Scraped from text — review and save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse text");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form.substation.trim()) {
      toast.error("Substation is required");
      return;
    }
    setSaving(true);
    try {
      const item: ParsedPower = {
        substation: form.substation.trim(),
        apn: form.apn.trim(),
        address: form.address.trim(),
        isd: form.isd.trim(),
        peakDemand: form.peakDemand.trim(),
        feeders: parseFeederText(form.feedersText),
        trenchingFt: form.trenchingFt.trim()
          ? Number(form.trenchingFt.replace(/,/g, "")) || null
          : null,
        trenchingSegments: 0,
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        emailSubject: form.emailSubject.trim(),
        emailDate: form.emailDate.trim(),
        sourceFile: form.sourceFile.trim(),
      };
      const res = await fetch("/api/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(`Power added to ${data.added.substation}`);
      setForm({ ...EMPTY_FORM, substation: defaultSubstation });
      setPasteText("");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const methods: { id: Method; label: string; icon: typeof Upload }[] = [
    { id: "eml", label: "Upload .eml", icon: Upload },
    { id: "text", label: "Paste NVE text", icon: FileText },
    { id: "manual", label: "Enter manually", icon: Keyboard },
  ];

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>

      <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {methods.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                method === m.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {method === "eml" ? (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept=".eml,message/rfc822,text/plain"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-white hover:file:bg-slate-800"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
            disabled={busy}
          />
          <p className="mt-1 text-xs text-slate-400">
            {busy ? "Reading…" : "Fields below fill in automatically once parsed."}
          </p>
        </div>
      ) : null}

      {method === "text" ? (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={5}
            placeholder="Paste the NVE coordinator email text here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <Button type="button" variant="secondary" size="sm" onClick={scrapeText} disabled={busy}>
            {busy ? "Scraping…" : "Scrape text"}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="pf-sub">Substation</Label>
          <Input
            id="pf-sub"
            value={form.substation}
            onChange={(e) => set({ substation: e.target.value })}
            placeholder="e.g. Highland"
          />
        </div>
        <div>
          <Label htmlFor="pf-isd">ISD</Label>
          <Input id="pf-isd" value={form.isd} onChange={(e) => set({ isd: e.target.value })} placeholder="Q2 2027" />
        </div>
        <div>
          <Label htmlFor="pf-peak">Peak demand</Label>
          <Input
            id="pf-peak"
            value={form.peakDemand}
            onChange={(e) => set({ peakDemand: e.target.value })}
            placeholder="10 MW and 15 MW"
          />
        </div>
        <div>
          <Label htmlFor="pf-apn">APN</Label>
          <Input id="pf-apn" value={form.apn} onChange={(e) => set({ apn: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="pf-addr">Address</Label>
          <Input id="pf-addr" value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label htmlFor="pf-feeders">Feeders</Label>
          <Input
            id="pf-feeders"
            value={form.feedersText}
            onChange={(e) => set({ feedersText: e.target.value })}
            placeholder="HI-1222:6.5, HI-1225:8, HI-1206:0.5"
          />
          <p className="mt-1 text-xs text-slate-400">
            Format: ID:MVA, comma-separated. kVA is fine too (e.g. HI-1206 500 kVA).
          </p>
        </div>
        <div>
          <Label htmlFor="pf-trench">Trenching (ft)</Label>
          <Input
            id="pf-trench"
            value={form.trenchingFt}
            onChange={(e) => set({ trenchingFt: e.target.value })}
            placeholder="5300"
          />
        </div>
        <div>
          <Label htmlFor="pf-cname">Coordinator</Label>
          <Input
            id="pf-cname"
            value={form.contactName}
            onChange={(e) => set({ contactName: e.target.value })}
            placeholder="Chad Jacks"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="pf-cemail">Coordinator email</Label>
          <Input
            id="pf-cemail"
            value={form.contactEmail}
            onChange={(e) => set({ contactEmail: e.target.value })}
            placeholder="name@nvenergy.com"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Add power data"}
        </Button>
      </div>
    </div>
  );
}
