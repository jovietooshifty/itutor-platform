-- =====================================================
-- 279: TWO MORE ENTRIES FOR THE VERIFICATION AUDIT LOG
-- =====================================================
-- WRITTEN, NOT APPLIED. Staging only from here. Rollback: supabase/rollbacks/279_verification_audit_actions_rollback.sql
-- Depends on 276. Safe to run twice. Drops no table and deletes no data.
--   REAPPLY  a teacher whose verification was revoked applied again
--   RESET    a verification was reset to "not started" by hand (scripts/reset-teacher-verification.sql)
-- =====================================================

BEGIN;

ALTER TABLE public.tutor_verification_v2_decisions DROP CONSTRAINT IF EXISTS tutor_verification_v2_decisions_action_check;
ALTER TABLE public.tutor_verification_v2_decisions
  ADD CONSTRAINT tutor_verification_v2_decisions_action_check
  CHECK (action IN ('APPROVE', 'REAPPROVE', 'REJECT', 'REVOKE', 'REQUIRE_REVERIFICATION', 'REQUEST_INFO',
                    'APPROVE_CREDENTIAL', 'REJECT_CREDENTIAL', 'REAPPLY', 'RESET'));

COMMIT;
