-- Date-based reminders. Idempotent: every reminder has a deterministic
-- dedupe_key, so running the job twice (or concurrently) never duplicates.
-- "Today" is evaluated in each Gam3ya's own timezone (default Africa/Cairo).
-- Only the recipient's own obligation/payout and the Gam3ya name are included.

CREATE OR REPLACE FUNCTION app.generate_reminders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer := 0; v_n integer;
BEGIN
  -- Contributions: due in 3 days, due tomorrow, first day overdue.
  WITH due AS (
    SELECT o.id, o.due_date, m.user_id, g.id AS gam3ya_id, g.name, g.grace_days,
           (now() AT TIME ZONE g.timezone)::date AS today
    FROM public.contribution_obligations o
    JOIN public.gam3ya_memberships m ON m.id = o.membership_id
    JOIN public.gam3yas g ON g.id = o.gam3ya_id
    JOIN public.profiles p ON p.id = m.user_id AND p.is_active
    LEFT JOIN public.notification_preferences np ON np.user_id = m.user_id
    WHERE g.status IN ('active','needs_closure')
      AND (o.record_status IS NULL)
      AND coalesce(np.contribution_reminders, true)
  ), picked AS (
    SELECT *, CASE
      WHEN due_date = today + 3 THEN 'contribution_due_3d'
      WHEN due_date = today + 1 THEN 'contribution_due_1d'
      WHEN due_date + grace_days = today - 1 THEN 'contribution_overdue'
    END AS kind FROM due
  )
  INSERT INTO public.notifications (user_id, kind, gam3ya_id, params, dedupe_key, email_status)
  SELECT user_id, kind, gam3ya_id, jsonb_build_object('gam3ya', name, 'date', due_date::text),
         kind || ':' || id, 'pending'
  FROM picked WHERE kind IS NOT NULL
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  -- Payouts: this week (within 7 days) and next calendar month.
  WITH pay AS (
    SELECT p.id, p.scheduled_date, m.user_id, g.id AS gam3ya_id, g.name,
           (now() AT TIME ZONE g.timezone)::date AS today
    FROM public.payouts p
    JOIN public.gam3yas g ON g.id = p.gam3ya_id AND p.schedule_version = g.current_schedule_version
    JOIN public.membership_shares s ON s.gam3ya_id = p.gam3ya_id AND s.share_number = p.recipient_share
    JOIN public.gam3ya_memberships m ON m.id = s.membership_id
    JOIN public.profiles pr ON pr.id = m.user_id AND pr.is_active
    LEFT JOIN public.notification_preferences np ON np.user_id = m.user_id
    WHERE g.status = 'active' AND p.record_status IS NULL AND coalesce(np.payout_reminders, true)
  ), picked AS (
    SELECT *, CASE
      WHEN scheduled_date BETWEEN today AND today + 6 THEN 'payout_this_week'
      WHEN date_trunc('month', scheduled_date) = date_trunc('month', today) + interval '1 month' THEN 'payout_next_month'
    END AS kind FROM pay
  )
  INSERT INTO public.notifications (user_id, kind, gam3ya_id, params, dedupe_key, email_status)
  SELECT user_id, kind, gam3ya_id, jsonb_build_object('gam3ya', name, 'date', scheduled_date::text),
         kind || ':' || id || ':' || user_id, 'pending'
  FROM picked WHERE kind IS NOT NULL
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_count := v_count + v_n;

  RETURN v_count;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.generate_reminders() FROM PUBLIC, anon, authenticated;
