CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"gam3ya_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscription_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gam3ya_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"share_a" smallint NOT NULL,
	"share_b" smallint NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "change_requests_kind" CHECK ("change_requests"."kind" in ('swap_turns')),
	CONSTRAINT "change_requests_status" CHECK ("change_requests"."status" in ('pending','approved','rejected','cancelled')),
	CONSTRAINT "change_requests_shares" CHECK ("change_requests"."share_a" <> "change_requests"."share_b")
);
--> statement-breakpoint
CREATE TABLE "contribution_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gam3ya_id" uuid NOT NULL,
	"schedule_version" integer NOT NULL,
	"cycle_number" smallint NOT NULL,
	"membership_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"record_status" text,
	"recorded_payment_date" date,
	"recorded_by" uuid,
	"status_reason" text,
	"status_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_obligations_unique" UNIQUE("gam3ya_id","schedule_version","cycle_number","membership_id"),
	CONSTRAINT "contribution_obligations_amount" CHECK ("contribution_obligations"."amount" > 0),
	CONSTRAINT "contribution_obligations_status" CHECK ("contribution_obligations"."record_status" is null or "contribution_obligations"."record_status" in ('reported_paid','recorded_paid','waived')),
	CONSTRAINT "contribution_obligations_waive_reason" CHECK ("contribution_obligations"."record_status" is distinct from 'waived' or char_length(coalesce("contribution_obligations"."status_reason", '')) >= 3)
);
--> statement-breakpoint
CREATE TABLE "contribution_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"obligation_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text,
	"recorded_payment_date" date,
	"reason" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gam3ya_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gam3ya_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gam3ya_memberships_unique" UNIQUE("gam3ya_id","user_id"),
	CONSTRAINT "gam3ya_memberships_id_gam3ya" UNIQUE("id","gam3ya_id"),
	CONSTRAINT "gam3ya_memberships_status" CHECK ("gam3ya_memberships"."status" in ('active','removed'))
);
--> statement-breakpoint
CREATE TABLE "gam3ya_organizers" (
	"gam3ya_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gam3ya_organizers_gam3ya_id_user_id_pk" PRIMARY KEY("gam3ya_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "gam3yas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_shares" smallint NOT NULL,
	"contribution_per_share" bigint NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"start_date" date NOT NULL,
	"due_day" smallint,
	"payout_offset_days" smallint DEFAULT 0 NOT NULL,
	"grace_days" smallint DEFAULT 3 NOT NULL,
	"timezone" text DEFAULT 'Africa/Cairo' NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"allow_self_report" boolean DEFAULT false NOT NULL,
	"current_schedule_version" integer DEFAULT 1 NOT NULL,
	"end_date" date,
	"activated_at" timestamp with time zone,
	"activated_by" uuid,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gam3yas_status" CHECK ("gam3yas"."status" in ('draft','active','needs_closure','completed','cancelled')),
	CONSTRAINT "gam3yas_name_len" CHECK (char_length("gam3yas"."name") between 1 and 80),
	CONSTRAINT "gam3yas_total_shares" CHECK ("gam3yas"."total_shares" between 2 and 120),
	CONSTRAINT "gam3yas_contribution" CHECK ("gam3yas"."contribution_per_share" > 0 and "gam3yas"."contribution_per_share" <= 1000000000),
	CONSTRAINT "gam3yas_frequency" CHECK ("gam3yas"."frequency" in ('monthly','biweekly','weekly')),
	CONSTRAINT "gam3yas_due_day" CHECK (("gam3yas"."frequency" = 'monthly' and "gam3yas"."due_day" between 1 and 31) or ("gam3yas"."frequency" <> 'monthly' and "gam3yas"."due_day" is null)),
	CONSTRAINT "gam3yas_payout_offset" CHECK ("gam3yas"."payout_offset_days" between 0 and 27),
	CONSTRAINT "gam3yas_grace" CHECK ("gam3yas"."grace_days" between 0 and 30),
	CONSTRAINT "gam3yas_currency" CHECK ("gam3yas"."currency" = 'EGP'),
	CONSTRAINT "gam3yas_active_has_end" CHECK ("gam3yas"."status" = 'draft' or "gam3yas"."end_date" is not null)
);
--> statement-breakpoint
CREATE TABLE "membership_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gam3ya_id" uuid NOT NULL,
	"share_number" smallint NOT NULL,
	"membership_id" uuid NOT NULL,
	"portion_bp" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_shares_unique" UNIQUE("gam3ya_id","share_number","membership_id"),
	CONSTRAINT "membership_shares_portion" CHECK ("membership_shares"."portion_bp" in (5000, 10000)),
	CONSTRAINT "membership_shares_number" CHECK ("membership_shares"."share_number" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"contribution_reminders" boolean DEFAULT true NOT NULL,
	"payout_reminders" boolean DEFAULT true NOT NULL,
	"gam3ya_updates" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"gam3ya_id" uuid,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"email_status" text DEFAULT 'not_requested' NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_email_status" CHECK ("notifications"."email_status" in ('not_requested','pending','sent','failed','skipped'))
);
--> statement-breakpoint
CREATE TABLE "payout_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"payout_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text,
	"recorded_completion_date" date,
	"reason" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_turns" (
	"gam3ya_id" uuid NOT NULL,
	"schedule_version" integer NOT NULL,
	"share_number" smallint NOT NULL,
	"cycle_number" smallint NOT NULL,
	CONSTRAINT "payout_turns_gam3ya_id_schedule_version_share_number_pk" PRIMARY KEY("gam3ya_id","schedule_version","share_number"),
	CONSTRAINT "payout_turns_cycle_unique" UNIQUE("gam3ya_id","schedule_version","cycle_number"),
	CONSTRAINT "payout_turns_positive" CHECK ("payout_turns"."share_number" >= 1 and "payout_turns"."cycle_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gam3ya_id" uuid NOT NULL,
	"schedule_version" integer NOT NULL,
	"cycle_number" smallint NOT NULL,
	"recipient_share" smallint NOT NULL,
	"expected_amount" bigint NOT NULL,
	"scheduled_date" date NOT NULL,
	"record_status" text,
	"recorded_completion_date" date,
	"recorded_by" uuid,
	"status_reason" text,
	"status_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_cycle_unique" UNIQUE("gam3ya_id","schedule_version","cycle_number"),
	CONSTRAINT "payouts_share_unique" UNIQUE("gam3ya_id","schedule_version","recipient_share"),
	CONSTRAINT "payouts_amount" CHECK ("payouts"."expected_amount" > 0),
	CONSTRAINT "payouts_status" CHECK ("payouts"."record_status" is null or "payouts"."record_status" in ('reported_completed','confirmed_completed','delayed'))
);
--> statement-breakpoint
CREATE TABLE "policy_acceptances" (
	"user_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locale" text NOT NULL,
	CONSTRAINT "policy_acceptances_user_id_policy_version_id_pk" PRIMARY KEY("user_id","policy_version_id")
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"requires_acceptance" boolean DEFAULT true NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_versions_unique" UNIQUE("kind","version"),
	CONSTRAINT "policy_versions_kind" CHECK ("policy_versions"."kind" in ('terms','privacy','disclaimer','subscription'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"phone" text,
	"platform_role" text DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" uuid,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_len" CHECK (char_length("profiles"."display_name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_versions" (
	"gam3ya_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_versions_gam3ya_id_version_pk" PRIMARY KEY("gam3ya_id","version")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"price_piasters" bigint,
	"billing_interval" text,
	"max_active_gam3yas" integer,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_key_unique" UNIQUE("key"),
	CONSTRAINT "subscription_plans_key" CHECK ("subscription_plans"."key" in ('free','premium','organizer_pro'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text NOT NULL,
	"consented_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_status" CHECK ("subscriptions"."status" in ('active','cancelled','expired'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"privacy_mode" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_locale" CHECK ("user_preferences"."locale" in ('ar','en')),
	CONSTRAINT "user_preferences_theme" CHECK ("user_preferences"."theme" in ('light','dark','system'))
);
--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_gam3ya_id_gam3yas_id_fk" FOREIGN KEY ("gam3ya_id") REFERENCES "public"."gam3yas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_proposed_by_profiles_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_obligations" ADD CONSTRAINT "contribution_obligations_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_obligations" ADD CONSTRAINT "contribution_obligations_membership_fk" FOREIGN KEY ("membership_id","gam3ya_id") REFERENCES "public"."gam3ya_memberships"("id","gam3ya_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_obligations" ADD CONSTRAINT "contribution_obligations_version_fk" FOREIGN KEY ("gam3ya_id","schedule_version") REFERENCES "public"."schedule_versions"("gam3ya_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_records" ADD CONSTRAINT "contribution_records_obligation_id_contribution_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."contribution_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution_records" ADD CONSTRAINT "contribution_records_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gam3ya_memberships" ADD CONSTRAINT "gam3ya_memberships_gam3ya_id_gam3yas_id_fk" FOREIGN KEY ("gam3ya_id") REFERENCES "public"."gam3yas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gam3ya_memberships" ADD CONSTRAINT "gam3ya_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gam3ya_organizers" ADD CONSTRAINT "gam3ya_organizers_gam3ya_id_gam3yas_id_fk" FOREIGN KEY ("gam3ya_id") REFERENCES "public"."gam3yas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gam3ya_organizers" ADD CONSTRAINT "gam3ya_organizers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gam3ya_organizers" ADD CONSTRAINT "gam3ya_organizers_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gam3yas" ADD CONSTRAINT "gam3yas_activated_by_profiles_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gam3yas" ADD CONSTRAINT "gam3yas_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_shares" ADD CONSTRAINT "membership_shares_gam3ya_id_gam3yas_id_fk" FOREIGN KEY ("gam3ya_id") REFERENCES "public"."gam3yas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_shares" ADD CONSTRAINT "membership_shares_membership_fk" FOREIGN KEY ("membership_id","gam3ya_id") REFERENCES "public"."gam3ya_memberships"("id","gam3ya_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_gam3ya_id_gam3yas_id_fk" FOREIGN KEY ("gam3ya_id") REFERENCES "public"."gam3yas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_records_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_records_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_turns" ADD CONSTRAINT "payout_turns_version_fk" FOREIGN KEY ("gam3ya_id","schedule_version") REFERENCES "public"."schedule_versions"("gam3ya_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_version_fk" FOREIGN KEY ("gam3ya_id","schedule_version") REFERENCES "public"."schedule_versions"("gam3ya_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_platform_role_roles_key_fk" FOREIGN KEY ("platform_role") REFERENCES "public"."roles"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_gam3ya_id_gam3yas_id_fk" FOREIGN KEY ("gam3ya_id") REFERENCES "public"."gam3yas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_gam3ya_idx" ON "audit_logs" USING btree ("gam3ya_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "contribution_obligations_membership_idx" ON "contribution_obligations" USING btree ("membership_id","due_date");--> statement-breakpoint
CREATE INDEX "contribution_obligations_due_idx" ON "contribution_obligations" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "contribution_records_obligation_idx" ON "contribution_records" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "gam3ya_memberships_user_idx" ON "gam3ya_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gam3ya_organizers_user_idx" ON "gam3ya_organizers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gam3yas_status_idx" ON "gam3yas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "membership_shares_membership_idx" ON "membership_shares" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payout_records_payout_idx" ON "payout_records" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "payouts_scheduled_idx" ON "payouts" USING btree ("scheduled_date");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_one_current" ON "policy_versions" USING btree ("kind") WHERE "policy_versions"."is_current";--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" USING btree (lower("email"));