"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicUser, SaveMeta, TeamMember } from "@/lib/types";

export function TeamPageClient({
  initialMembers,
  initialMeta,
  accounts,
  currentUsername,
  loggedIn,
}: {
  initialMembers: TeamMember[];
  initialMeta: SaveMeta;
  accounts: PublicUser[];
  currentUsername?: string;
  loggedIn?: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [meta, setMeta] = useState(initialMeta);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Account onboarding
  const [acctName, setAcctName] = useState("");
  const [acctEmail, setAcctEmail] = useState("");
  const [acctUsername, setAcctUsername] = useState("");
  const [acctPassword, setAcctPassword] = useState("");
  const [creating, setCreating] = useState(false);

  async function createAccount() {
    if (!acctUsername.trim() || acctPassword.length < 8) {
      toast.error("Pick a username and a password of at least 8 characters");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: acctUsername.trim(),
          password: acctPassword,
          name: acctName.trim(),
          email: acctEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create account");
      toast.success(`Account @${data.user.username} created — you're logged in`);
      // Reload so the header + accounts list reflect the new login.
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setCreating(false);
    }
  }

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

      {/* Account onboarding */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Set up your login</h2>
          {loggedIn ? (
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Logged in as @{currentUsername}
            </Badge>
          ) : (
            <Badge className="border-amber-200 bg-amber-50 text-amber-800">
              Guest (passcode)
            </Badge>
          )}
        </div>
        <p className="mb-3 text-sm text-slate-600">
          Create your own username &amp; password so you stay logged into your own
          account (and can get task emails). Others can keep using the shared
          passcode.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="acct-name">Full name</Label>
            <Input id="acct-name" value={acctName} onChange={(e) => setAcctName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-email">Email (for notifications)</Label>
            <Input
              id="acct-email"
              type="email"
              list="team-emails"
              value={acctEmail}
              onChange={(e) => setAcctEmail(e.target.value)}
            />
            <datalist id="team-emails">
              {members.map((m) => (
                <option key={m.email || m.name} value={m.email} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-username">Username</Label>
            <Input
              id="acct-username"
              value={acctUsername}
              onChange={(e) => setAcctUsername(e.target.value)}
              placeholder="3–32 chars: letters, numbers, . _ -"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acct-password">Password</Label>
            <Input
              id="acct-password"
              type="password"
              autoComplete="new-password"
              value={acctPassword}
              onChange={(e) => setAcctPassword(e.target.value)}
              placeholder="at least 8 characters"
            />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={createAccount} disabled={creating}>
            <UserCheck className="h-4 w-4" /> {creating ? "Creating…" : "Create my account"}
          </Button>
        </div>

        {accounts.length ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Accounts ({accounts.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                >
                  @{a.username}
                  {a.name && a.name !== a.username ? (
                    <span className="text-slate-400">· {a.name}</span>
                  ) : null}
                  {a.role === "admin" ? (
                    <span className="text-emerald-600">· admin</span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}
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
