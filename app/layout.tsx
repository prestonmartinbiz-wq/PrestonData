import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { clerkConfigured } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RMax CRM",
  description: "Ownership and outreach CRM for RMax land acquisition",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const clerkEnabled = clerkConfigured();

  return (
    <html
      lang="en"
      className={geistSans.variable + " " + geistMono.variable + " h-full antialiased"}
    >
      <body className="min-h-full flex flex-col">
        <Providers clerkEnabled={clerkEnabled}>{children}</Providers>
      </body>
    </html>
  );
}
