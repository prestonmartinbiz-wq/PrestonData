"use client";

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

const fields: { key: keyof Lead; label: string; multiline?: boolean }[] = [
  { key: "apn", label: "APN" },
  { key: "propertyAddress", label: "Property Address" },
  { key: "ownerEntity", label: "Owner Entity" },
  { key: "decisionMaker", label: "Decision Maker" },
  { key: "title", label: "Title" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "altPhone", label: "Alt Phone" },
  { key: "mailingAddress", label: "Mailing / RA Address", multiline: true },
  { key: "confidence", label: "Confidence" },
  { key: "sources", label: "Sources", multiline: true },
  { key: "notes", label: "Notes", multiline: true },
];

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
            <Label htmlFor={f.key}>{f.label}</Label>
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
