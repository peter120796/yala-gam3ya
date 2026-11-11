-- ═══════════════════════════════════════════════════════════════════════════
-- Yala-Gam3ya security layer
--   * Least-privilege grants (Supabase grants ALL to anon/authenticated by
--     default — we revoke everything and grant back only what is needed).
--   * Row Level Security on every table.
--   * Financial writes only through SECURITY DEFINER functions in the private
--     `app` schema, which authorize, validate and write audit rows atomically.
--   * Append-only audit and status-history tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Lookup data ──────────────────────────────────────────────────────────
INSERT INTO public.roles (key, description) VALUES
  ('super_admin', 'Full platform administration'),
  ('organizer',   'Eligible to be assigned as a Gam3ya organizer'),
  ('member',      'Regular participant')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

INSERT INTO public.subscription_plans (key, features, is_active) VALUES
  ('free', '[]'::jsonb, false),
  ('premium', '["more_active_gam3yas","advanced_reports","calendar_export","extra_reminders","extended_history"]'::jsonb, false),
  ('organizer_pro', '["organizer_tools","advanced_reports","calendar_export"]'::jsonb, false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- ─── Private schema for helpers & RPCs (never exposed through the Data API) ─
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint

-- ─── Authorization helpers ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.is_active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
$$;
--> statement-breakpoint

-- Super admin powers require an MFA-verified session (aal2).
CREATE OR REPLACE FUNCTION app.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.platform_role = 'super_admin'
  ) AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.is_organizer_of(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gam3ya_organizers o
    JOIN public.profiles p ON p.id = o.user_id
    WHERE o.gam3ya_id = gid AND o.user_id = auth.uid() AND p.is_active
  )
$$;
--> statement-breakpoint

-- Members keep read access to Gam3yas they belonged to (history), never drafts.
CREATE OR REPLACE FUNCTION app.is_member_of(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gam3ya_memberships m
    JOIN public.gam3yas g ON g.id = m.gam3ya_id
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.gam3ya_id = gid AND m.user_id = auth.uid() AND p.is_active AND g.status <> 'draft'
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_manage(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.is_super_admin() OR app.is_organizer_of(gid)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.can_view(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.can_manage(gid) OR app.is_member_of(gid)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.is_draft(gid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.gam3yas g WHERE g.id = gid AND g.status = 'draft')
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.my_membership_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.id FROM public.gam3ya_memberships m
  JOIN public.gam3yas g ON g.id = m.gam3ya_id
  WHERE m.user_id = auth.uid() AND g.status <> 'draft' AND app.is_active_user()
$$;
--> statement-breakpoint

-- Organizers may see contact details only of people in Gam3yas they organize.
CREATE OR REPLACE FUNCTION app.organizes_user(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gam3ya_memberships m
    WHERE m.user_id = uid AND app.is_organizer_of(m.gam3ya_id)
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.gam3ya_today(gid uuid) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (now() AT TIME ZONE g.timezone)::date FROM public.gam3yas g WHERE g.id = gid
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_gam3ya uuid,
  p_before jsonb, p_after jsonb, p_reason text
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, gam3ya_id, before, after, reason)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_gam3ya, p_before, p_after, p_reason)
$$;
--> statement-breakpoint

-- ─── Triggers ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER gam3yas_touch BEFORE UPDATE ON public.gam3yas FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER user_preferences_touch BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER notification_preferences_touch BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

-- Append-only tables: history is never rewritten or deleted.
CREATE OR REPLACE FUNCTION app.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION app.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER contribution_records_append_only BEFORE UPDATE OR DELETE ON public.contribution_records FOR EACH ROW EXECUTE FUNCTION app.forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER payout_records_append_only BEFORE UPDATE OR DELETE ON public.payout_records FOR EACH ROW EXECUTE FUNCTION app.forbid_mutation();
--> statement-breakpoint

-- Financial configuration is frozen once a Gam3ya leaves draft, and status
-- may only change through the lifecycle functions (never a direct UPDATE).
CREATE OR REPLACE FUNCTION app.guard_gam3ya_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       NEW.total_shares IS DISTINCT FROM OLD.total_shares
    OR NEW.contribution_per_share IS DISTINCT FROM OLD.contribution_per_share
    OR NEW.frequency IS DISTINCT FROM OLD.frequency
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.due_day IS DISTINCT FROM OLD.due_day
    OR NEW.payout_offset_days IS DISTINCT FROM OLD.payout_offset_days
    OR NEW.timezone IS DISTINCT FROM OLD.timezone
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'financial configuration of a non-draft Gam3ya is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user = 'authenticated' AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.current_schedule_version IS DISTINCT FROM OLD.current_schedule_version
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
  ) THEN
    RAISE EXCEPTION 'lifecycle fields change only through lifecycle functions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER gam3yas_guard BEFORE UPDATE ON public.gam3yas FOR EACH ROW EXECUTE FUNCTION app.guard_gam3ya_update();
--> statement-breakpoint

-- Generic audit for administrative tables written directly (drafts, roles…).
CREATE OR REPLACE FUNCTION app.audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row jsonb := to_jsonb(coalesce(NEW, OLD));
  v_gam3ya uuid := CASE WHEN TG_TABLE_NAME = 'gam3yas' THEN (v_row ->> 'id')::uuid ELSE (v_row ->> 'gam3ya_id')::uuid END;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, gam3ya_id, before, after)
  VALUES (
    auth.uid(), lower(TG_OP), TG_TABLE_NAME,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    CASE WHEN TG_OP = 'DELETE' AND TG_TABLE_NAME = 'gam3yas' THEN NULL ELSE v_gam3ya END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER gam3yas_audit AFTER INSERT OR UPDATE OR DELETE ON public.gam3yas FOR EACH ROW EXECUTE FUNCTION app.audit_row();
--> statement-breakpoint
CREATE TRIGGER gam3ya_organizers_audit AFTER INSERT OR UPDATE OR DELETE ON public.gam3ya_organizers FOR EACH ROW EXECUTE FUNCTION app.audit_row();
--> statement-breakpoint
CREATE TRIGGER gam3ya_memberships_audit AFTER INSERT OR UPDATE OR DELETE ON public.gam3ya_memberships FOR EACH ROW EXECUTE FUNCTION app.audit_row();
--> statement-breakpoint
CREATE TRIGGER membership_shares_audit AFTER INSERT OR UPDATE OR DELETE ON public.membership_shares FOR EACH ROW EXECUTE FUNCTION app.audit_row();
--> statement-breakpoint
CREATE TRIGGER policy_versions_audit AFTER INSERT OR UPDATE OR DELETE ON public.policy_versions FOR EACH ROW EXECUTE FUNCTION app.audit_row();
--> statement-breakpoint

-- New auth user → profile + default preferences.
CREATE OR REPLACE FUNCTION app.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    left(coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''), split_part(NEW.email, '@', 1), 'User'), 80),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_preferences (user_id, locale)
  VALUES (NEW.id, CASE WHEN NEW.raw_user_meta_data ->> 'locale' = 'en' THEN 'en' ELSE 'ar' END)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION app.handle_new_user();
