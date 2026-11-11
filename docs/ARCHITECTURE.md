# Architecture & business rules

Priority order: **correct financial calculations → security → simplicity → reliability → UI.**

## Financial rules (enforced by `src/lib/engine` and re-verified in SQL)
1. **Cycles = shares.** One payout per cycle. Pot per cycle = contribution per share × total shares. No organizer fee (MVP).
2. **Money** is stored as `bigint` piasters (EGP × 100) and handled as safe integers; every arithmetic helper asserts integrality. No floats in totals; display uses exact decimal strings with `Intl.NumberFormat`.
3. **Split shares (نص سهم):** a share may be held by up to two members at 5,000 bp each (portions must total 10,000 bp). Each half-holder pays half the contribution and receives half of that turn's pot. Splits must be exact to the piaster, otherwise the configuration is rejected.
4. **Due dates (monthly):** cycle 1 is the first date ≥ start date on the due day; days 29–31 clamp to the month's last day per month (31 → 28/29 Feb → 31 Mar). Weekly / biweekly = start + n·period.
5. **Payout date** = due date + `payout_offset_days` (default 0).
6. **Display status is derived**, never stored: `upcoming` (before due) → `due` (due…due+grace) → `overdue`. Stored statuses are only real records: `reported_paid`, `recorded_paid`, `waived` (reason required). Payouts: `scheduled` → `due` → `delayed`; records `reported_completed`, `confirmed_completed`, `delayed` (reason required). The original scheduled date is never changed.
7. **Completion:** a Gam3ya is archived only when every contribution is recorded/waived and every current-version payout is confirmed. Past the end date with open items → `needs_closure` (never auto-archived by time alone).
8. **Schedule changes on active Gam3yas:** organizer proposes a turn swap → super admin approves → new `schedule_version` (payout rows copied, affected ones reset); the old version and its history are preserved.
9. Contributions and payouts are **never netted**; the overview shows a separately labelled "planning estimate".
10. **Today** is computed per Gam3ya timezone (default `Africa/Cairo`); schedules use civil dates; instants are UTC `timestamptz`.

## Permission matrix
| Capability | Super admin (aal2) | Organizer (own Gam3yas) | Member |
|---|---|---|---|
| Create / edit drafts / activate | ✅ | ❌ | ❌ |
| View Gam3ya, payout order, display names | ✅ | ✅ | ✅ (non-draft, own Gam3yas) |
| Other members' contact info & payment records | ✅ | ✅ | ❌ |
| Own contributions / own payouts | ✅ | ✅ | ✅ |
| Record contribution / payout | ✅ (archived: with reason) | ✅ (active / needs closure) | Report own payment (if enabled); confirm own receipt |
| Propose turn swap | ✅ | ✅ | ❌ |
| Approve swaps, restore archive, users, roles, policies, audit | ✅ | Audit of own Gam3yas only | ❌ |

### Enforcement layers (Firebase)
1. **Firestore rules deny all client access.** The browser uses Firebase Auth only to obtain an ID token; it never reads or writes Firestore.
2. **Server is the only data path.** `/api/auth/session` exchanges a fresh ID token for an httpOnly `__session` cookie (verified with revocation checks on every request). Every page, server action and route builds an `Actor` (role, active, approval, MFA) and every service calls the pure rules in `src/lib/data/policy.ts` before reading or writing — ports of the original RLS policies and SQL functions, unit-tested.
3. **Writes are transactions** that update the record, append a history row (`gam3yas/{id}/records`), append an audit log, maintain open-item counters (for O(1) completion checks) and create idempotent notifications (document id = hash of a dedupe key).
4. **Activation** generates the schedule with the tested engine, writes it while the Gam3ya is still an invisible draft, verifies document counts, then flips status in a transaction that checks the draft wasn't edited meanwhile.
5. **Super-admin power requires a TOTP-verified session** (`firebase.sign_in_second_factor` in the session cookie) — checked server-side on every admin call.

## Notifications
Event notifications (payout completed, schedule updated, Gam3ya completed, account approved) are created inside the same transaction as the change. Date reminders (3 days before, 1 day before, first overdue day, payout this week / next month) come from `computeReminders()` (pure, tested), run by the daily job. Notification document ids are hashes of a dedupe key → idempotent. Email delivery claims each row in a transaction before sending. The provider interface (`src/lib/notifications/provider.ts`) lets SMS/WhatsApp be added later; in development only the console provider runs unless `NOTIFICATIONS_EMAIL_ENABLED=true`.

## Assumptions to confirm with the product owner
- No organizer commission/fee; no penalty amounts for late payment (statuses only).
- Members must have accounts; self sign-up is allowed but accounts stay **pending** until a super admin approves them (bulk approve/reject).
- Only super admins create Gam3yas.
- Turn swaps are the only active-schedule change in MVP; replacing a member mid-Gam3ya is future work.
