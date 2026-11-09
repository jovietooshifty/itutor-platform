-- =====================================================
-- 277: THE TEACHER'S NAME IS THE NAME ON THEIR ID
-- =====================================================
-- WRITTEN, NOT APPLIED. Staging only from here. Rollback: supabase/rollbacks/277_verification_legal_name_rollback.sql
-- Depends on 270 to 276. Safe to run twice. Drops no table and deletes no data.
--
--  1. tutor_verification_v2 gains the teacher's legal first and last name, where it came from
--     (the teacher typed it, or it was read from the ID), when the teacher confirmed it, and when
--     it was locked (admin approval).
--  2. A guard on profiles: once a teacher has started the ID check, or is locked, they cannot
--     change full_name or display_name themselves. The server (service role) and admins still can.
-- =====================================================

BEGIN;

ALTER TABLE public.tutor_verification_v2
  ADD COLUMN IF NOT EXISTS legal_first_name text,
  ADD COLUMN IF NOT EXISTS legal_last_name text,
  ADD COLUMN IF NOT EXISTS name_source text,
  ADD COLUMN IF NOT EXISTS name_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS name_locked_at timestamptz;

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_legal_name_check;
ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_legal_name_check CHECK (
    (legal_first_name IS NULL OR char_length(legal_first_name) BETWEEN 1 AND 60)
    AND (legal_last_name IS NULL OR char_length(legal_last_name) BETWEEN 1 AND 60)
  );

ALTER TABLE public.tutor_verification_v2 DROP CONSTRAINT IF EXISTS tutor_verification_v2_name_source_check;
ALTER TABLE public.tutor_verification_v2
  ADD CONSTRAINT tutor_verification_v2_name_source_check CHECK (name_source IS NULL OR name_source IN ('teacher', 'id'));

-- ---------------------------------------------------
-- 2. A teacher cannot rename themselves once the ID check has started or the name is locked
-- ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_name_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.full_name IS NOT DISTINCT FROM OLD.full_name
     AND NEW.display_name IS NOT DISTINCT FROM OLD.display_name THEN
    RETURN NEW;
  END IF;
  IF public.is_privileged_request() OR public.is_admin_or_reviewer(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tutor_verification_v2 v
    WHERE v.tutor_id = NEW.id
      AND (v.name_locked_at IS NOT NULL
           OR v.identity_status IN ('pending', 'processing', 'verified'))
  ) THEN
    RAISE EXCEPTION 'your name is set by your ID check and cannot be changed here' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_name_lock_guard ON public.profiles;
CREATE TRIGGER trg_profiles_name_lock_guard
  BEFORE UPDATE OF full_name, display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_name_lock_guard();

COMMIT;
