# Deployment — Firebase (App Hosting + Auth + Firestore)

Do the steps in order. Each one is small.

## A. Firebase project
1. console.firebase.google.com → **Add project** → name `yala-gam3ya` (Analytics optional).
2. Upgrade to the **Blaze** plan (needed for App Hosting & Cloud Scheduler; small apps usually stay in the free usage). Set a budget alert (e.g. USD 5).
3. **Build → Firestore Database → Create database** → Production mode → location **eur3 (Europe)** or **europe-west1**.
4. **Build → Authentication → Get started** → enable **Email/Password**.
5. **Authentication → Settings → Upgrade to Identity Platform** (free tier; needed for TOTP two-step).
6. **Authentication → Settings → User actions:** keep "Enable create (sign-up)" ON (self sign-up is approved by admins). Turn on **Email enumeration protection**.
7. **Authentication → Settings → Authorized domains:** add your App Hosting domain after step C.
8. **Project settings → Your apps → Web app (</>)** → register → copy `apiKey`, `authDomain`, `projectId`, `appId`.

## B. Rules, indexes, TOTP (from your Mac, in the project folder)
```bash
npm install -g firebase-tools
firebase login
firebase use --add                 # pick your project
firebase deploy --only firestore   # deny-all rules + indexes
```
Enable TOTP once (needs a service-account key: Project settings → Service accounts → Generate new private key; keep it secret):
```bash
FIREBASE_SERVICE_ACCOUNT="$(cat ~/Downloads/your-key.json)" npm run firebase:enable-totp
```

## C. App Hosting
1. Edit `apphosting.yaml`: replace every `REPLACE_ME` with the web-app values from A.8, commit & push.
2. Create the cron secret: `firebase apphosting:secrets:set CRON_SECRET` (paste the output of `openssl rand -hex 32`).
3. Console → **Build → App Hosting → Get started** → connect GitHub → repo `yala-gam3ya`, branch `main`, root `/` → region **europe-west4** → create. It builds and deploys on every push.
4. Grant the backend access to the secret if prompted (`firebase apphosting:secrets:grantaccess CRON_SECRET --backend <name>`).
5. Copy the live URL → set `NEXT_PUBLIC_SITE_URL` in `apphosting.yaml` → push again. Add the domain to Auth authorized domains (A.7).

## D. First admin
1. Open the site → **Create account** with your email.
2. Firestore console → `users/{your uid}` → set `role` = `super_admin`, `approvalStatus` = `approved`.
3. Sign out/in → you'll be asked to scan a QR with Google Authenticator → sign in again with the code → **Admin** appears.
   (The first policy versions are created automatically by the daily job; to create them immediately, call the cron URL once — see E.)

## E. Daily reminders (Cloud Scheduler)
Console → Cloud Scheduler → Create job: frequency `0 7 * * *`, timezone `Africa/Cairo`, target **HTTP GET** `https://<your-site>/api/cron/daily`, header `Authorization: Bearer <CRON_SECRET>`.

## F. Email (optional, later)
Firebase sends verification & password-reset emails itself (customize templates under Authentication → Templates; set the language per template). For reminders/invites by email, create a Resend account, then set `NOTIFICATIONS_EMAIL_ENABLED=true`, `EMAIL_FROM`, and secret `RESEND_API_KEY` in `apphosting.yaml`. Until then, invitations show a **copyable link** the admin can share (e.g. WhatsApp).

## G. Before real users
- [ ] Budget alert set · [ ] Firestore **PITR/backups** enabled and a restore tested · [ ] Legal checklist reviewed by counsel · [ ] App Check (reCAPTCHA Enterprise) for sign-up abuse protection.
