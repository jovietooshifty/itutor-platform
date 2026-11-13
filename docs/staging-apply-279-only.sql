-- =====================================================
-- STAGING: APPLY MIGRATION 279 ONLY  (audit log accepts REAPPLY and RESET)
-- =====================================================
-- Open the STAGING Supabase project (thjsdcbzlvjradczhgso) > SQL Editor. NEVER production.
-- Safe to run twice. Needs 272 and 276 already applied (check with docs/check-verification-migrations.sql).
-- Changes one CHECK constraint on tutor_verification_v2_decisions. Deletes nothing, touches no user.

BEGIN;

ALTER TABLE public.tutor_verification_v2_decisions DROP CONSTRAINT IF EXISTS tutor_verification_v2_decisions_action_check;
ALTER TABLE public.tutor_verification_v2_decisions
  ADD CONSTRAINT tutor_verification_v2_decisions_action_check
  CHECK (action IN ('APPROVE', 'REAPPROVE', 'REJECT', 'REVOKE', 'REQUIRE_REVERIFICATION', 'REQUEST_INFO',
                    'APPROVE_CREDENTIAL', 'REJECT_CREDENTIAL', 'REAPPLY', 'RESET'));

COMMIT;