--> statement-breakpoint

-- Keep profiles.email in sync when a user changes their email.
CREATE OR REPLACE FUNCTION app.handle_user_email_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION app.handle_user_email_change();
--> statement-breakpoint

-- ─── Grants: start from nothing ───────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
--> statement-breakpoint

GRANT SELECT ON public.roles, public.subscription_plans TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.policy_versions TO anon, authenticated;
--> statement-breakpoint
GRANT SELECT, UPDATE (display_name, phone) ON public.profiles TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (locale, theme, privacy_mode) ON public.user_preferences TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (email_enabled, contribution_reminders, payout_reminders, gam3ya_updates) ON public.notification_preferences TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE, UPDATE (name, description, total_shares, contribution_per_share, frequency, start_date, due_day, payout_offset_days, grace_days, allow_self_report) ON public.gam3yas TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.gam3ya_organizers TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.gam3ya_memberships, public.membership_shares, public.payout_turns, public.schedule_versions TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.contribution_obligations, public.payouts TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.contribution_records, public.payout_records, public.change_requests, public.audit_logs, public.subscriptions TO authenticated;
--> statement-breakpoint
GRANT SELECT, UPDATE (read_at) ON public.notifications TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.policy_acceptances TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (is_current, summary) ON public.policy_versions TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.billing_events TO authenticated;
--> statement-breakpoint

-- ─── Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.gam3yas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.gam3ya_organizers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.gam3ya_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_shares ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.schedule_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.payout_turns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.contribution_obligations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.contribution_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.payout_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY plans_read ON public.subscription_plans FOR SELECT TO authenticated USING (true);
--> statement-breakpoint

-- profiles: yourself, admins, and organizers for people in their Gam3yas.
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR app.is_super_admin() OR app.organizes_user(id));
--> statement-breakpoint
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) AND is_active) WITH CHECK (id = (SELECT auth.uid()));
--> statement-breakpoint

CREATE POLICY prefs_own ON public.user_preferences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY notif_prefs_own ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
--> statement-breakpoint

-- gam3yas
CREATE POLICY gam3yas_select ON public.gam3yas FOR SELECT TO authenticated USING (app.can_view(id));
--> statement-breakpoint
CREATE POLICY gam3yas_insert ON public.gam3yas FOR INSERT TO authenticated
  WITH CHECK (app.is_super_admin() AND status = 'draft' AND created_by = (SELECT auth.uid()));
