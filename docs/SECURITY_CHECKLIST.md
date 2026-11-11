# Security checklist

| Control | Where | Verified by |
|---|---|---|
| RLS on every table; anon has no table access | `drizzle/0001_security.sql` | `tests/db` "baseline grants" |
| Supabase default grants revoked & re-granted minimally | 0001 | DB tests run against a stub with Supabase defaults |
| Members can't read others' obligations/payouts/profiles (IDOR) | RLS + RPCs | DB tests "member isolation" |
| Organizers scoped to assigned Gam3yas | `app.is_organizer_of` | DB tests "organizer scoping" |
| Super admin requires MFA (aal2) in the DB | `app.is_super_admin` | DB test "aal1 cannot create" |
| Financial writes only via audited definer functions | 0001 | DB tests |
| Config frozen after activation; status not directly updatable | trigger | DB tests |
| Activation re-verifies the whole schedule in SQL | `app.activate_gam3ya` | DB test "forged schedule" |
| Append-only history & audit (even for owner role) | triggers | DB test |
| Server runs queries as the user (RLS applies to Drizzle) | `runAsUser` | DB tests use the same helper |
| Zod validation on all inputs; safe error codes only | `src/lib/actions.ts` | unit/DB |
| CSRF: Server Actions check Origin; GET routes are read-only | Next.js | — |
| Open-redirect protection on `next=` | `safeNext`, confirm route | review |
| Rate limiting (per-instance) on actions, login, reset, export | `src/lib/rate-limit.ts` | — (swap to Redis for multi-instance strictness) |
| No account enumeration on reset | `requestPasswordResetAction` | review |
| Passwords never stored/seen by the app (Supabase Auth) | — | — |
| Service-role key server-only (`server-only` import) | `src/lib/supabase/admin.ts` | build |
| Cron endpoint protected by constant-time secret compare | `/api/cron/daily` | e2e |
| CSV formula-injection neutralised | `src/lib/export/csv.ts` | unit |
| Security headers (HSTS, nosniff, frame deny, referrer, permissions) | `next.config.ts` | — |
| Logs avoid PII (masked emails, no tokens) | provider/actions | review |
| Deactivation = DB flag + Auth ban, history retained | admin actions | DB test |

## Before launch
- [ ] Disable public sign-ups in Supabase Auth
- [ ] Remove `public` from Data API exposed schemas
- [ ] Add a Content-Security-Policy (start in Report-Only)
- [ ] Move rate limiter to a shared store (e.g. Upstash Redis)
- [ ] Enable PITR backups and perform a restore drill
- [ ] Review Supabase Auth rate limits & SMTP sender
- [ ] Sentry with PII scrubbing
- [ ] External penetration test of auth + IDOR paths
