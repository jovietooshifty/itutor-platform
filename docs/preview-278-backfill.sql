-- READ ONLY. Lists exactly which profiles migration 278 would rename. Run in the STAGING project. Changes nothing.
-- Empty result = 278's one-time catch-up changes no profile at all.
SELECT p.id, p.email, p.role,
       p.full_name    AS current_full_name,
       p.display_name AS current_display_name,
       v.legal_first_name || ' ' || v.legal_last_name AS would_become
FROM public.profiles p
JOIN public.tutor_verification_v2 v ON v.tutor_id = p.id
WHERE v.legal_first_name IS NOT NULL
  AND v.legal_last_name IS NOT NULL
  AND (p.full_name IS DISTINCT FROM v.legal_first_name || ' ' || v.legal_last_name
       OR p.display_name IS DISTINCT FROM v.legal_first_name || ' ' || v.legal_last_name);

-- Independent check that 278 is in place (the function, not only the trigger):
SELECT to_regprocedure('public.profiles_legal_name_mirror()') IS NOT NULL AS function_exists,
       EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
               WHERE t.tgname = 'trg_profiles_legal_name_mirror' AND c.relname = 'profiles' AND NOT t.tgisinternal) AS trigger_exists;
