"use client";

import { useState } from "react";
import { toast } from "sonner";
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
import type { FarmBoundary, TeamMember } from "@/lib/types";

export function FarmSaveDialog({
  open,
  onOpenChange,
  boundary,
  teamMembers,
  substationNames,
  suggestedName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boundary: FarmBoundary | null;
  teamMembers: TeamMember[];
  substationNames: string[];
  suggestedName?: string;
  onSaved?: (farmId: string) => void;
}) {
  const [name, setName] = useState(suggestedName || "");
  const [assignedTo, setAssignedTo] = useState(teamMembers[0]?.name || "");
  const [substationOfInterest, setSubstationOfInterest] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!boundary) return;
    if (!name.trim()) {
      toast.error("Farm name is required");
      return;
    }
    if (!assignedTo.trim()) {
      toast.error("Assign a team member");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/farms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          assignedTo: assignedTo.trim(),
          substationOfInterest: substationOfInterest.trim(),
          notes: notes.trim(),
          boundary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save farm");
      toast.success(
        `Farm saved with ${data.farm?.members?.length ?? 0} parcel(s)`
      );
      onOpenChange(false);
      onSaved?.(data.farm?.id);
      setName("");
      setSubstationOfInterest("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save farm");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!saving) onOpenChange(v);
      }}
    >
      <DialogContent variant="center">
        <DialogHeader>
          <DialogTitle>Save farm territory</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="farm-name">Farm name</Label>
            <Input
              id="farm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Highland — Nick's farm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farm-assignee">Assigned to</Label>
            <select
              id="farm-assignee"
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
          <div className="space-y-1.5">
            <Label htmlFor="farm-sub">Substation of interest (optional)</Label>
            <Input
              id="farm-sub"
              list="farm-sub-names"
              value={substationOfInterest}
              onChange={(e) => setSubstationOfInterest(e.target.value)}
              placeholder="Expected substation"
            />
            <datalist id="farm-sub-names">
              {substationNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farm-notes">Notes (optional)</Label>
            <Textarea
              id="farm-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || !boundary}>
              {saving ? "Saving…" : "Save farm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
