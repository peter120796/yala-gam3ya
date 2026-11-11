/**
 * Yala-Gam3ya database schema (Drizzle). Tables only — RLS policies, grants,
 * triggers and privileged functions live in drizzle/0001_security.sql.
 *
 * Money: bigint piasters (EGP × 100), read as JS safe integers.
 * Dates of schedules: `date` (civil dates in the Gam3ya timezone).
 * Instants: timestamptz (UTC).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────── Users & roles ─────────────────────────

export const roles = pgTable("roles", {
  key: text("key").primaryKey(), // super_admin | organizer | member
  description: text("description").notNull(),
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    platformRole: text("platform_role")
      .notNull()
      .default("member")
      .references(() => roles.key),
    isActive: boolean("is_active").notNull().default(true),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedBy: uuid("deactivated_by"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("profiles_display_name_len", sql`char_length(${t.displayName}) between 1 and 80`),
    index("profiles_email_idx").on(sql`lower(${t.email})`),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    locale: text("locale").notNull().default("ar"),
    theme: text("theme").notNull().default("system"),
    privacyMode: boolean("privacy_mode").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("user_preferences_locale", sql`${t.locale} in ('ar','en')`),
    check("user_preferences_theme", sql`${t.theme} in ('light','dark','system')`),
  ],
);

// ───────────────────────── Gam3yas ─────────────────────────

export const gam3yas = pgTable(
  "gam3yas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    totalShares: smallint("total_shares").notNull(),
    contributionPerShare: money("contribution_per_share").notNull(),
    frequency: text("frequency").notNull().default("monthly"),
    startDate: date("start_date").notNull(),
    dueDay: smallint("due_day"),
    payoutOffsetDays: smallint("payout_offset_days").notNull().default(0),
    graceDays: smallint("grace_days").notNull().default(3),
    timezone: text("timezone").notNull().default("Africa/Cairo"),
    currency: text("currency").notNull().default("EGP"),
    allowSelfReport: boolean("allow_self_report").notNull().default(false),
    currentScheduleVersion: integer("current_schedule_version").notNull().default(1),
    endDate: date("end_date"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedBy: uuid("activated_by").references(() => profiles.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("gam3yas_status", sql`${t.status} in ('draft','active','needs_closure','completed','cancelled')`),
    check("gam3yas_name_len", sql`char_length(${t.name}) between 1 and 80`),
    check("gam3yas_total_shares", sql`${t.totalShares} between 2 and 120`),
    check("gam3yas_contribution", sql`${t.contributionPerShare} > 0 and ${t.contributionPerShare} <= 1000000000`),
    check("gam3yas_frequency", sql`${t.frequency} in ('monthly','biweekly','weekly')`),
    check(
      "gam3yas_due_day",
      sql`(${t.frequency} = 'monthly' and ${t.dueDay} between 1 and 31) or (${t.frequency} <> 'monthly' and ${t.dueDay} is null)`,
    ),
    check("gam3yas_payout_offset", sql`${t.payoutOffsetDays} between 0 and 27`),
    check("gam3yas_grace", sql`${t.graceDays} between 0 and 30`),
    check("gam3yas_currency", sql`${t.currency} = 'EGP'`),
    check("gam3yas_active_has_end", sql`${t.status} = 'draft' or ${t.endDate} is not null`),
    index("gam3yas_status_idx").on(t.status),
  ],
);

export const gam3yaOrganizers = pgTable(
  "gam3ya_organizers",
  {
    gam3yaId: uuid("gam3ya_id")
      .notNull()
      .references(() => gam3yas.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    assignedBy: uuid("assigned_by").references(() => profiles.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.gam3yaId, t.userId] }), index("gam3ya_organizers_user_idx").on(t.userId)],
);

export const gam3yaMemberships = pgTable(
  "gam3ya_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gam3yaId: uuid("gam3ya_id")
      .notNull()
      .references(() => gam3yas.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("gam3ya_memberships_unique").on(t.gam3yaId, t.userId),
    // Lets child tables reference (id, gam3ya_id) so rows can't cross Gam3yas.
    unique("gam3ya_memberships_id_gam3ya").on(t.id, t.gam3yaId),
    check("gam3ya_memberships_status", sql`${t.status} in ('active','removed')`),
    index("gam3ya_memberships_user_idx").on(t.userId),
  ],
);

/** Share holdings. One share may be held by up to two members (halves). */
export const membershipShares = pgTable(
  "membership_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gam3yaId: uuid("gam3ya_id")
      .notNull()
      .references(() => gam3yas.id, { onDelete: "cascade" }),
    shareNumber: smallint("share_number").notNull(),
    membershipId: uuid("membership_id").notNull(),
    portionBp: smallint("portion_bp").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("membership_shares_unique").on(t.gam3yaId, t.shareNumber, t.membershipId),
    foreignKey({
      name: "membership_shares_membership_fk",
      columns: [t.membershipId, t.gam3yaId],
      foreignColumns: [gam3yaMemberships.id, gam3yaMemberships.gam3yaId],
    }).onDelete("cascade"),
    check("membership_shares_portion", sql`${t.portionBp} in (5000, 10000)`),
    check("membership_shares_number", sql`${t.shareNumber} between 1 and 120`),
    index("membership_shares_membership_idx").on(t.membershipId),
  ],
);

