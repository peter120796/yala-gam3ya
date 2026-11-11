-- Event notifications are created by triggers in the same transaction as the
-- change, so they can't be forgotten or duplicated (dedupe_key is unique).
-- Content carries only the Gam3ya name — never another member's details.

CREATE OR REPLACE FUNCTION app.notify_payout_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.record_status IN ('reported_completed','confirmed_completed')
     AND NEW.record_status IS DISTINCT FROM OLD.record_status THEN
    INSERT INTO public.notifications (user_id, kind, gam3ya_id, params, dedupe_key, email_status)
    SELECT m.user_id, 'payout_marked_completed', NEW.gam3ya_id,
           jsonb_build_object('gam3ya', g.name),
           'payout_completed:' || NEW.id || ':' || m.user_id,
           'pending'
    FROM public.membership_shares s
    JOIN public.gam3ya_memberships m ON m.id = s.membership_id
    JOIN public.gam3yas g ON g.id = NEW.gam3ya_id
    WHERE s.gam3ya_id = NEW.gam3ya_id AND s.share_number = NEW.recipient_share
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payouts_notify AFTER UPDATE OF record_status ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION app.notify_payout_status();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.notify_gam3ya_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_kind text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    v_kind := 'gam3ya_completed';
  ELSIF NEW.current_schedule_version IS DISTINCT FROM OLD.current_schedule_version AND NEW.status = 'active' THEN
    v_kind := 'gam3ya_schedule_updated';
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (user_id, kind, gam3ya_id, params, dedupe_key, email_status)
  SELECT m.user_id, v_kind, NEW.id, jsonb_build_object('gam3ya', NEW.name),
         v_kind || ':' || NEW.id || ':v' || NEW.current_schedule_version || ':' || m.user_id,
         'pending'
  FROM public.gam3ya_memberships m
  WHERE m.gam3ya_id = NEW.id AND m.status = 'active'
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER gam3yas_notify AFTER UPDATE OF status, current_schedule_version ON public.gam3yas
  FOR EACH ROW EXECUTE FUNCTION app.notify_gam3ya_change();
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.notify_payout_status(), app.notify_gam3ya_change() FROM PUBLIC, anon, authenticated;
