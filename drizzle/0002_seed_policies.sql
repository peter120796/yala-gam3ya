-- Initial policy versions (legal text lives in src/content/legal). Publishing a
-- new version later = insert a row, flip is_current; users re-accept on next visit.
INSERT INTO public.policy_versions (kind, version, effective_at, is_current, requires_acceptance, summary) VALUES
  ('terms',        '1.0-draft', now(), true, true,  'Initial draft — pending Egyptian legal counsel review'),
  ('privacy',      '1.0-draft', now(), true, true,  'Initial draft — pending Egyptian legal counsel review'),
  ('disclaimer',   '1.0-draft', now(), true, false, 'Initial draft — pending Egyptian legal counsel review'),
  ('subscription', '1.0-draft', now(), true, false, 'Initial draft — no paid plans are active')
ON CONFLICT (kind, version) DO NOTHING;
