"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TeamMember } from "@/lib/types";

export type FarmDraftMeta = {
  name: string;
  assignedTo: string;
  substationOfInterest: string;
};

export function FarmSetupDialog({
  open,
  onOpenChange,
  teamMembers,
  substationNames,
  initialValues,
  onStartDrawing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: TeamMember[];
  substationNames: string[];
  /** Preserved when user discards a bad polygon and redraws */
  initialValues?: FarmDraftMeta | null;
  onStartDrawing: (meta: FarmDraftMeta) => void;
}) {
  const [name, setName] = useState(initialValues?.name || "");
  const [assignedTo, setAssignedTo] = useState(
    initialValues?.assignedTo || teamMembers[0]?.name || ""
  );
  const [substationOfInterest, setSubstationOfInterest] = useState(
    initialValues?.substationOfInterest || ""
  );

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      setName(initialValues.name);
      setAssignedTo(initialValues.assignedTo);
      setSubstationOfInterest(initialValues.substationOfInterest);
    } else {
      setName("");
      setAssignedTo(teamMembers[0]?.name || "");
      setSubstationOfInterest("");
    }
  }, [open, initialValues, teamMembers]);

  function handleStart() {
    if (!name.trim() || !assignedTo.trim()) return;
    onStartDrawing({
      name: name.trim(),
      assignedTo: assignedTo.trim(),
      substationOfInterest: substationOfInterest.trim(),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="center">
        <DialogHeader>
          <DialogTitle>New farm territory</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          Label the farm first, then draw its boundary on the map.
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="farm-setup-name">Farm name</Label>
            <Input
              id="farm-setup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Highland — Nick's farm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farm-setup-sub">Substation</Label>
            <Input
              id="farm-setup-sub"
              list="farm-setup-sub-names"
              value={substationOfInterest}
              onChange={(e) => setSubstationOfInterest(e.target.value)}
              placeholder="Substation of interest"
            />
            <datalist id="farm-setup-sub-names">
              {substationNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="farm-setup-assignee">Person in charge</Label>
            <select
              id="farm-setup-assignee"
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
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleStart}
              disabled={!name.trim() || !assignedTo.trim()}
            >
              Draw on map
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
