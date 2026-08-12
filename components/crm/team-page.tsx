"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaveMeta, TeamMember } from "@/lib/types";

export function TeamPageClient({
  initialMembers,
  initialMeta,
}: {
  initialMembers: TeamMember[];
  initialMeta: SaveMeta;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [meta, setMeta] = useState(initialMeta);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: TeamMember[]) {
    setSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: { members: next } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMembers(data.team.members);
      setMeta(data.meta);
      toast.success("Team saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function addMember() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const next = [...members, { name: name.trim(), email: email.trim().toLowerCase() }];
    setName("");
    setEmail("");
    void save(next);
  }

  function removeMember(idx: number) {
    const next = members.filter((_, i) => i !== idx);
    void save(next);
  }

  const lastSaved = meta.lastSavedAt
    ? new Date(meta.lastSavedAt).toLocaleString()
    : "unknown";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-slate-500">
          Source: <Badge className="ml-1">{meta.source}</Badge>
          <span className="ml-2">Last saved: {lastSaved}</span>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Members appear in the Assigned To picker. Use work emails so My leads works.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={addMember} disabled={saving}>
            <Plus className="h-4 w-4" /> Add member
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((m, idx) => (
              <tr key={m.name + m.email + idx} className="border-t border-slate-100">
                <td className="px-3 py-2">{m.name}</td>
                <td className="px-3 py-2 text-slate-600">{m.email || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMember(idx)}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </td>
              </tr>
            ))}
            {!members.length ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-slate-500">
                  No team members yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
