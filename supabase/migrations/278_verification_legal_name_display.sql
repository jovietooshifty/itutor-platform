-- =====================================================
-- 278: A TEACHER'S NAME EVERYWHERE IS THEIR LEGAL NAME
-- =====================================================
-- WRITTEN, NOT APPLIED. Staging only from here. Rollback: supabase/rollbacks/278_verification_legal_name_display_rollback.sql
-- Depends on 277. Safe to run twice. Drops no table and deletes no data.
--
-- The site shows profiles.display_name, or full_name when there is none. The server already writes the legal
-- name (first + last) to both when a teacher saves it or their ID check passes. This makes the database
-- agree, whatever route writes the profile:
--  1. Existing teachers who have a legal name get it copied to full_name and display_name now.
--  2. A teacher (not the server, not an admin) who writes full_name or display_name on their own profile
--     gets their legal name written instead, so a nickname can never replace it.
-- =====================================================

BEGIN;

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

COMMIT;