export const scheduleVersions = pgTable(
  "schedule_versions",
  {
    gam3yaId: uuid("gam3ya_id")
      .notNull()
      .references(() => gam3yas.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.gam3yaId, t.version] })],
);

export const payoutTurns = pgTable(
  "payout_turns",
  {
    gam3yaId: uuid("gam3ya_id").notNull(),
    scheduleVersion: integer("schedule_version").notNull(),
    shareNumber: smallint("share_number").notNull(),
    cycleNumber: smallint("cycle_number").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.gam3yaId, t.scheduleVersion, t.shareNumber] }),
    unique("payout_turns_cycle_unique").on(t.gam3yaId, t.scheduleVersion, t.cycleNumber),
    foreignKey({
      name: "payout_turns_version_fk",
      columns: [t.gam3yaId, t.scheduleVersion],
      foreignColumns: [scheduleVersions.gam3yaId, scheduleVersions.version],
    }).onDelete("cascade"),
    check("payout_turns_positive", sql`${t.shareNumber} >= 1 and ${t.cycleNumber} >= 1`),
  ],
);

export const contributionObligations = pgTable(
  "contribution_obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gam3yaId: uuid("gam3ya_id").notNull(),
    scheduleVersion: integer("schedule_version").notNull(),
    cycleNumber: smallint("cycle_number").notNull(),
    membershipId: uuid("membership_id").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    // Current recorded status (null = nothing recorded; display status is derived).
    recordStatus: text("record_status"),
    recordedPaymentDate: date("recorded_payment_date"),
    recordedBy: uuid("recorded_by").references(() => profiles.id),
    statusReason: text("status_reason"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("contribution_obligations_unique").on(t.gam3yaId, t.scheduleVersion, t.cycleNumber, t.membershipId),
    foreignKey({
      name: "contribution_obligations_membership_fk",
      columns: [t.membershipId, t.gam3yaId],
      foreignColumns: [gam3yaMemberships.id, gam3yaMemberships.gam3yaId],
    }),
    foreignKey({
      name: "contribution_obligations_version_fk",
      columns: [t.gam3yaId, t.scheduleVersion],
      foreignColumns: [scheduleVersions.gam3yaId, scheduleVersions.version],
    }),
    check("contribution_obligations_amount", sql`${t.amount} > 0`),
    check(
      "contribution_obligations_status",
      sql`${t.recordStatus} is null or ${t.recordStatus} in ('reported_paid','recorded_paid','waived')`,
    ),
    check(
      "contribution_obligations_waive_reason",
      sql`${t.recordStatus} is distinct from 'waived' or char_length(coalesce(${t.statusReason}, '')) >= 3`,
    ),
    index("contribution_obligations_membership_idx").on(t.membershipId, t.dueDate),
    index("contribution_obligations_due_idx").on(t.dueDate),
  ],
);

