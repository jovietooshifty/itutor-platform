-- =====================================================
-- RESET ONE TEACHER'S VERIFICATION TO "NOT STARTED"  (staging only)
-- =====================================================
-- Run in the STAGING Supabase SQL Editor (project thjsdcbzlvjradczhgso). NEVER on production
-- (nfkrfciozjxrodkusrhh). Needs migration 279 (the RESET audit entry).
-- Touches exactly ONE teacher: the email on the first line. Sends nothing to anyone.
--
--   1. Change the email below (twice: in PART 1 and PART 2).
--   2. Run PART 1 alone. It only reads. Check the counts.
--   3. Run PART 2. It resets, writes one audit row, and prints what it changed.
--
-- What it clears: consent, the ID check (status, attempts, session references, outcomes), the legal
-- name and its lock, the submission and any decision or reason, the credentials rows, and sets the
-- profile back to UNVERIFIED (badge off). It keeps the account, profile, listings and notifications.
-- Certificate files already uploaded stay in the private bucket (delete them there if you want).

-- ---------- PART 1: READ ONLY ----------
SELECT p.id, p.email, p.role, p.tutor_verification_status AS profile_status,
       v.status AS v2_status, v.identity_status, v.identity_attempts,
       (SELECT count(*) FROM public.tutor_credentials_v2 c WHERE c.tutor_id = p.id) AS credentials,
       (SELECT count(*) FROM public.identity_outcomes o WHERE o.tutor_id = p.id) AS identity_outcomes,
       (SELECT count(*) FROM public.tutor_verification_v2_decisions d WHERE d.tutor_id = p.id) AS audit_rows
FROM public.profiles p
LEFT JOIN public.tutor_verification_v2 v ON v.tutor_id = p.id
WHERE lower(p.email) = lower('arjunrambally@myitutor.com');   -- <- the teacher

-- ---------- PART 2: THE RESET (one transaction) ----------
BEGIN;

DO $$
DECLARE
  who constant text := 'arjunrambally@myitutor.com';   -- <- the same teacher
  tid uuid;
  prev_profile text;
  prev_v2 text;
  n_creds int;
  n_outcomes int;
BEGIN
  SELECT id, tutor_verification_status INTO tid, prev_profile
  FROM public.profiles WHERE lower(email) = lower(who) AND role = 'tutor';
  IF tid IS NULL THEN
    RAISE EXCEPTION 'No tutor profile with that email. Nothing changed.';
  END IF;

  SELECT status INTO prev_v2 FROM public.tutor_verification_v2 WHERE tutor_id = tid;

  DELETE FROM public.tutor_credentials_v2 WHERE tutor_id = tid;
  GET DIAGNOSTICS n_creds = ROW_COUNT;
  DELETE FROM public.identity_outcomes WHERE tutor_id = tid;
  GET DIAGNOSTICS n_outcomes = ROW_COUNT;

  -- Back to a fresh, empty application (a new row is created by the page when there is none).
  UPDATE public.tutor_verification_v2 SET
    status = 'IN_PROGRESS',
    consent_at = NULL, consent_version = NULL,
    identity_status = NULL, identity_error_code = NULL, identity_provider_code = NULL,
    identity_attempts = 0, identity_verified_at = NULL, identity_started_at = NULL,
    identity_provider = NULL, identity_provider_session_ref = NULL,
    identity_session_refs = '[]'::jsonb, identity_providers_tried = '{}',
    identity_country = NULL, identity_name_match = NULL, identity_redacted_at = NULL,
    legal_first_name = NULL, legal_last_name = NULL, name_source = NULL,
    name_confirmed_at = NULL, name_locked_at = NULL,
    submitted_at = NULL, decision_reason = NULL, decided_by = NULL, decided_at = NULL,
    files_deleted_at = NULL
  WHERE tutor_id = tid;

  UPDATE public.profiles
  SET tutor_verification_status = 'UNVERIFIED', tutor_verified_at = NULL
  WHERE id = tid;

  INSERT INTO public.tutor_verification_v2_decisions
    (tutor_id, actor_id, actor_role, action, from_status, to_status, profile_from_status, profile_to_status, reason)
  VALUES
    (tid, NULL, 'system', 'RESET', prev_v2, 'IN_PROGRESS', prev_profile, 'UNVERIFIED', 'Reset by hand for testing (staging)');

  RAISE NOTICE 'Reset % : profile % -> UNVERIFIED, v2 % -> IN_PROGRESS, % credentials and % identity outcomes removed, 1 audit row added.',
    who, prev_profile, prev_v2, n_creds, n_outcomes;
END $$;

COMMIT;
