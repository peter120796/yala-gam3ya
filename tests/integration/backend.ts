/**
 * Test backend: in-memory Firestore + fake Auth by default; the real Firestore
 * emulator when USE_EMULATOR=1 (run via `npm run test:emulator`).
 */
import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";
import { setBackendsForTests } from "@/lib/firebase/admin";
import { MemoryFirestore } from "../fakes/memory-firestore";

export const fakeAuth = {
  users: new Map<string, { email: string; disabled: boolean; revoked: number }>(),
  async createUser({ email }: { email: string }) {
    if ([...this.users.values()].some((u) => u.email === email)) throw Object.assign(new Error("exists"), { code: "auth/email-already-exists" });
    const uid = `auth_${this.users.size + 1}`;
    this.users.set(uid, { email, disabled: false, revoked: 0 });
    return { uid };
  },
  async updateUser(uid: string, p: { disabled?: boolean }) {
    const u = this.users.get(uid) ?? { email: "", disabled: false, revoked: 0 };
    this.users.set(uid, { ...u, disabled: p.disabled ?? u.disabled });
  },
  async revokeRefreshTokens(uid: string) {
    const u = this.users.get(uid) ?? { email: "", disabled: false, revoked: 0 };
    this.users.set(uid, { ...u, revoked: u.revoked + 1 });
  },
  async generatePasswordResetLink(email: string) {
    return `https://example.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=TEST&email=${encodeURIComponent(email)}`;
  },
};

export async function resetBackend() {
  if (process.env.USE_EMULATOR === "1") {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    const project = process.env.GCLOUD_PROJECT ?? "demo-yala";
    await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
    process.env.FIREBASE_PROJECT_ID = project;
    setBackendsForTests(null, fakeAuth as unknown as Auth);
    return;
  }
  setBackendsForTests(new MemoryFirestore() as unknown as Firestore, fakeAuth as unknown as Auth);
}