--> statement-breakpoint
-- Admins edit drafts; on active Gam3yas only name/description/self-report change (trigger freezes the rest).
CREATE POLICY gam3yas_update ON public.gam3yas FOR UPDATE TO authenticated
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
--> statement-breakpoint
CREATE POLICY gam3yas_delete_draft ON public.gam3yas FOR DELETE TO authenticated
  USING (app.is_super_admin() AND status = 'draft');
--> statement-breakpoint

CREATE POLICY organizers_select ON public.gam3ya_organizers FOR SELECT TO authenticated USING (app.can_view(gam3ya_id));
--> statement-breakpoint
CREATE POLICY organizers_write ON public.gam3ya_organizers FOR INSERT TO authenticated WITH CHECK (app.is_super_admin());
--> statement-breakpoint
CREATE POLICY organizers_delete ON public.gam3ya_organizers FOR DELETE TO authenticated USING (app.is_super_admin());
--> statement-breakpoint

CREATE POLICY memberships_select ON public.gam3ya_memberships FOR SELECT TO authenticated
  USING (id IN (SELECT app.my_membership_ids()) OR app.can_manage(gam3ya_id));
--> statement-breakpoint
CREATE POLICY memberships_insert ON public.gam3ya_memberships FOR INSERT TO authenticated
  WITH CHECK (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint
CREATE POLICY memberships_delete ON public.gam3ya_memberships FOR DELETE TO authenticated
  USING (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint

CREATE POLICY shares_select ON public.membership_shares FOR SELECT TO authenticated
  USING (membership_id IN (SELECT app.my_membership_ids()) OR app.can_manage(gam3ya_id));
--> statement-breakpoint
CREATE POLICY shares_insert ON public.membership_shares FOR INSERT TO authenticated
  WITH CHECK (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint
CREATE POLICY shares_delete ON public.membership_shares FOR DELETE TO authenticated
  USING (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint

CREATE POLICY versions_select ON public.schedule_versions FOR SELECT TO authenticated USING (app.can_view(gam3ya_id));
--> statement-breakpoint
CREATE POLICY versions_insert ON public.schedule_versions FOR INSERT TO authenticated
  WITH CHECK (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint
CREATE POLICY versions_delete ON public.schedule_versions FOR DELETE TO authenticated
  USING (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint

-- Payout order (share → cycle) is visible to everyone in the Gam3ya.
CREATE POLICY turns_select ON public.payout_turns FOR SELECT TO authenticated USING (app.can_view(gam3ya_id));
--> statement-breakpoint
CREATE POLICY turns_insert ON public.payout_turns FOR INSERT TO authenticated
  WITH CHECK (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint
CREATE POLICY turns_delete ON public.payout_turns FOR DELETE TO authenticated
  USING (app.is_super_admin() AND app.is_draft(gam3ya_id));
--> statement-breakpoint

-- Contributions: your own, or everything for managers of that Gam3ya.
CREATE POLICY obligations_select ON public.contribution_obligations FOR SELECT TO authenticated
  USING (membership_id IN (SELECT app.my_membership_ids()) OR app.can_manage(gam3ya_id));
--> statement-breakpoint
CREATE POLICY obligations_insert ON public.contribution_obligations FOR INSERT TO authenticated
  WITH CHECK (app.is_super_admin() AND app.is_draft(gam3ya_id) AND record_status IS NULL);
--> statement-breakpoint
CREATE POLICY contribution_records_select ON public.contribution_records FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contribution_obligations o
    WHERE o.id = obligation_id
      AND (o.membership_id IN (SELECT app.my_membership_ids()) OR app.can_manage(o.gam3ya_id))
  ));
--> statement-breakpoint

-- Payout rows: managers see all; members see payouts of shares they hold.
CREATE POLICY payouts_select ON public.payouts FOR SELECT TO authenticated
  USING (app.can_manage(gam3ya_id) OR EXISTS (
    SELECT 1 FROM public.membership_shares s
    WHERE s.gam3ya_id = payouts.gam3ya_id AND s.share_number = payouts.recipient_share
      AND s.membership_id IN (SELECT app.my_membership_ids())
  ));
--> statement-breakpoint
CREATE POLICY payouts_insert ON public.payouts FOR INSERT TO authenticated
  WITH CHECK (app.is_super_admin() AND app.is_draft(gam3ya_id) AND record_status IS NULL);
--> statement-breakpoint
CREATE POLICY payout_records_select ON public.payout_records FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payouts p WHERE p.id = payout_id AND app.can_manage(p.gam3ya_id)
  ));
--> statement-breakpoint

CREATE POLICY change_requests_select ON public.change_requests FOR SELECT TO authenticated USING (app.can_manage(gam3ya_id));
--> statement-breakpoint

CREATE POLICY notifications_own ON public.notifications FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY notifications_mark_read ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
--> statement-breakpoint

CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
  USING (app.is_super_admin() OR (gam3ya_id IS NOT NULL AND app.is_organizer_of(gam3ya_id)));
--> statement-breakpoint

CREATE POLICY policy_versions_read ON public.policy_versions FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY policy_versions_admin_insert ON public.policy_versions FOR INSERT TO authenticated WITH CHECK (app.is_super_admin());
--> statement-breakpoint
CREATE POLICY policy_versions_admin_update ON public.policy_versions FOR UPDATE TO authenticated USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
--> statement-breakpoint

CREATE POLICY acceptances_own_select ON public.policy_acceptances FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR app.is_super_admin());
--> statement-breakpoint
CREATE POLICY acceptances_own_insert ON public.policy_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.policy_versions v WHERE v.id = policy_version_id AND v.is_current
  ));
