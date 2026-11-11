/**
 * Firestore document shapes. Money = integer piasters; schedule dates = civil
 * "YYYY-MM-DD" strings; instants = ISO strings (UTC).
 *
 * Collections
 *   users/{uid}
 *   gam3yas/{gid}
 *   gam3yas/{gid}/obligations/{v1_c{cycle}_{uid}}
 *   gam3yas/{gid}/payouts/{v{version}_c{cycle}}
 *   gam3yas/{gid}/records/{auto}          status history (append-only)
 *   gam3yas/{gid}/changeRequests/{auto}
 *   auditLogs/{auto}                       append-only
 *   notifications/{sha256(dedupeKey)}      idempotent by id
 *   policyVersions/{kind_version}
 *   policyAcceptances/{uid_policyId}
 *   subscriptionPlans/{key}                billing inactive
 *
 * Firestore security rules deny ALL client access; only the server (Admin
 * SDK) reads/writes, after the checks in ./policy.ts.
 */
import type { ContributionRecordStatus, Frequency, Gam3yaLifecycle, PayoutRecordStatus } from "@/lib/engine/types";

export type Role = "super_admin" | "organizer" | "member";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface NotificationPrefs {
  emailEnabled: boolean;
  contributionReminders: boolean;
  payoutReminders: boolean;
  gam3yaUpdates: boolean;
}

export interface UserDoc {
  displayName: string;
  email: string | null;
  emailLower: string | null;
  nameLower: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  signupSource: "self" | "invite" | "seed";
  locale: "ar" | "en";
  theme: "light" | "dark" | "system";
  privacyMode: boolean;
  notificationPrefs: NotificationPrefs;
  /** kind → accepted policy version id */
  acceptedPolicies: Record<string, string>;
  onboardedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  shareNumber: number;
  userId: string;
  portionBp: 5000 | 10000;
}

export interface Gam3yaDoc {
  name: string;
  description: string | null;
  status: Gam3yaLifecycle;
  totalShares: number;
  contributionPerShare: number;
  frequency: Frequency;
  startDate: string;
  dueDay: number | null;
  payoutOffsetDays: number;
  graceDays: number;
  timezone: string;
  currency: "EGP";
  allowSelfReport: boolean;
  organizerIds: string[];
  /** All participant user ids (for array-contains queries). */
  memberIds: string[];
  holdings: Holding[];
  /** Payout order of the current version: turns[i] = share receiving cycle i+1. */
  turnOrder: number[];
  currentScheduleVersion: number;
  /** Counters maintained transactionally for O(1) completion checks. */
  openObligations: number;
  openPayouts: number;
  endDate: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObligationDoc {
  gam3yaId: string;
  gam3yaName: string;
  scheduleVersion: number;
  cycleNumber: number;
  userId: string;
  dueDate: string;
  amount: number;
  graceDays: number;
  shares: { shareNumber: number; portionBp: number }[];
  recordStatus: ContributionRecordStatus | null;
  recordedPaymentDate: string | null;
  recordedBy: string | null;
  statusReason: string | null;
  statusUpdatedAt: string | null;
}

export interface PayoutRecipient {
  userId: string;
  portionBp: number;
  amount: number;
}

export interface PayoutDoc {
  gam3yaId: string;
  gam3yaName: string;
  scheduleVersion: number;
  isCurrent: boolean;
  cycleNumber: number;
  recipientShare: number;
  expectedAmount: number;
  scheduledDate: string;
  graceDays: number;
  recipients: PayoutRecipient[];
  recipientIds: string[];
  recordStatus: PayoutRecordStatus | null;
  recordedCompletionDate: string | null;
  recordedBy: string | null;
  statusReason: string | null;
  statusUpdatedAt: string | null;
}

export interface RecordDoc {
  kind: "contribution" | "payout";
  targetId: string;
  /** Owner(s) of the record — lets members list their own activity. */
  userIds: string[];
  cycleNumber: number;
  fromStatus: string | null;
  toStatus: string | null;
  date: string | null;
  reason: string | null;
  recordedBy: string;
  createdAt: string;
}

export interface ChangeRequestDoc {
  kind: "swap_turns";
  shareA: number;
  shareB: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  proposedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AuditDoc {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  gam3yaId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

export type EmailStatus = "not_requested" | "pending" | "sending" | "sent" | "failed" | "skipped";

export interface NotificationDoc {
  userId: string;
  kind: string;
  gam3yaId: string | null;
  params: Record<string, string | number>;
  dedupeKey: string;
  readAt: string | null;
  emailStatus: EmailStatus;
  emailedAt: string | null;
  createdAt: string;
}

export interface PolicyVersionDoc {
  kind: "terms" | "privacy" | "disclaimer" | "subscription";
  version: string;
  isCurrent: boolean;
  requiresAcceptance: boolean;
  summary: string | null;
  effectiveAt: string;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailEnabled: true,
  contributionReminders: true,
  payoutReminders: true,
  gam3yaUpdates: true,
};
