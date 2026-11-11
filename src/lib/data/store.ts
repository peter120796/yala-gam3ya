import "server-only";
import { createHash } from "node:crypto";
import type { Firestore, Transaction, DocumentReference, BulkWriter } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { AuditDoc, Gam3yaDoc, NotificationDoc, ObligationDoc, PayoutDoc, PolicyVersionDoc, RecordDoc, UserDoc, ChangeRequestDoc } from "./types";

/** Typed collection helpers. App code stays within the API subset used here. */
export const nowIso = () => new Date().toISOString();

export const refs = {
  user: (uid: string) => db().collection("users").doc(uid) as DocumentReference<UserDoc>,
  users: () => db().collection("users"),
  gam3ya: (gid: string) => db().collection("gam3yas").doc(gid) as DocumentReference<Gam3yaDoc>,
  gam3yas: () => db().collection("gam3yas"),
  obligations: (gid: string) => db().collection("gam3yas").doc(gid).collection("obligations"),
  obligation: (gid: string, id: string) => db().collection("gam3yas").doc(gid).collection("obligations").doc(id) as DocumentReference<ObligationDoc>,
  payouts: (gid: string) => db().collection("gam3yas").doc(gid).collection("payouts"),
  payout: (gid: string, id: string) => db().collection("gam3yas").doc(gid).collection("payouts").doc(id) as DocumentReference<PayoutDoc>,
  records: (gid: string) => db().collection("gam3yas").doc(gid).collection("records"),
  changeRequests: (gid: string) => db().collection("gam3yas").doc(gid).collection("changeRequests"),
  changeRequest: (gid: string, id: string) =>
    db().collection("gam3yas").doc(gid).collection("changeRequests").doc(id) as DocumentReference<ChangeRequestDoc>,
  audit: () => db().collection("auditLogs"),
  notifications: () => db().collection("notifications"),
  notification: (dedupeKey: string) => db().collection("notifications").doc(notificationId(dedupeKey)) as DocumentReference<NotificationDoc>,
  policies: () => db().collection("policyVersions"),
  policy: (id: string) => db().collection("policyVersions").doc(id) as DocumentReference<PolicyVersionDoc>,
  acceptance: (uid: string, policyId: string) => db().collection("policyAcceptances").doc(`${uid}_${policyId}`),
};

export const notificationId = (dedupeKey: string) => createHash("sha256").update(dedupeKey).digest("hex").slice(0, 40);
export const obligationId = (version: number, cycle: number, uid: string) => `v${version}_c${String(cycle).padStart(3, "0")}_${uid}`;
export const payoutId = (version: number, cycle: number) => `v${version}_c${String(cycle).padStart(3, "0")}`;

type Writer = Pick<Transaction, "set" | "create" | "update"> | Pick<BulkWriter, "set" | "create" | "update">;

export function audit(w: Writer, a: Omit<AuditDoc, "createdAt">) {
  const ref = refs.audit().doc();
  (w as Transaction).create(ref, { ...a, before: a.before ?? null, after: a.after ?? null, createdAt: nowIso() });
}

export function record(w: Writer, gid: string, r: Omit<RecordDoc, "createdAt">) {
  (w as Transaction).create(refs.records(gid).doc(), { ...r, createdAt: nowIso() });
}

export function notificationDoc(n: Pick<NotificationDoc, "userId" | "kind" | "gam3yaId" | "params" | "dedupeKey">, email = true): NotificationDoc {
  return { ...n, readAt: null, emailStatus: email ? "pending" : "not_requested", emailedAt: null, createdAt: nowIso() };
}

/**
 * Creates notifications that don't exist yet (idempotent by dedupe key).
 * Inside a transaction, existence is read first (reads must precede writes:
 * call `readNotificationState` before any tx write).
 */
export async function readNotificationState(tx: Transaction, keys: string[]) {
  if (!keys.length) return new Set<string>();
  const snaps = await tx.getAll(...keys.map((k) => refs.notification(k)));
  return new Set(keys.filter((_, i) => snaps[i]!.exists));
}

export function bulk(): BulkWriter {
  const w = db().bulkWriter();
  // ALREADY_EXISTS on create() = idempotent no-op; don't retry.
  w.onWriteError((e) => e.code !== 6 && e.failedAttempts < 3);
  return w;
}

export const firestore = (): Firestore => db();