--> statement-breakpoint

CREATE POLICY subscriptions_own ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR app.is_super_admin());
--> statement-breakpoint
CREATE POLICY billing_events_admin ON public.billing_events FOR SELECT TO authenticated USING (app.is_super_admin());
--> statement-breakpoint

-- ─── Read RPCs: what members may see about other participants ─────────────
-- Payout order with display names only (no contact info, no others' payment status).
CREATE OR REPLACE FUNCTION app.gam3ya_turns(gid uuid)
RETURNS TABLE (
  cycle_number smallint, share_number smallint, scheduled_date date, expected_amount bigint,
  is_completed boolean, holders jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.can_view(gid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT p.cycle_number, p.recipient_share, p.scheduled_date, p.expected_amount,
         (p.record_status = 'confirmed_completed') AS is_completed,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'display_name', pr.display_name,
                    'portion_bp', s.portion_bp,
                    'is_me', m.user_id = auth.uid()
                  ) ORDER BY s.portion_bp DESC, pr.display_name)
           FROM public.membership_shares s
           JOIN public.gam3ya_memberships m ON m.id = s.membership_id
           JOIN public.profiles pr ON pr.id = m.user_id
           WHERE s.gam3ya_id = gid AND s.share_number = p.recipient_share
         ), '[]'::jsonb)
  FROM public.payouts p
  JOIN public.gam3yas g ON g.id = p.gam3ya_id AND p.schedule_version = g.current_schedule_version
  WHERE p.gam3ya_id = gid
  ORDER BY p.cycle_number;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.gam3ya_organizer_names(gid uuid)
