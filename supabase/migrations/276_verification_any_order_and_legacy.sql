-- =====================================================
-- 276: ANY-ORDER CHECKLIST, CREDENTIAL TITLES, RE-APPROVE, LEGACY CARRY-OVER
-- =====================================================
-- WRITTEN, NOT APPLIED. Staging only from here. Rollback: supabase/rollbacks/276_verification_any_order_and_legacy_rollback.sql
-- Depends on 270 to 275. Safe to run twice. Drops no table and deletes no data.
--
--  1. Credentials become: a type, a title and an image. New columns title, approved_at, approved_by.
--     The kind CHECK widens (CERTIFICATE, TEACHING, OTHER join CSEC, CAPE, DEGREE, which old rows keep).
--  2. The credentials guard now also makes approved_at / approved_by server-only.
--  3. The decisions log accepts REAPPROVE (an admin restoring a revoked teacher).
--  4. tutor_verification_v2.source: 'v2' (went through this flow) or 'legacy' (verified under the old
--     system and carried over).
--  5. Teachers who are already VERIFIED on their profile get a v2 record: VERIFIED, with their original
--     verified date, source 'legacy', and one audit row. Nobody loses a badge.
-- =====================================================

BEGIN;

-- ---------------------------------------------------
-- 1. Credentials: title, approval stamp, wider kinds
-- ---------------------------------------------------
ALTER TABLE public.tutor_credentials_v2
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT IF EXISTS tutor_credentials_v2_title_check;
ALTER TABLE public.tutor_credentials_v2
  ADD CONSTRAINT tutor_credentials_v2_title_check
  CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 150);

-- Drop the kind CHECK whatever it is called (it was created inline in 270).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tutor_credentials_v2'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
      AND conname <> 'tutor_credentials_v2_shape'
  LOOP
    EXECUTE format('ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tutor_credentials_v2
  ADD CONSTRAINT tutor_credentials_v2_kind_check
  CHECK (kind IN ('CSEC', 'CAPE', 'DEGREE', 'CERTIFICATE', 'TEACHING', 'OTHER'));

ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT IF EXISTS tutor_credentials_v2_shape;
ALTER TABLE public.tutor_credentials_v2
  ADD CONSTRAINT tutor_credentials_v2_shape CHECK (
    -- New credentials: a type, a title and an image (or the image was deleted on purpose).
    (kind IN ('CERTIFICATE', 'DEGREE', 'TEACHING', 'OTHER')
      AND title IS NOT NULL
      AND (proof_path IS NOT NULL OR proof_deleted_at IS NOT NULL))
    OR
    -- Old rows keep their old shape.
    (kind IN ('CSEC', 'CAPE')
      AND subject IS NOT NULL AND grade IS NOT NULL AND exam_year IS NOT NULL
      AND (proof_url IS NOT NULL OR proof_path IS NOT NULL OR proof_deleted_at IS NOT NULL))
    OR
    (kind = 'DEGREE'
      AND school IS NOT NULL AND degree IS NOT NULL AND graduation_year IS NOT NULL
      AND (proof_path IS NOT NULL OR proof_deleted_at IS NOT NULL))
  );

-- Credentials that were already approved get the date of the decision that approved them.
UPDATE public.tutor_credentials_v2 c
SET approved_at = v.decided_at,
    approved_by = v.decided_by
FROM public.tutor_verification_v2 v
WHERE v.tutor_id = c.tutor_id
  AND v.status IN ('VERIFIED', 'REVOKED')
  AND NOT c.pending_approval
  AND c.approved_at IS NULL
  AND v.decided_at IS NOT NULL;

-- ---------------------------------------------------
-- 2. The credentials guard: approval stamp is server-only
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_credentials_v2_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_privileged_request() THEN
    RETURN NEW;
  END IF;
  IF NEW.proof_deleted_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.proof_deleted_at IS DISTINCT FROM OLD.proof_deleted_at) THEN
    RAISE EXCEPTION 'proof_deleted_at is set by the server only' USING ERRCODE = '42501';
  END IF;
  -- Approval is an admin decision. A teacher can never clear pending_approval or set the stamp,
  -- and a credential added by a VERIFIED teacher always starts pending.
  IF TG_OP = 'UPDATE' AND NEW.pending_approval IS DISTINCT FROM OLD.pending_approval THEN
    RAISE EXCEPTION 'pending_approval is set by the server only' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NOT NEW.pending_approval AND public.tutor_v2_is_verified(NEW.tutor_id) THEN
    RAISE EXCEPTION 'a credential added after verification starts pending' USING ERRCODE = '42501';
  END IF;
  IF (TG_OP = 'INSERT' AND (NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL))
     OR (TG_OP = 'UPDATE' AND (NEW.approved_at IS DISTINCT FROM OLD.approved_at
                               OR NEW.approved_by IS DISTINCT FROM OLD.approved_by)) THEN
    RAISE EXCEPTION 'the approval date is set by the server only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tutor_credentials_v2_guard ON public.tutor_credentials_v2;
