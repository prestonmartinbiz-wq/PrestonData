# RMax CRM

Ownership / outreach CRM for RMax land acquisition. Team login via Clerk, CSV leads, assignment by email, and persistence to GitHub Contents API.

## Features

- Clerk-protected CRM routes (demo mode when Clerk keys are missing)
- Leads dashboard: search, filter (status / assignee / needs contact / my leads), sort, row drawer edit
- CRUD + CSV import (merge by normalized APN; preserve Assigned To unless CSV provides it)
- Team page (name + email) saved with leads data
- Production source of truth: GitHub repo prestonmartinbiz-wq/PrestonData (data/leads.csv, data/team.json)
- Local fallback when GITHUB_TOKEN is unset

## Setup

```bash
cd /workspace/rmax-crm
cp .env.example .env.local
# fill in Clerk + GitHub values
bun install
bun run dev
```

Open http://localhost:3000 — redirects to /dashboard.

### Environment

See .env.example:

- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
- CLERK_SECRET_KEY
- NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
- NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
- GITHUB_TOKEN
- GITHUB_OWNER=prestonmartinbiz-wq
- GITHUB_REPO=PrestonData
- ALLOWED_EMAILS (optional comma-separated allowlist)

Without real Clerk keys the app runs in demo mode (no login gate). Without GITHUB_TOKEN it reads/writes local data/ files (fine for local demo; use a GitHub token on Vercel).

### GitHub data repo

Ensure main has data/leads.csv and data/team.json. Seed copies are included under data/ in this project.

### Build

```bash
bun run build
```

Build succeeds without real Clerk/GitHub secrets (demo/local fallbacks).

## Key routes

- / → redirects to dashboard
- /dashboard → leads table + import/export + edit drawer
- /team → add/remove team members
- /sign-in, /sign-up → Clerk auth
- /api/leads → GET/POST/PUT/DELETE
- /api/leads/import → CSV import merge
- /api/team → GET/PUT
- /api/meta → save source metadata

## Stack

Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix UI, Clerk, Octokit, Papa Parse.
