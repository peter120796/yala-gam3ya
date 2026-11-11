# Security checklist

| Control | Where | Verified by |
|---|---|---|
| Browser has **no** Firestore access (deny-all rules) | `firestore.rules` | deploy + review |
| Session = httpOnly `__session` cookie from a fresh ID token (≤5 min), verified with revocation check on every request | `api/auth/session`, `lib/auth/session.ts` | unit (cookie) |
| Same-origin check on the session endpoint | `api/auth/session` | review |
| Members can't read others' obligations/payouts/contacts (IDOR) | `lib/data/policy.ts`, `reads.ts` | unit + integration |
| Organizers scoped to their Gam3yas | policy | unit + integration |
| Super admin requires TOTP-verified session (server-checked) | policy, `requireAdmin` | unit + integration |
| Pending/rejected/deactivated users get nothing | policy | unit + integration |
| Writes in transactions with history + audit | `lib/data/gam3yas.ts`, `users.ts` | integration |
| Financial config immutable after activation (only drafts editable) | `saveDraft` | integration |
| Idempotent notifications/reminders | store + job | integration |
| Deactivation disables Auth + revokes sessions, keeps history | `setUserActive` | integration |
| Zod validation, rate limiting, safe error codes | `lib/actions.ts` | — |
| CSV formula-injection neutralised | `lib/export/csv.ts` | unit |
| Security headers | `next.config.ts` | — |
| Secrets in Cloud Secret Manager (CRON_SECRET, RESEND_API_KEY) | `apphosting.yaml` | — |

## Before launch
- [ ] Enable Email enumeration protection & App Check (reCAPTCHA Enterprise) on sign-up
- [ ] Run `npm run test:emulator` once against the real Firestore emulator
- [ ] Add a Content-Security-Policy (start in Report-Only)
- [ ] Move rate limiter to a shared store (e.g. Upstash Redis)
- [ ] Enable Firestore PITR / scheduled backups and perform a restore drill
- [ ] Budget alerts on the Blaze plan
- [ ] Sentry with PII scrubbing
- [ ] External penetration test of auth + IDOR paths