RETURNS TABLE (display_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.can_view(gid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT pr.display_name FROM public.gam3ya_organizers o
    JOIN public.profiles pr ON pr.id = o.user_id WHERE o.gam3ya_id = gid ORDER BY pr.display_name;
END $$;
--> statement-breakpoint

-- ─── Write RPCs ───────────────────────────────────────────────────────────
-- Record a contribution status. Informational only — never bank-verified.
CREATE OR REPLACE FUNCTION app.record_contribution(
  p_obligation uuid, p_status text, p_payment_date date, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  o public.contribution_obligations%ROWTYPE;
  g public.gam3yas%ROWTYPE;
  v_owner uuid;
  v_manager boolean;
BEGIN
  SELECT * INTO o FROM public.contribution_obligations WHERE id = p_obligation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found'; END IF;
  SELECT * INTO g FROM public.gam3yas WHERE id = o.gam3ya_id;
  SELECT m.user_id INTO v_owner FROM public.gam3ya_memberships m WHERE m.id = o.membership_id;

  IF p_status IS NOT NULL AND p_status NOT IN ('reported_paid','recorded_paid','waived') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = 'check_violation';
  END IF;

  v_manager := app.is_super_admin() OR (app.is_organizer_of(g.id) AND g.status IN ('active','needs_closure'));
  IF NOT v_manager THEN
    -- Member self-report: own obligation, feature enabled, nothing recorded yet.
    IF NOT (v_owner = auth.uid() AND app.is_active_user() AND g.allow_self_report
            AND g.status IN ('active','needs_closure')
            AND p_status = 'reported_paid' AND o.record_status IS NULL) THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF g.status IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'gam3ya is not active' USING ERRCODE = 'check_violation';
  END IF;
  IF g.status = 'completed' AND NOT app.is_super_admin() THEN
    RAISE EXCEPTION 'archived gam3yas are read-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (p_status = 'waived' OR p_status IS NULL OR g.status = 'completed')
     AND char_length(coalesce(trim(p_reason), '')) < 3 THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IS NOT DISTINCT FROM o.record_status THEN
    RAISE EXCEPTION 'status unchanged' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.contribution_obligations SET
    record_status = p_status,
    recorded_payment_date = CASE WHEN p_status IN ('recorded_paid','reported_paid')
                                 THEN coalesce(p_payment_date, app.gam3ya_today(g.id)) END,
    recorded_by = auth.uid(),
    status_reason = nullif(trim(p_reason), ''),
    status_updated_at = now()
  WHERE id = o.id;

  INSERT INTO public.contribution_records (obligation_id, from_status, to_status, recorded_payment_date, reason, recorded_by)
  VALUES (o.id, o.record_status, p_status, p_payment_date, nullif(trim(p_reason), ''), auth.uid());

  PERFORM app.write_audit('contribution.' || coalesce(p_status, 'cleared'), 'contribution_obligation', o.id::text, g.id,
    jsonb_build_object('status', o.record_status), jsonb_build_object('status', p_status, 'payment_date', p_payment_date), p_reason);
  IF g.status IN ('active','needs_closure') THEN PERFORM app.apply_lifecycle(g.id); END IF;
END $$;
--> statement-breakpoint

-- Record a payout status. Organizers report/confirm/delay; the recipient may
-- confirm receipt of a payout the organizer reported as completed.
CREATE OR REPLACE FUNCTION app.record_payout(
  p_payout uuid, p_status text, p_completion_date date, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.payouts%ROWTYPE;
  g public.gam3yas%ROWTYPE;
  v_manager boolean;
  v_recipient boolean;
BEGIN
  SELECT * INTO p FROM public.payouts WHERE id = p_payout FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found'; END IF;
  SELECT * INTO g FROM public.gam3yas WHERE id = p.gam3ya_id;

  IF p.schedule_version <> g.current_schedule_version THEN
    RAISE EXCEPTION 'payout belongs to a superseded schedule' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('reported_completed','confirmed_completed','delayed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = 'check_violation';
  END IF;
  IF g.status IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'gam3ya is not active' USING ERRCODE = 'check_violation';
  END IF;

  v_manager := app.is_super_admin() OR (app.is_organizer_of(g.id) AND g.status IN ('active','needs_closure'));
  v_recipient := EXISTS (
    SELECT 1 FROM public.membership_shares s JOIN public.gam3ya_memberships m ON m.id = s.membership_id
    WHERE s.gam3ya_id = g.id AND s.share_number = p.recipient_share AND m.user_id = auth.uid()
  ) AND app.is_active_user();

  IF NOT v_manager AND NOT (v_recipient AND g.status IN ('active','needs_closure')
        AND p.record_status = 'reported_completed' AND p_status = 'confirmed_completed') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF g.status = 'completed' AND NOT app.is_super_admin() THEN
    RAISE EXCEPTION 'archived gam3yas are read-only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (p_status = 'delayed' OR p_status IS NULL OR g.status = 'completed')
     AND char_length(coalesce(trim(p_reason), '')) < 3 THEN
    RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IS NOT DISTINCT FROM p.record_status THEN
    RAISE EXCEPTION 'status unchanged' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.payouts SET
    record_status = p_status,
    recorded_completion_date = CASE WHEN p_status IN ('reported_completed','confirmed_completed')
                                    THEN coalesce(p_completion_date, p.recorded_completion_date, app.gam3ya_today(g.id)) END,
    recorded_by = auth.uid(),
    status_reason = nullif(trim(p_reason), ''),
    status_updated_at = now()
  WHERE id = p.id;

  INSERT INTO public.payout_records (payout_id, from_status, to_status, recorded_completion_date, reason, recorded_by)
  VALUES (p.id, p.record_status, p_status, p_completion_date, nullif(trim(p_reason), ''), auth.uid());

  PERFORM app.write_audit('payout.' || coalesce(p_status, 'cleared'), 'payout', p.id::text, g.id,
    jsonb_build_object('status', p.record_status), jsonb_build_object('status', p_status, 'completion_date', p_completion_date), p_reason);
  IF g.status IN ('active','needs_closure') THEN PERFORM app.apply_lifecycle(g.id); END IF;
END $$;
--> statement-breakpoint

-- Activation re-verifies the whole schedule in the database, independent of
-- application code. Any inconsistency aborts the transaction.
CREATE OR REPLACE FUNCTION app.activate_gam3ya(gid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  g public.gam3yas%ROWTYPE;
  v_bad int;
  v_pot bigint;
BEGIN
  IF NOT app.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO g FROM public.gam3yas WHERE id = gid FOR UPDATE;
  IF NOT FOUND OR g.status <> 'draft' THEN
    RAISE EXCEPTION 'only drafts can be activated' USING ERRCODE = 'check_violation';
  END IF;
  v_pot := g.contribution_per_share * g.total_shares;

  IF NOT EXISTS (SELECT 1 FROM public.gam3ya_organizers WHERE gam3ya_id = gid) THEN
    RAISE EXCEPTION 'ACTIVATION_NO_ORGANIZER' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.gam3ya_memberships m JOIN public.profiles p ON p.id = m.user_id
    WHERE m.gam3ya_id = gid AND (NOT p.is_active OR m.status <> 'active')
  ) THEN
    RAISE EXCEPTION 'ACTIVATION_INACTIVE_MEMBER' USING ERRCODE = 'check_violation';
  END IF;

  -- Every share 1..N held by exactly 100%, max two holders, exact split amounts.
  SELECT count(*) INTO v_bad FROM generate_series(1, g.total_shares) n
  LEFT JOIN (
    SELECT share_number, sum(portion_bp) AS bp, count(*) AS holders
    FROM public.membership_shares WHERE gam3ya_id = gid GROUP BY share_number
  ) s ON s.share_number = n
  WHERE s.bp IS DISTINCT FROM 10000 OR s.holders > 2;
  IF v_bad > 0 OR EXISTS (SELECT 1 FROM public.membership_shares WHERE gam3ya_id = gid AND share_number > g.total_shares) THEN
    RAISE EXCEPTION 'ACTIVATION_SHARES_INCOMPLETE' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.membership_shares WHERE gam3ya_id = gid
             AND ((g.contribution_per_share * portion_bp) % 10000 <> 0 OR (v_pot * portion_bp) % 10000 <> 0)) THEN
    RAISE EXCEPTION 'ACTIVATION_SPLIT_NOT_EXACT' USING ERRCODE = 'check_violation';
  END IF;

  -- Payout turns: a bijection between shares 1..N and cycles 1..N (version 1).
  IF (SELECT count(*) FROM public.payout_turns WHERE gam3ya_id = gid AND schedule_version = 1) <> g.total_shares
     OR EXISTS (SELECT 1 FROM public.payout_turns WHERE gam3ya_id = gid AND schedule_version = 1
                AND (share_number > g.total_shares OR cycle_number > g.total_shares)) THEN
    RAISE EXCEPTION 'ACTIVATION_TURNS_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  -- Payouts: one per cycle, pot = contribution × shares, matching turns, dated due + offset.
  SELECT count(*) INTO v_bad FROM generate_series(1, g.total_shares) c
  LEFT JOIN public.payouts p ON p.gam3ya_id = gid AND p.schedule_version = 1 AND p.cycle_number = c
  LEFT JOIN public.payout_turns t ON t.gam3ya_id = gid AND t.schedule_version = 1 AND t.cycle_number = c
  WHERE p.id IS NULL OR p.expected_amount <> v_pot OR p.recipient_share IS DISTINCT FROM t.share_number;
  IF v_bad > 0 OR (SELECT count(*) FROM public.payouts WHERE gam3ya_id = gid) <> g.total_shares THEN
    RAISE EXCEPTION 'ACTIVATION_PAYOUTS_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  -- Obligations: exactly one per (cycle, holding member) with the exact amount,
  -- every cycle sharing one due date, payouts dated due date + offset.
  WITH expected AS (
    SELECT s.membership_id, sum(g.contribution_per_share * s.portion_bp / 10000) AS amount
    FROM public.membership_shares s WHERE s.gam3ya_id = gid GROUP BY s.membership_id
  ), grid AS (
    SELECT c AS cycle_number, e.membership_id, e.amount
    FROM generate_series(1, g.total_shares) c CROSS JOIN expected e
  )
  SELECT count(*) INTO v_bad FROM grid
  FULL JOIN (SELECT * FROM public.contribution_obligations WHERE gam3ya_id = gid) o
    ON o.cycle_number = grid.cycle_number AND o.membership_id = grid.membership_id
  WHERE grid.membership_id IS NULL OR o.id IS NULL OR o.amount <> grid.amount OR o.schedule_version <> 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ACTIVATION_OBLIGATIONS_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.contribution_obligations o
    JOIN public.payouts p ON p.gam3ya_id = gid AND p.cycle_number = o.cycle_number
    WHERE o.gam3ya_id = gid AND p.scheduled_date <> o.due_date + g.payout_offset_days
  ) OR EXISTS (
    SELECT 1 FROM public.contribution_obligations WHERE gam3ya_id = gid
    GROUP BY cycle_number HAVING count(DISTINCT due_date) > 1
  ) OR EXISTS (
    SELECT 1 FROM (
      SELECT cycle_number, scheduled_date, lag(scheduled_date) OVER (ORDER BY cycle_number) AS prev
      FROM public.payouts WHERE gam3ya_id = gid
    ) x WHERE x.prev IS NOT NULL AND x.scheduled_date <= x.prev
  ) OR EXISTS (
    SELECT 1 FROM public.contribution_obligations WHERE gam3ya_id = gid AND due_date < g.start_date
  ) THEN
    RAISE EXCEPTION 'ACTIVATION_DATES_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.gam3yas SET
    status = 'active',
    current_schedule_version = 1,
    end_date = (SELECT max(scheduled_date) FROM public.payouts WHERE gam3ya_id = gid),
    activated_at = now(),
    activated_by = auth.uid()
  WHERE id = gid;

  PERFORM app.write_audit('gam3ya.activated', 'gam3ya', gid::text, gid, NULL,
    jsonb_build_object('total_shares', g.total_shares, 'contribution_per_share', g.contribution_per_share), NULL);
END $$;
--> statement-breakpoint

-- Completion: archive only when everything is settled; otherwise flag
-- "needs closure" after the end date. Never archives just because time passed.
-- Internal (not granted): called after every recording and by the daily job.
CREATE OR REPLACE FUNCTION app.apply_lifecycle(gid uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  g public.gam3yas%ROWTYPE;
  v_open int;
  v_next text;
BEGIN
  SELECT * INTO g FROM public.gam3yas WHERE id = gid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found'; END IF;
  IF g.status NOT IN ('active','needs_closure') THEN RETURN g.status; END IF;

  SELECT
    (SELECT count(*) FROM public.contribution_obligations
       WHERE gam3ya_id = gid AND (record_status IS NULL OR record_status = 'reported_paid'))
  + (SELECT count(*) FROM public.payouts
       WHERE gam3ya_id = gid AND schedule_version = g.current_schedule_version
         AND record_status IS DISTINCT FROM 'confirmed_completed')
  INTO v_open;

  IF v_open = 0 THEN
    v_next := 'completed';
  ELSIF app.gam3ya_today(gid) > g.end_date THEN
    v_next := 'needs_closure';
  ELSE
    v_next := 'active';
  END IF;

  IF v_next <> g.status THEN
    UPDATE public.gam3yas SET
      status = v_next,
      completed_at = CASE WHEN v_next = 'completed' THEN now() END,
      archived_at  = CASE WHEN v_next = 'completed' THEN now() END
    WHERE id = gid;
    PERFORM app.write_audit('gam3ya.' || v_next, 'gam3ya', gid::text, gid,
      jsonb_build_object('status', g.status), jsonb_build_object('status', v_next), NULL);
  END IF;
  RETURN v_next;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.evaluate_lifecycle(gid uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.can_manage(gid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN app.apply_lifecycle(gid);
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.restore_gam3ya(gid uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.gam3yas%ROWTYPE;
BEGIN
  IF NOT app.is_super_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF char_length(coalesce(trim(p_reason), '')) < 3 THEN RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO g FROM public.gam3yas WHERE id = gid FOR UPDATE;
  IF NOT FOUND OR g.status <> 'completed' THEN RAISE EXCEPTION 'only completed gam3yas can be restored' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.gam3yas SET status = 'needs_closure', completed_at = NULL, archived_at = NULL WHERE id = gid;
  PERFORM app.write_audit('gam3ya.restored', 'gam3ya', gid::text, gid, jsonb_build_object('status', 'completed'),
    jsonb_build_object('status', 'needs_closure'), p_reason);
END $$;
--> statement-breakpoint

-- Organizer proposes a payout-turn swap on an active Gam3ya.
CREATE OR REPLACE FUNCTION app.propose_turn_swap(gid uuid, p_share_a smallint, p_share_b smallint, p_reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.gam3yas%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO g FROM public.gam3yas WHERE id = gid;
  IF NOT FOUND OR NOT app.can_manage(gid) THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'only active gam3yas' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(coalesce(trim(p_reason), '')) < 3 THEN RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation'; END IF;
  IF p_share_a = p_share_b OR p_share_a NOT BETWEEN 1 AND g.total_shares OR p_share_b NOT BETWEEN 1 AND g.total_shares THEN
    RAISE EXCEPTION 'invalid shares' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.change_requests (gam3ya_id, kind, share_a, share_b, reason, proposed_by)
  VALUES (gid, 'swap_turns', p_share_a, p_share_b, trim(p_reason), auth.uid()) RETURNING id INTO v_id;
  PERFORM app.write_audit('change_request.proposed', 'change_request', v_id::text, gid, NULL,
    jsonb_build_object('share_a', p_share_a, 'share_b', p_share_b), p_reason);
  RETURN v_id;
END $$;
--> statement-breakpoint

-- Admin reviews a change. Approval creates a new schedule version; the old
-- version (and its payout history) is preserved unchanged.
CREATE OR REPLACE FUNCTION app.review_change_request(p_request uuid, p_approve boolean, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.change_requests%ROWTYPE;
  g public.gam3yas%ROWTYPE;
  v_new int;
  v_open int;
BEGIN
  IF NOT app.is_super_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO r FROM public.change_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'request is not pending' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO g FROM public.gam3yas WHERE id = r.gam3ya_id FOR UPDATE;

  IF p_approve THEN
    IF g.status <> 'active' THEN RAISE EXCEPTION 'only active gam3yas' USING ERRCODE = 'check_violation'; END IF;
    -- Both affected payouts must still be open (not reported/confirmed).
    SELECT count(*) INTO v_open FROM public.payouts
      WHERE gam3ya_id = g.id AND schedule_version = g.current_schedule_version
        AND recipient_share IN (r.share_a, r.share_b)
        AND (record_status IS NULL OR record_status = 'delayed');
    IF v_open <> 2 THEN RAISE EXCEPTION 'CHANGE_PAYOUT_ALREADY_RECORDED' USING ERRCODE = 'check_violation'; END IF;

    v_new := g.current_schedule_version + 1;
    INSERT INTO public.schedule_versions (gam3ya_id, version, reason, created_by)
      VALUES (g.id, v_new, r.reason, auth.uid());
    INSERT INTO public.payout_turns (gam3ya_id, schedule_version, share_number, cycle_number)
      SELECT gam3ya_id, v_new,
             CASE share_number WHEN r.share_a THEN r.share_b WHEN r.share_b THEN r.share_a ELSE share_number END,
             cycle_number
      FROM public.payout_turns WHERE gam3ya_id = g.id AND schedule_version = g.current_schedule_version;
    INSERT INTO public.payouts (gam3ya_id, schedule_version, cycle_number, recipient_share, expected_amount, scheduled_date,
                                record_status, recorded_completion_date, recorded_by, status_reason, status_updated_at)
      SELECT gam3ya_id, v_new, cycle_number,
             CASE recipient_share WHEN r.share_a THEN r.share_b WHEN r.share_b THEN r.share_a ELSE recipient_share END,
             expected_amount, scheduled_date,
             CASE WHEN recipient_share IN (r.share_a, r.share_b) THEN NULL ELSE record_status END,
             CASE WHEN recipient_share IN (r.share_a, r.share_b) THEN NULL ELSE recorded_completion_date END,
             CASE WHEN recipient_share IN (r.share_a, r.share_b) THEN NULL ELSE recorded_by END,
             CASE WHEN recipient_share IN (r.share_a, r.share_b) THEN NULL ELSE status_reason END,
             CASE WHEN recipient_share IN (r.share_a, r.share_b) THEN NULL ELSE status_updated_at END
      FROM public.payouts WHERE gam3ya_id = g.id AND schedule_version = g.current_schedule_version;
    UPDATE public.gam3yas SET current_schedule_version = v_new WHERE id = g.id;
  END IF;

  UPDATE public.change_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), review_note = nullif(trim(p_note), ''), reviewed_at = now()
  WHERE id = r.id;
  PERFORM app.write_audit(CASE WHEN p_approve THEN 'change_request.approved' ELSE 'change_request.rejected' END,
    'change_request', r.id::text, g.id, NULL, jsonb_build_object('new_version', v_new), p_note);
END $$;
--> statement-breakpoint

-- Admin user management (roles & activation); passwords are never visible.
CREATE OR REPLACE FUNCTION app.admin_set_user_role(p_user uuid, p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old text;
BEGIN
  IF NOT app.is_super_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'cannot change your own role' USING ERRCODE = 'check_violation'; END IF;
  SELECT platform_role INTO v_old FROM public.profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found'; END IF;
  UPDATE public.profiles SET platform_role = p_role WHERE id = p_user;
  PERFORM app.write_audit('user.role_changed', 'profile', p_user::text, NULL,
    jsonb_build_object('role', v_old), jsonb_build_object('role', p_role), NULL);
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.admin_set_user_active(p_user uuid, p_active boolean, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.is_super_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'cannot deactivate yourself' USING ERRCODE = 'check_violation'; END IF;
  IF char_length(coalesce(trim(p_reason), '')) < 3 THEN RAISE EXCEPTION 'a reason is required' USING ERRCODE = 'check_violation'; END IF;
  -- Deactivation keeps every historical record; nothing is deleted.
  UPDATE public.profiles SET
    is_active = p_active,
    deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END,
    deactivated_by = CASE WHEN p_active THEN NULL ELSE auth.uid() END
  WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM app.write_audit(CASE WHEN p_active THEN 'user.reactivated' ELSE 'user.deactivated' END,
    'profile', p_user::text, NULL, NULL, jsonb_build_object('is_active', p_active), p_reason);
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.mark_onboarded() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.profiles SET onboarded_at = coalesce(onboarded_at, now()) WHERE id = auth.uid()
$$;
--> statement-breakpoint

-- ─── Function execute grants (everything else stays private) ──────────────
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  app.is_active_user(), app.is_super_admin(), app.is_organizer_of(uuid), app.is_member_of(uuid),
  app.can_manage(uuid), app.can_view(uuid), app.is_draft(uuid), app.my_membership_ids(),
  app.organizes_user(uuid), app.gam3ya_today(uuid),
  app.gam3ya_turns(uuid), app.gam3ya_organizer_names(uuid),
  app.record_contribution(uuid, text, date, text), app.record_payout(uuid, text, date, text),
  app.activate_gam3ya(uuid), app.evaluate_lifecycle(uuid), app.restore_gam3ya(uuid, text),
  app.propose_turn_swap(uuid, smallint, smallint, text), app.review_change_request(uuid, boolean, text),
  app.admin_set_user_role(uuid, text), app.admin_set_user_active(uuid, boolean, text), app.mark_onboarded()
TO authenticated;
