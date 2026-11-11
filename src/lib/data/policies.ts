import "server-only";
import { db } from "@/lib/firebase/admin";
import { invalidatePolicyCache } from "@/lib/auth/session";
import { assertSuperAdmin, PolicyError, type Actor } from "./policy";
import { audit, nowIso, refs } from "./store";
import type { PolicyVersionDoc } from "./types";

export const policyDocId = (kind: string, version: string) => `${kind}_${version}`;

/** Publishing a new version makes it current; users re-accept on next visit. */
export async function publishPolicy(actor: Actor | null, kind: PolicyVersionDoc["kind"], version: string, summary: string | null) {
  assertSuperAdmin(actor);
  const id = policyDocId(kind, version);
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(refs.policy(id));
    if (existing.exists) throw new PolicyError("duplicate");
    const current = await tx.get(refs.policies().where("kind", "==", kind).where("isCurrent", "==", true));
    for (const d of current.docs) tx.update(d.ref, { isCurrent: false });
    tx.create(refs.policy(id), { kind, version, isCurrent: true, requiresAcceptance: kind === "terms" || kind === "privacy", summary, effectiveAt: nowIso() });
    audit(tx, { actorId: actor.uid, action: "policy.published", entityType: "policy_version", entityId: id, gam3yaId: null, before: null, after: { kind, version }, reason: summary });
  });
  invalidatePolicyCache();
}

/** First deploy: create the initial (draft) policy versions if none exist. */
export async function ensureInitialPolicies() {
  const snap = await refs.policies().limit(1).get();
  if (!snap.empty) return false;
  const batch = db().batch();
  for (const kind of ["terms", "privacy", "disclaimer", "subscription"] as const) {
    batch.set(refs.policy(policyDocId(kind, "1.0-draft")), {
      kind,
      version: "1.0-draft",
      isCurrent: true,
      requiresAcceptance: kind === "terms" || kind === "privacy",
      summary: "Initial draft — pending Egyptian legal counsel review",
      effectiveAt: nowIso(),
    });
  }
  await batch.commit();
  invalidatePolicyCache();
  return true;
}
