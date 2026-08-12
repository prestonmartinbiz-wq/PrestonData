"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ClerkUserButton = dynamic(
  () => import("@/components/crm/clerk-user-button").then((m) => m.ClerkUserButton),
  { ssr: false }
);

const nav = [
  { href: "/board", label: "Board" },
  { href: "/dashboard", label: "Leads" },
  { href: "/team", label: "Team" },
];

export function AppShell({
  children,
  userEmail,
  clerkEnabled,
}: {
  children: React.ReactNode;
  userEmail?: string;
  clerkEnabled: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/board" className="font-semibold tracking-tight">
              RMax CRM
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const active =
                  pathname.startsWith(item.href) ||
                  (item.href === "/board" && pathname.startsWith("/substation"));
                return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium",
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {item.label}
                </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            {userEmail ? <span className="hidden sm:inline">{userEmail}</span> : null}
            {clerkEnabled ? (
              <ClerkUserButton />
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                Demo mode
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
