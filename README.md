# Yala-Gam3ya · يلا جمعية

> **Your Gam3ya, Organized.** — جمعيتك متظبطة، دورك معروف.

A mobile-first, bilingual (Arabic default / English) web app for organizing Egyptian rotating savings groups (Gam3yas). It is **organizational software only**: it never collects, holds, transfers or guarantees money, and every status is an informational record — never a verified bank transaction.

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui-style components on Radix · PostgreSQL (Supabase) · Supabase Auth · Row Level Security · Drizzle ORM · Zod · next-intl · Recharts · Lucide · Vitest · Playwright · Vercel.

## What's implemented
| Area | Status |
|---|---|
| Calculation engine (integer piasters, split ½ shares, month-end/leap-year dates, statuses, lifecycle, projections, what-if) | ✅ 100% unit-tested core |
| Database schema, migrations, RLS, grants, append-only audit, privileged RPCs | ✅ tested on real Postgres |
| Auth: invite-only, password reset, MFA (TOTP) required for super admins, deactivation (ban + RLS) | ✅ |
| Member: dashboard (KPIs, deadlines, countdown, insights, 12-month chart, notifications, activity), Gam3ya detail (3 tabs), monthly overview + calendar, history, what-if simulator, settings, privacy mode | ✅ |
| Organizer: record contributions/payouts, waive with reason, delays, propose turn swaps, CSV/PDF export | ✅ |
| Admin: overview, users (invite/roles/deactivate), Gam3ya wizard (6 steps), change-request review, reports, audit log, policy versions, restore from archive | ✅ |
| Notifications: in-app + email (provider abstraction; console in dev), idempotent daily job (Vercel Cron) | ✅ |
| Legal: Terms, Privacy, Disclaimer, Subscription, Contact (AR+EN drafts, flagged for counsel) | ✅ drafts |
| Subscriptions | 🗂 schema only — billing intentionally **not** active |
| PWA | ⏭ after MVP is stable |

## Quick start (local)
```bash
cp .env.example .env.local     # fill Supabase + database values
npm install
npm run db:migrate             # applies drizzle/*.sql (tables + security)
SEED_ALLOW=true npm run db:seed   # optional demo data (dev only)
npm run dev
```

## Tests
```bash
npm run test:unit      # engine + helpers (no DB needed)
npm run test:db        # RLS/security/lifecycle on a real Postgres (see below)
npm run test:e2e       # Playwright; builds must exist (npm run build)
npm run check          # typecheck + lint + all vitest projects
```
`test:db` needs a local Postgres superuser at `postgres://postgres:postgres@localhost:5432` (override with `TEST_DATABASE_ADMIN_URL`). It recreates a scratch DB, loads a Supabase stub (`tests/db/supabase-stub.sql` — reproduces Supabase's permissive default grants on purpose) and runs every migration.

## Project layout
```
src/lib/engine/        pure calculation engine (money, dates, schedule, validation, status, summary, simulator)
src/lib/db/            Drizzle schema + RLS-scoped transaction helpers
src/lib/gam3ya/        domain services (drafts/activation, recording, read models)
src/lib/notifications/ provider abstraction, renderer, daily job
src/app/(app)/         member, organizer and admin pages
src/app/(auth)/        sign-in, reset, MFA, onboarding
src/app/(public)/      legal pages
drizzle/               migrations: 0000 tables · 0001 security · 0002 policies · 0003 notification triggers · 0004 admin helpers · 0005 reminders · 0006
tests/db/              database-level security tests
tests/e2e/             Playwright
docs/                  architecture, deployment, security & legal checklists
```

## Docs
- [Architecture, business rules & permission matrix](docs/ARCHITECTURE.md)
- [Deployment: Supabase + Vercel](docs/DEPLOYMENT.md)
- [Security checklist](docs/SECURITY_CHECKLIST.md)
- [Legal review checklist](docs/LEGAL_REVIEW_CHECKLIST.md)
