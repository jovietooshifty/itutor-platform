-- =====================================================
-- ROLLBACK for 278_verification_legal_name_display.sql
-- =====================================================
-- Run by hand, staging only. Removes the trigger. Profile names already copied from the legal name are left as they are.

BEGIN;

DROP TRIGGER IF EXISTS trg_profiles_legal_name_mirror ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_legal_name_mirror();

COMMIT;
