# Deployment — Supabase + Vercel

## 1. Supabase
1. Create a project — region **Frankfurt (eu-central-1)** is closest to Egypt (see legal checklist re: cross-border transfer).
2. **Auth → Providers:** Email enabled, **disable public sign-ups** ("Allow new users to sign up" off — accounts are invite-only).
3. **Auth → MFA:** enable TOTP.
4. **Auth → URL configuration:** Site URL = your production URL; add `https://<domain>/auth/confirm` to redirect URLs (and preview URLs if needed).
5. **Auth → Email templates** — point links at the server route (works without PKCE):
   - Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password`
   Translate the email bodies to Arabic/English as you prefer.
6. **Auth → SMTP:** configure a real SMTP sender (Supabase's built-in sender is heavily rate-limited).
7. **Data API:** this app does not use PostgREST. Recommended: remove `public` from exposed schemas (or disable the Data API) for defence in depth. RLS + revoked grants protect it either way.
8. Copy keys (Project Settings → API) and connection strings (Database → Connect): transaction pooler (6543) for `DATABASE_URL`, session pooler/direct (5432) for `DATABASE_URL_DIRECT`.
9. Run migrations from your machine:
   ```bash
   DATABASE_URL_DIRECT=... npm run db:migrate
   ```
10. **Create the first super admin:** Auth → Users → "Invite user" (your email). After accepting the invite, in SQL editor:
    ```sql
    update public.profiles set platform_role = 'super_admin' where email = 'you@example.com';
    ```
    Sign in → you'll be asked to enroll TOTP → admin area unlocked.
11. **Backups:** enable Point-in-Time Recovery (Pro plan) and **test a restore** into a branch/new project before launch.

## 2. Vercel
1. Import the GitHub repo (framework auto-detected).
2. Environment variables (Production + Preview) — from `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `CRON_SECRET`, and when ready `NOTIFICATIONS_EMAIL_ENABLED=true`, `RESEND_API_KEY`, `EMAIL_FROM`.
3. Region: **fra1** (Frankfurt) next to the database (Project → Settings → Functions).
4. Cron: `vercel.json` schedules `/api/cron/daily` at 05:00 UTC (07:00 Cairo). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
5. Deploy. Smoke test: `/login` (Arabic RTL), invite a user, accept, onboarding, create a Gam3ya, record a payment.

## 3. Sentry (optional, recommended)
`npx @sentry/wizard@latest -i nextjs` on your machine, then set `SENTRY_DSN`. Keep `sendDefaultPii: false` and scrub emails/phones in `beforeSend`.

## 4. Release checklist
- [ ] `npm run check` green, `npm run build` green
- [ ] Migrations applied to production
- [ ] First admin enrolled in MFA
- [ ] Restore test done
- [ ] Legal checklist signed off by counsel
