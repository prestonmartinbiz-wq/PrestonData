"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";

export function Providers({
  children,
  clerkEnabled,
}: {
  children: React.ReactNode;
  clerkEnabled: boolean;
}) {
  const body = (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  );

  if (!clerkEnabled) return body;

  return <ClerkProvider>{body}</ClerkProvider>;
}
