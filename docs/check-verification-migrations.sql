-- READ ONLY. Shows which verification migrations (270-279) are applied on this database.
-- Run in the STAGING project's SQL Editor (thjsdcbzlvjradczhgso). Changes nothing.
-- "applied" = the thing that migration creates exists.

SELECT m.migration, m.what_to_look_for,
       CASE WHEN m.found THEN 'applied' ELSE 'NOT applied' END AS state
FROM (VALUES
  ('270', 'table tutor_verification_v2',
     to_regclass('public.tutor_verification_v2') IS NOT NULL),
  ('271', 'table identity_webhook_events',
     to_regclass('public.identity_webhook_events') IS NOT NULL),
  ('272', 'table tutor_verification_v2_decisions',
     to_regclass('public.tutor_verification_v2_decisions') IS NOT NULL),
  ('273', 'column tutor_verification_v2.identity_redacted_at',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tutor_verification_v2' AND column_name='identity_redacted_at')),
  ('274', 'column tutor_verification_v2.identity_provider',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tutor_verification_v2' AND column_name='identity_provider')),
  ('275', 'table identity_outcomes',
     to_regclass('public.identity_outcomes') IS NOT NULL),
  ('276', 'column tutor_credentials_v2.title',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tutor_credentials_v2' AND column_name='title')),
  ('277', 'column tutor_verification_v2.legal_first_name',
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tutor_verification_v2' AND column_name='legal_first_name')),
  ('278', 'trigger trg_profiles_legal_name_mirror on profiles',
     EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_profiles_legal_name_mirror' AND NOT tgisinternal)),
  ('279', 'audit check allows REAPPLY and RESET',
     COALESCE((SELECT pg_get_constraintdef(c.oid) LIKE '%REAPPLY%' AND pg_get_constraintdef(c.oid) LIKE '%RESET%'
               FROM pg_constraint c
               WHERE c.conname='tutor_verification_v2_decisions_action_check'
                 AND c.conrelid = to_regclass('public.tutor_verification_v2_decisions')), false))
) AS m(migration, what_to_look_for, found)
ORDER BY m.migration;
