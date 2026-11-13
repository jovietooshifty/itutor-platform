-- =====================================================
-- ROLLBACK for 279_verification_audit_actions.sql
-- =====================================================
-- Run by hand, staging only. The audit table is append-only, so existing REAPPLY and RESET rows stay;
-- the narrower check is added NOT VALID (it applies to new rows only).

BEGIN;

ALTER TABLE public.tutor_verification_v2_decisions DROP CONSTRAINT IF EXISTS tutor_verification_v2_decisions_action_check;
ALTER TABLE public.tutor_verification_v2_decisions
  ADD CONSTRAINT tutor_verification_v2_decisions_action_check
  CHECK (action IN ('APPROVE', 'REAPPROVE', 'REJECT', 'REVOKE', 'REQUIRE_REVERIFICATION', 'REQUEST_INFO',
                    'APPROVE_CREDENTIAL', 'REJECT_CREDENTIAL')) NOT VALID;

COMMIT;
