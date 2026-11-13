-- =====================================================
-- STAGING: APPLY MIGRATIONS 278 THEN 279  (one transaction)
-- =====================================================
-- Open the STAGING Supabase project (thjsdcbzlvjradczhgso) > SQL Editor. NEVER production.
-- Safe to run twice. Needs 270-277 applied. Run docs/preview-278-backfill.sql first to see which profiles
-- (if any) the one-time name catch-up in 278 would rename.
--   278: copies a teacher's saved legal name to their profile name (only teachers who HAVE a legal name),
--        and makes later name writes by the teacher resolve to the legal name.
--   279: lets the audit log accept REAPPLY and RESET.
-- Deletes nothing. Touches no other table.

BEGIN;

-- ---------------- 278 ----------------

-- 1. One-time catch-up.
UPDATE public.profiles p
SET full_name = v.legal_first_name || ' ' || v.legal_last_name,
    display_name = v.legal_first_name || ' ' || v.legal_last_name
FROM public.tutor_verification_v2 v
WHERE v.tutor_id = p.id
  AND v.legal_first_name IS NOT NULL
  AND v.legal_last_name IS NOT NULL
  AND (p.full_name IS DISTINCT FROM v.legal_first_name || ' ' || v.legal_last_name
       OR p.display_name IS DISTINCT FROM v.legal_first_name || ' ' || v.legal_last_name);

-- 2. The legal name wins. Named so it runs before trg_profiles_name_lock_guard (alphabetical order).
CREATE OR REPLACE FUNCTION public.profiles_legal_name_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  legal text;
BEGIN
  IF public.is_privileged_request() OR public.is_admin_or_reviewer(auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT v.legal_first_name || ' ' || v.legal_last_name INTO legal
  FROM public.tutor_verification_v2 v
  WHERE v.tutor_id = NEW.id
    AND v.legal_first_name IS NOT NULL
    AND v.legal_last_name IS NOT NULL;
  IF legal IS NOT NULL THEN
    NEW.full_name := legal;
    NEW.display_name := legal;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_legal_name_mirror ON public.profiles;
CREATE TRIGGER trg_profiles_legal_name_mirror
  BEFORE UPDATE OF full_name, display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_legal_name_mirror();


-- ---------------- 279 ----------------

ALTER TABLE public.tutor_verification_v2_decisions DROP CONSTRAINT IF EXISTS tutor_verification_v2_decisions_action_check;
ALTER TABLE public.tutor_verification_v2_decisions
  ADD CONSTRAINT tutor_verification_v2_decisions_action_check
  CHECK (action IN ('APPROVE', 'REAPPROVE', 'REJECT', 'REVOKE', 'REQUIRE_REVERIFICATION', 'REQUEST_INFO',
                    'APPROVE_CREDENTIAL', 'REJECT_CREDENTIAL', 'REAPPLY', 'RESET'));


COMMIT;