CREATE TRIGGER trg_tutor_credentials_v2_guard
  BEFORE INSERT OR UPDATE ON public.tutor_credentials_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.tutor_credentials_v2_guard();

-- ---------------------------------------------------
-- 3. Decisions log: REAPPROVE
-- ---------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tutor_verification_v2_decisions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%REQUEST_INFO%'
  LOOP
    EXECUTE format('ALTER TABLE public.tutor_verification_v2_decisions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tutor_verification_v2_decisions
  ADD CONSTRAINT tutor_verification_v2_decisions_action_check
  CHECK (action IN ('APPROVE', 'REAPPROVE', 'REJECT', 'REVOKE', 'REQUIRE_REVERIFICATION', 'REQUEST_INFO',
                    'APPROVE_CREDENTIAL', 'REJECT_CREDENTIAL'));

-- ---------------------------------------------------
-- 4. Where a verified record came from
-- ---------------------------------------------------
ALTER TABLE public.tutor_verification_v2
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'v2';

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_source_check;
ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_source_check CHECK (source IN ('v2', 'legacy'));

-- ---------------------------------------------------
-- 5. Carry teachers verified under the old system over, keeping their badge and date
-- ---------------------------------------------------
-- A teacher with no v2 record gets one. A teacher whose v2 record is only an unsent draft is
-- moved to VERIFIED too (their profile already says VERIFIED, so the badge never changed).
INSERT INTO public.tutor_verification_v2 (tutor_id, status, source, decided_at, created_at)
SELECT p.id, 'VERIFIED', 'legacy', COALESCE(p.tutor_verified_at, now()), COALESCE(p.tutor_verified_at, now())
FROM public.profiles p
WHERE p.tutor_verification_status = 'VERIFIED'
  AND NOT EXISTS (SELECT 1 FROM public.tutor_verification_v2 v WHERE v.tutor_id = p.id)
ON CONFLICT (tutor_id) DO NOTHING;

UPDATE public.tutor_verification_v2 v
SET status = 'VERIFIED',
    source = 'legacy',
    decided_at = COALESCE(p.tutor_verified_at, now())
FROM public.profiles p
WHERE p.id = v.tutor_id
  AND p.tutor_verification_status = 'VERIFIED'
  AND v.status = 'IN_PROGRESS'
  AND v.submitted_at IS NULL;

-- One audit row per carried-over teacher (the log is append-only, so only teachers without one).
INSERT INTO public.tutor_verification_v2_decisions
  (tutor_id, actor_id, actor_role, action, from_status, to_status, profile_from_status, profile_to_status, reason)
SELECT v.tutor_id, NULL, 'system', 'APPROVE', NULL, 'VERIFIED', 'VERIFIED', 'VERIFIED',
       'Carried over from the previous verification system'
FROM public.tutor_verification_v2 v
WHERE v.source = 'legacy'
  AND NOT EXISTS (
    SELECT 1 FROM public.tutor_verification_v2_decisions d
    WHERE d.tutor_id = v.tutor_id AND d.reason = 'Carried over from the previous verification system'
  );

COMMIT;
