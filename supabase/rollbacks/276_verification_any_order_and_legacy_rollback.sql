-- =====================================================
-- ROLLBACK for 276_verification_any_order_and_legacy.sql
-- =====================================================
-- Run by hand, staging only. DESTRUCTIVE for the new data: credentials of the new kinds
-- (CERTIFICATE, TEACHING, OTHER and titled DEGREE) are DELETED because the old shape cannot hold them,
-- and the carried-over (legacy) v2 records are deleted. The profiles keep their VERIFIED status.
-- The decisions log is append-only, so its action CHECK stays widened (harmless).

BEGIN;

DELETE FROM public.tutor_credentials_v2 WHERE kind IN ('CERTIFICATE', 'TEACHING', 'OTHER') OR title IS NOT NULL;
DELETE FROM public.tutor_verification_v2 WHERE source = 'legacy';

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_source_check;
ALTER TABLE public.tutor_verification_v2 DROP COLUMN IF EXISTS source;

ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT IF EXISTS tutor_credentials_v2_shape;
ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT IF EXISTS tutor_credentials_v2_kind_check;
ALTER TABLE public.tutor_credentials_v2 DROP CONSTRAINT IF EXISTS tutor_credentials_v2_title_check;
ALTER TABLE public.tutor_credentials_v2 DROP COLUMN IF EXISTS title;
ALTER TABLE public.tutor_credentials_v2 DROP COLUMN IF EXISTS approved_at;
ALTER TABLE public.tutor_credentials_v2 DROP COLUMN IF EXISTS approved_by;

ALTER TABLE public.tutor_credentials_v2
  ADD CONSTRAINT tutor_credentials_v2_kind_check CHECK (kind IN ('CSEC', 'CAPE', 'DEGREE'));
ALTER TABLE public.tutor_credentials_v2
  ADD CONSTRAINT tutor_credentials_v2_shape CHECK (
    (kind IN ('CSEC', 'CAPE')
      AND subject IS NOT NULL AND grade IS NOT NULL AND exam_year IS NOT NULL
      AND (proof_url IS NOT NULL OR proof_path IS NOT NULL OR proof_deleted_at IS NOT NULL))
    OR
    (kind = 'DEGREE'
      AND school IS NOT NULL AND degree IS NOT NULL AND graduation_year IS NOT NULL
      AND (proof_path IS NOT NULL OR proof_deleted_at IS NOT NULL))
  );

-- Put the guard back as 273 left it (no approval-stamp rule).
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
  IF TG_OP = 'UPDATE' AND NEW.pending_approval IS DISTINCT FROM OLD.pending_approval THEN
    RAISE EXCEPTION 'pending_approval is set by the server only' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NOT NEW.pending_approval AND public.tutor_v2_is_verified(NEW.tutor_id) THEN
    RAISE EXCEPTION 'a credential added after verification starts pending' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
