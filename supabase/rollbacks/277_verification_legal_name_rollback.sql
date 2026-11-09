-- =====================================================
-- ROLLBACK for 277_verification_legal_name.sql
-- =====================================================
-- Run by hand, staging only. Deletes the stored legal names (the profile names are left as they are).

BEGIN;

DROP TRIGGER IF EXISTS trg_profiles_name_lock_guard ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_name_lock_guard();

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_name_source_check;
ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_legal_name_check;
ALTER TABLE public.tutor_verification_v2
  DROP COLUMN IF EXISTS legal_first_name,
  DROP COLUMN IF EXISTS legal_last_name,
  DROP COLUMN IF EXISTS name_source,
  DROP COLUMN IF EXISTS name_confirmed_at,
  DROP COLUMN IF EXISTS name_locked_at;

COMMIT;
