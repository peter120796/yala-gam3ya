# Yala-Gam3ya · يلا جمعية

> **Your Gam3ya, Organized.** — جمعيتك متظبطة، دورك معروف.

A mobile-first, bilingual (Arabic default / English) web app for organizing Egyptian rotating savings groups (Gam3yas). It is **organizational software only**: it never collects, holds, transfers or guarantees money, and every status is an informational record — never a verified bank transaction.

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui-style components on Radix · **Firebase**: Auth (email/password, TOTP MFA via Identity Platform, session cookies), Cloud Firestore (server-only, deny-all rules), App Hosting, Cloud Scheduler · Zod · next-intl · Recharts · Lucide · Vitest · Playwright.

## What's implemented
| Area | Status |
|---|---|
| Calculation engine (integer piasters, split ½ shares, month-end/leap-year dates, statuses, lifecycle, projections, what-if) | ✅ 100% unit-tested core |
| Firestore data model, deny-all rules, server-side authorization (`src/lib/data/policy.ts`), transactional writes with history + audit | ✅ unit + integration tested |
| Auth: self sign-up **pending admin approval** (bulk approve/reject), invitations with set-password link, password reset, TOTP MFA for super admins, deactivation (disable + revoke) | ✅ |
| Member: dashboard (KPIs, deadlines, countdown, insights, 12-month chart, notifications, activity), Gam3ya detail (3 tabs), monthly overview + calendar, history, what-if simulator, settings, privacy mode | ✅ |
| Organizer: record contributions/payouts, waive with reason, delays, propose turn swaps, CSV/PDF export | ✅ |
| Admin: overview, users (invite/roles/deactivate), Gam3ya wizard (6 steps), change-request review, reports, audit log, policy versions, restore from archive | ✅ |
| Notifications: in-app + email (provider abstraction; console in dev), idempotent daily job (Cloud Scheduler → `/api/cron/daily`) | ✅ |
| Legal: Terms, Privacy, Disclaimer, Subscription, Contact (AR+EN drafts, flagged for counsel) | ✅ drafts |
| Subscriptions | 🗂 schema only — billing intentionally **not** active |
| PWA | ⏭ after MVP is stable |

## Quick start (local)
```bash
cp .env.example .env.local        # Firebase web config + a service-account JSON (or emulators)
npm install
npm run dev
```
Deploying: follow **docs/DEPLOYMENT.md** step by step.

## Tests
```bash
npm run test:unit         # engine, permission rules, reminders, cookies, CSV, i18n
npm run test:integration  # real data-layer services on an in-memory Firestore
npm run test:emulator     # same integration tests on the Firestore emulator (needs Java + firebase-tools)
npm run test:e2e          # Playwright (after npm run build)
npm run check             # typecheck + lint + unit + integration
```

## Project layout
```
src/lib/engine/        pure calculation engine (money, dates, schedule, validation, status, summary, simulator)
src/lib/data/          Firestore model, permission rules (policy.ts), services, read models
src/lib/firebase/      Admin SDK (server) and Auth (browser) setup
src/lib/notifications/ provider abstraction, renderer, daily job
src/app/(app)/         member, organizer and admin pages
src/app/(auth)/        sign-in, reset, MFA, onboarding
src/app/(public)/      legal pages
firestore.rules        deny-all (browser never touches Firestore)
firestore.indexes.json composite indexes used by the queries
apphosting.yaml        App Hosting env + secrets
tests/integration/     service tests (in-memory Firestore or emulator)
tests/e2e/             Playwright
docs/                  architecture, deployment, security & legal checklists
```

## Docs
- [Architecture, business rules & permission matrix](docs/ARCHITECTURE.md)
- [Deployment: Firebase App Hosting](docs/DEPLOYMENT.md)
- [Security checklist](docs/SECURITY_CHECKLIST.md)
- [Legal review checklist](docs/LEGAL_REVIEW_CHECKLIST.md)