/** Append-only trail of every contribution status change. */
export const contributionRecords = pgTable(
  "contribution_records",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => contributionObligations.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    recordedPaymentDate: date("recorded_payment_date"),
    reason: text("reason"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [index("contribution_records_obligation_idx").on(t.obligationId)],
);

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gam3yaId: uuid("gam3ya_id").notNull(),
    scheduleVersion: integer("schedule_version").notNull(),
    cycleNumber: smallint("cycle_number").notNull(),
    recipientShare: smallint("recipient_share").notNull(),
    expectedAmount: money("expected_amount").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    recordStatus: text("record_status"),
    recordedCompletionDate: date("recorded_completion_date"),
    recordedBy: uuid("recorded_by").references(() => profiles.id),
    statusReason: text("status_reason"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("payouts_cycle_unique").on(t.gam3yaId, t.scheduleVersion, t.cycleNumber),
    foreignKey({
      name: "payouts_version_fk",
      columns: [t.gam3yaId, t.scheduleVersion],
      foreignColumns: [scheduleVersions.gam3yaId, scheduleVersions.version],
    }),
    unique("payouts_share_unique").on(t.gam3yaId, t.scheduleVersion, t.recipientShare),
    check("payouts_amount", sql`${t.expectedAmount} > 0`),
    check(
      "payouts_status",
      sql`${t.recordStatus} is null or ${t.recordStatus} in ('reported_completed','confirmed_completed','delayed')`,
    ),
    index("payouts_scheduled_idx").on(t.scheduledDate),
  ],
);

export const payoutRecords = pgTable(
  "payout_records",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    recordedCompletionDate: date("recorded_completion_date"),
    reason: text("reason"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [index("payout_records_payout_idx").on(t.payoutId)],
);

/** Organizer-proposed changes to active Gam3yas (approved by a super admin). */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gam3yaId: uuid("gam3ya_id")
      .notNull()
      .references(() => gam3yas.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    shareA: smallint("share_a").notNull(),
    shareB: smallint("share_b").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    proposedBy: uuid("proposed_by")
      .notNull()
      .references(() => profiles.id),
    reviewedBy: uuid("reviewed_by").references(() => profiles.id),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    check("change_requests_kind", sql`${t.kind} in ('swap_turns')`),
    check("change_requests_status", sql`${t.status} in ('pending','approved','rejected','cancelled')`),
    check("change_requests_shares", sql`${t.shareA} <> ${t.shareB}`),
  ],
);

// ───────────────────────── Notifications ─────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    kind: text("kind").notNull(),
    gam3yaId: uuid("gam3ya_id").references(() => gam3yas.id, { onDelete: "set null" }),
    /** Interpolation values for the translated message (no other members' data). */
    params: jsonb("params").$type<Record<string, string | number>>().notNull().default({}),
    /** Idempotency key: one notification per user/subject/kind/date. */
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailStatus: text("email_status").notNull().default("not_requested"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey),
    index("notifications_user_idx").on(t.userId, t.createdAt),
    check("notifications_email_status", sql`${t.emailStatus} in ('not_requested','pending','sending','sent','failed','skipped')`),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  contributionReminders: boolean("contribution_reminders").notNull().default(true),
  payoutReminders: boolean("payout_reminders").notNull().default(true),
  gam3yaUpdates: boolean("gam3ya_updates").notNull().default(true),
  updatedAt: updatedAt(),
});

// ───────────────────────── Audit & policies ─────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    gam3yaId: uuid("gam3ya_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_gam3ya_idx").on(t.gam3yaId),
    index("audit_logs_actor_idx").on(t.actorId),
  ],
);

export const policyVersions = pgTable(
  "policy_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    version: text("version").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    requiresAcceptance: boolean("requires_acceptance").notNull().default(true),
    summary: text("summary"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("policy_versions_unique").on(t.kind, t.version),
    check("policy_versions_kind", sql`${t.kind} in ('terms','privacy','disclaimer','subscription')`),
    uniqueIndex("policy_versions_one_current").on(t.kind).where(sql`${t.isCurrent}`),
  ],
);

export const policyAcceptances = pgTable(
  "policy_acceptances",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => policyVersions.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    locale: text("locale").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.policyVersionId] })],
);

// ───────────────────────── Subscription readiness (billing inactive) ─────────────────────────

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    pricePiasters: money("price_piasters"),
    billingInterval: text("billing_interval"),
    maxActiveGam3yas: integer("max_active_gam3yas"),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [check("subscription_plans_key", sql`${t.key} in ('free','premium','organizer_pro')`)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    status: text("status").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("subscriptions_status", sql`${t.status} in ('active','cancelled','expired')`)],
);

export const billingEvents = pgTable("billing_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  createdAt: createdAt(),
});
