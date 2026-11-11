-- Audited admin helpers used by the admin dashboard.

CREATE OR REPLACE FUNCTION app.admin_log(p_action text, p_entity_type text, p_entity_id text, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action NOT IN ('user.invited', 'report.exported', 'policy.published') THEN
    RAISE EXCEPTION 'invalid action' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app.write_audit(p_action, p_entity_type, p_entity_id, NULL, NULL, NULL, p_reason);
END $$;
--> statement-breakpoint

-- Publish a new policy version atomically: only one current version per kind.
CREATE OR REPLACE FUNCTION app.publish_policy(p_kind text, p_version text, p_summary text, p_requires_acceptance boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT app.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.policy_versions SET is_current = false WHERE kind = p_kind AND is_current;
  INSERT INTO public.policy_versions (kind, version, effective_at, is_current, requires_acceptance, summary)
  VALUES (p_kind, p_version, now(), true, p_requires_acceptance, p_summary) RETURNING id INTO v_id;
  PERFORM app.write_audit('policy.published', 'policy_version', v_id::text, NULL, NULL,
    jsonb_build_object('kind', p_kind, 'version', p_version), p_summary);
  RETURN v_id;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.admin_log(text, text, text, text), app.publish_policy(text, text, text, boolean) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.admin_log(text, text, text, text), app.publish_policy(text, text, text, boolean) TO authenticated;
