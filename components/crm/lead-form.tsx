"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { EMPTY_LEAD, LEAD_STATUSES, type Lead, type TeamMember } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyLinks } from "@/components/crm/property-links";
import { getPhones, withPhones } from "@/lib/phones";

const fields: { key: keyof Lead; label: string; multiline?: boolean }[] = [
  { key: "apn", label: "APN" },
  { key: "propertyAddress", label: "Property Address" },
  { key: "ownerEntity", label: "Owner Entity" },
  { key: "decisionMaker", label: "Decision Maker" },
  { key: "title", label: "Title" },
  { key: "email", label: "Email" },
  { key: "mailingAddress", label: "Mailing / RA Address", multiline: true },
  { key: "confidence", label: "Confidence" },
  { key: "sources", label: "Sources", multiline: true },
  { key: "notes", label: "Notes", multiline: true },
];

function PhoneEditor({
  lead,
  onChange,
}: {
  lead: Lead;
  onChange: (lead: Lead) => void;
}) {
  const phones = getPhones(lead);
  const [newPhone, setNewPhone] = useState("");

  const addPhone = () => {
    if (!newPhone.trim()) return;
    onChange(withPhones(lead, [...phones, newPhone]));
    setNewPhone("");
  };

  return (
    <div className="space-y-1.5">
      <Label>Phone numbers</Label>
      <div className="space-y-2">
        {phones.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={p}
              onChange={(e) => {
                const next = [...phones];
                next[i] = e.target.value;
                onChange(withPhones(lead, next));
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Remove (doesn't work)"
              onClick={() => onChange(withPhones(lead, phones.filter((_, j) => j !== i)))}
            >
              <Trash2 className="h-4 w-4 text-slate-400" />
            </Button>
          </div>
        ))}
        {!phones.length ? (
          <p className="text-xs text-slate-400">No phone numbers on file.</p>
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            value={newPhone}
            placeholder="Add another phone number"
            onChange={(e) => setNewPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPhone();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addPhone}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LeadForm({
  lead,
  team,
  currentUserEmail,
  onChange,
  onSubmit,
  onDelete,
  saving,
  mode,
}: {
  lead: Lead;
  team: TeamMember[];
  currentUserEmail?: string;
  onChange: (lead: Lead) => void;
  onSubmit: () => void;
  onDelete?: () => void;
  saving?: boolean;
  mode: "create" | "edit";
}) {
  const assignees = Array.from(
    new Set(
      [...team.map((t) => t.email).filter(Boolean), currentUserEmail || ""].filter(Boolean)
    )
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.key === "apn" ? (
                <PropertyLinks
                  apn={lead.apn}
                  propertyAddress={lead.propertyAddress}
                  lat={lead.latitude}
                  lng={lead.longitude}
                />
              ) : null}
            </div>
            {f.multiline ? (
              <Textarea
                id={f.key}
                value={lead[f.key]}
                disabled={mode === "edit" && f.key === "apn"}
                onChange={(e) => onChange({ ...lead, [f.key]: e.target.value })}
              />
            ) : (
              <Input
                id={f.key}
                value={lead[f.key]}
                disabled={mode === "edit" && f.key === "apn"}
                onChange={(e) => onChange({ ...lead, [f.key]: e.target.value })}
                required={f.key === "apn"}
              />
            )}
          </div>
        ))}

        <PhoneEditor lead={lead} onChange={onChange} />

        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={lead.status || "New"}
            onValueChange={(v) => onChange({ ...lead, status: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set([...(LEAD_STATUSES as readonly string[]), lead.status].filter(Boolean))).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Assigned To</Label>
          <Select
            value={lead.assignedTo || "__unassigned__"}
            onValueChange={(v) =>
              onChange({ ...lead, assignedTo: v === "__unassigned__" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {assignees.map((email) => (
                <SelectItem key={email} value={email}>
                  {email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        {mode === "edit" && onDelete ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={saving}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={saving || !(lead.apn || "").trim()}>
          {saving ? "Saving..." : mode === "create" ? "Add lead" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

export { EMPTY_LEAD };
