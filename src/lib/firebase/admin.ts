import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin (server only). On App Hosting, credentials come from the
 * runtime service account automatically. Locally, set FIREBASE_SERVICE_ACCOUNT
 * (JSON) or GOOGLE_APPLICATION_CREDENTIALS, or point at the emulators.
 */
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return initializeApp(sa ? { credential: cert(JSON.parse(sa)), projectId } : projectId ? { projectId } : undefined);
}

let dbOverride: Firestore | null = null;
let authOverride: Auth | null = null;

/** Test hook: swap in an in-memory Firestore / fake Auth. */
export function setBackendsForTests(db: Firestore | null, auth: Auth | null = null) {
  dbOverride = db;
  authOverride = auth;
}

// Next.js can load this module in several server bundles; they all share one
// Firestore instance, so remember "already configured" process-wide.
const shared = globalThis as { __yalaFirestore?: Firestore };
export function db(): Firestore {
  if (dbOverride) return dbOverride;
  if (!shared.__yalaFirestore) {
    const f = getFirestore(app());
    try {
      f.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already configured or in use — keep the existing instance.
    }
    shared.__yalaFirestore = f;
  }
  return shared.__yalaFirestore;
}

export function adminAuth(): Auth {
  return authOverride ?? getAuth(app());
}
