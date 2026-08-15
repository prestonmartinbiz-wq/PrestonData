"use client";

import { Suspense, useState } from "react";
import { Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tab = "login" | "passcode";

function UnlockInner() {
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function nextUrl(): string {
    if (typeof window === "undefined") return "/board";
    return new URLSearchParams(window.location.search).get("next") || "/board";
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, next: nextUrl() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect username or password");
        return;
      }
      window.location.href = data.next || "/board";
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passcode, next: nextUrl() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect passcode");
        return;
      }
      window.location.href = data.next || "/board";
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">RMax CRM</h1>
            <p className="text-xs text-slate-500">Sign in to continue</p>
          </div>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setError("");
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 font-medium",
              tab === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            )}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("passcode");
              setError("");
            }}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 font-medium",
              tab === "passcode" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            )}
          >
            Passcode
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={login} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourname"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !username || !password}
            >
              <User className="h-4 w-4" /> {busy ? "Signing in…" : "Log in"}
            </Button>
            <p className="text-center text-xs text-slate-400">
              No account yet? Enter with the passcode, then set one up on the Team
              page.
            </p>
          </form>
        ) : (
          <form onSubmit={unlock} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="passcode">Team passcode</Label>
              <Input
                id="passcode"
                type="password"
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !passcode}>
              <Lock className="h-4 w-4" /> {busy ? "Checking…" : "Enter"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <Suspense>
      <UnlockInner />
    </Suspense>
  );
}
