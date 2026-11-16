'use client';

/**
 * The account-creation flow: state, validation and every network call, with
 * no markup.
 *
 * Lifted out of SignupCard so the two presentations of signup run ONE flow:
 * - SignupCard, the old card (the /signup page with the new UI off, and the
 *   Class Match Week modal, which always uses it);
 * - SignupV2, the design-system screens (Figma "Sign up and Log in", 64:*).
 * A rule change here reaches both. Do not copy a handler into either view.
 *
 * The steps are hash-addressed (#details, #role, #verify, #confirmed,
 * #profile) so the browser Back button walks them.
 */

import { FormEvent, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';
import { safeRedirectOr } from '@/lib/utils/safeRedirect';

export type UserRole = 'student' | 'tutor' | 'parent';
export type Step = 'details' | 'role' | 'verify' | 'confirmed' | 'profile';
export type SchoolAffiliation = 'attend' | 'teach' | 'no';

export const STEPS: { id: Step; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'role', label: 'Role' },
  { id: 'verify', label: 'Verify' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'profile', label: 'Profile' },
];

export const YEAR_LEVELS = [
  { value: 'SEA', label: 'SEA (10–11)' },
  { value: 'Form 1', label: 'Form 1 (11–12)' },
  { value: 'Form 2', label: 'Form 2 (12–13)' },
  { value: 'Form 3', label: 'Form 3 (13–14)' },
  { value: 'Form 4', label: 'Form 4 (14–15)' },
  { value: 'Form 5', label: 'Form 5 (15–16)' },
  { value: 'Lower 6', label: 'Lower 6 (16–17)' },
  { value: 'Upper 6', label: 'Upper 6 (17–18)' },
];

export const TUTOR_LEVELS = [
  { value: 'sea', label: 'SEA' },
  { value: 'form-1', label: 'Form 1' },
  { value: 'form-2', label: 'Form 2' },
  { value: 'form-3', label: 'Form 3' },
  { value: 'form-4', label: 'Form 4' },
  { value: 'form-5', label: 'Form 5' },
  { value: 'cape-1', label: 'CAPE Unit 1' },
  { value: 'cape-2', label: 'CAPE Unit 2' },
];

export const TUTOR_SUBJECT_LIST = [
  'CSEC Mathematics', 'CSEC Additional Mathematics', 'CSEC English A', 'CSEC English B',
  'CSEC Physics', 'CSEC Chemistry', 'CSEC Biology', 'CSEC Human & Social Biology',
  'CSEC Information Technology', 'CSEC Principles of Accounts', 'CSEC Principles of Business',
  'CSEC Economics', 'CSEC Geography', 'CSEC History', 'CSEC Spanish', 'CSEC French',
  'CSEC Social Studies', 'CSEC Religious Education', 'CSEC Entrepreneurship', 'CSEC Tourism',
  'CAPE Pure Mathematics', 'CAPE Applied Mathematics', 'CAPE Physics', 'CAPE Chemistry',
  'CAPE Biology', 'CAPE Computer Science', 'CAPE Economics', 'CAPE Accounting',
  'CAPE Management of Business', 'CAPE Sociology', 'CAPE Literatures in English',
  'CAPE Communication Studies', 'CAPE Caribbean Studies', 'CAPE Law', 'CAPE History',
  'CAPE Geography', 'CAPE Information Technology',
  'SEA Mathematics', 'SEA English', 'SEA Creative Writing', 'SEA Science',
];

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
  if (err instanceof Error && (err.message.includes('network') || err.message.includes('fetch'))) return true;
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}

export type SignupFlowOptions = {
  /** Where to land after signup. Falls back to the ?redirect= param. */
  redirectTo?: string | null;
  /** A role already chosen upstream, which skips the role step. */
  role?: UserRole | null;
  /** A year level already given (Finder run). See SignupCard for why CAPE is null. */
  prefillFormLevel?: string | null;
};

export function useSignupFlow({ redirectTo, role: roleOverride, prefillFormLevel }: SignupFlowOptions = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A prop wins over the URL: the modal is rendered on another route entirely,
  // so it has no ?redirect= of its own to read.
  const redirectParam = redirectTo ?? searchParams.get('redirect');
  // A role chosen BEFORE account creation (Class Match Week, the /start picker,
  // the V2 role picker). Asking again would be a worse experience, not a safer
  // one; the account-creation flow itself is the same one everyone uses.
  const roleParam = roleOverride ?? searchParams.get('role');
  const presetRole: UserRole | null =
    roleParam === 'student' || roleParam === 'tutor' || roleParam === 'parent' ? roleParam : null;

  const [step, setStep] = useState<Step>('details');
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1
  // Optional. The old card never asks for it, and /api/auth/register falls back
  // to the username when it is missing or shorter than 2 characters.
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  // Ticked by default: the copy beside it says so, and the server treats an
  // absent field as consent, so the two agree.
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);

  // Step 2
  const [role, setRole] = useState<UserRole | null>(presetRole);
  // Default false so the parent card never flashes in before the flag lands —
  // showing then withdrawing an option reads as a bug.
  const [parentAccountsEnabled, setParentAccountsEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/feature-flags', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setParentAccountsEnabled(Boolean(d?.parentAccountsEnabled)))
      .catch(() => setParentAccountsEnabled(false));
  }, []);

  // Step 5 — student. Seeded from the Finder run when there is one, and
  // validated against the list — a value that is not an option would render as
  // a blank select that silently fails the "year required" check on submit.
  const [affiliation, setAffiliation] = useState<SchoolAffiliation | null>(null);
  const [studentInstitution, setStudentInstitution] = useState<Institution | null>(null);
  const [year, setYear] = useState(
    prefillFormLevel && YEAR_LEVELS.some((l) => l.value === prefillFormLevel) ? prefillFormLevel : ''
  );

  /**
   * Pick up a year level the visitor already gave the Finder, before they had
   * an account. Fetched because the `finder_token` cookie is httpOnly. Only
   * ever fills an EMPTY field, and only from a real stored run.
   */
  useEffect(() => {
    if (prefillFormLevel) return; // an explicit prop wins
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/finder/prefill', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { form_level_label?: string | null };
        const label = data?.form_level_label ?? null;
        if (cancelled || !label) return;
        if (!YEAR_LEVELS.some((l) => l.value === label)) return;
        setYear((current) => current || label);
      } catch {
        // No run, no cookie, or the route is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillFormLevel]);

  // Step 3
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [resendIn, setResendIn] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Step 5 — tutor
  const [tLevels, setTLevels] = useState<string[]>([]);
  const [tSubjects, setTSubjects] = useState<string[]>([]);
  const [tQuery, setTQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hash-based step navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = window.location.hash.replace('#', '') as Step;
    if (STEPS.some((s) => s.id === h)) setStep(h);
    const onPop = () => {
      const hash = window.location.hash.replace('#', '') as Step;
      if (STEPS.some((s) => s.id === hash)) setStep(hash);
      else setStep('details');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goto = useCallback((s: Step) => {
    setStep(s);
    setError('');
    if (typeof window !== 'undefined') window.history.pushState(null, '', `#${s}`);
  }, []);

  // Resend cooldown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Real-time username check
  useEffect(() => {
    setUsernameError('');
    setUsernameAvailable(false);
    const trimmed = username.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) { setUsernameError('Min 3 characters'); return; }
    if (trimmed.length > 30) { setUsernameError('Max 30 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError('Letters, numbers and _ only'); return; }
    setUsernameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmed }),
        });
        const data = await res.json();
        if (data.usernameAvailable === false) setUsernameError('Username already taken');
        else setUsernameAvailable(true);
      } catch { /* ignore */ } finally { setUsernameChecking(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username) && !usernameError && usernameAvailable;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;
  const detailsValid = usernameValid && emailValid && !!country && passwordValid && agree;

  // ---- Step 2 ----
  /** True when the code went out. */
  const sendCode = async (): Promise<boolean> => {
    setResendLoading(true);
    setResendIn(0);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to send code.'); return false; }
      setResendIn(60);
      setCode(['', '', '', '', '', '']);
      return true;
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'Failed to send code.');
      return false;
    } finally { setResendLoading(false); }
  };

  const handleStep2 = async () => {
    if (!role) { setError('Select a role to continue.'); return; }
    setError('');
    setLoading(true);
    const sent = await sendCode();
    setLoading(false);
    // Only move on when the code actually went out. This used to read the
    // `error` state, which is stale inside this closure, so a failed send
    // still advanced to the verify step — and goto() then cleared the message.
    if (sent) goto('verify');
  };

  // ---- Step 1 ----
  const handleStep1 = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!detailsValid) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username: username.trim() }),
      });
      const data = await res.json();
      if (!data.emailAvailable) { setError('Email already registered. Log in instead?'); return; }
      if (!data.usernameAvailable) { setError('Username already taken.'); return; }
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'An error occurred.');
      return;
    } finally { setLoading(false); }
    // With the role already chosen upstream, showing a role picker with one
    // option pre-selected is a step that asks nothing. Skip straight to
    // verification; handleStep2 is the same work, minus the prompt.
    if (presetRole) { await handleStep2(); return; }
    goto('role');
  };

  // ---- Step 3: Verify + Register ----
  const handleVerify = async () => {
    const joined = code.join('');
    if (joined.length !== 6) { setVerifyError('Enter all 6 digits.'); return; }
    setVerifyError('');
    setVerifying(true);

    try {
      const verifyRes = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: joined }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) {
        setVerifyError(verifyData.expired
          ? 'Code expired. Click Resend to get a new one.'
          : `Invalid code. ${verifyData.attemptsRemaining ?? 0} attempts remaining.`);
        setVerifying(false);
        return;
      }
    } catch (err) {
      setVerifyError(isNetworkError(err) ? 'Connect to the Internet' : 'Verification failed.');
      setVerifying(false);
      return;
    }

    try {
      const name = fullName.trim();
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim().toLowerCase(),
          country,
          password,
          role,
          verificationCode: joined,
          marketingConsent,
          ...(name.length >= 2 ? { name } : {}),
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) { setVerifyError(regData.error || 'Registration failed.'); setVerifying(false); return; }
      setUserId(regData.user?.id || null);
      await supabase.auth.signInWithPassword({ email, password });
    } catch (err) {
      setVerifyError(isNetworkError(err) ? 'Connect to the Internet' : 'Registration failed.');
      setVerifying(false);
      return;
    }

    setVerifying(false);
    goto('confirmed');
    // Auto-advance from confirmed
    setTimeout(() => {
      if (role === 'student' || role === 'tutor') goto('profile');
      else {
        // Parent: no extra profile step (children are added later), so they go
        // straight to the Finder. A `?redirect=` still wins. No flag check here:
        // /find's layout bounces to the dashboard when the Finder is off.
        router.push(safeRedirectOr(redirectParam, '/find?trigger=signup'));
      }
    }, 1400);
  };

  // ---- Step 5: Student profile ----
  /**
   * `affiliation` is the old card's three-way question. The V2 screen does not
   * ask it (Figma G1b has a plain optional School field), so it passes
   * `schoolGiven: true`, which saves the school whenever one was picked.
   */
  const handleStudentProfile = async (e?: FormEvent, opts?: { schoolGiven?: boolean }) => {
    e?.preventDefault();
    const effective = opts?.schoolGiven ? 'attend' : affiliation;
    if (!effective) { setError('Select your school affiliation.'); return; }
    if (!year) { setError('Select your year level.'); return; }
    setError('');
    setLoading(true);
    try {
      const showSchool = effective === 'attend' || effective === 'teach';
      const { error: updateError } = await supabase.from('profiles')
        .update({
          school: showSchool && studentInstitution ? studentInstitution.name : null,
          institution_id: showSchool && studentInstitution ? studentInstitution.id : null,
          form_level: year,
        })
        .eq('id', userId);
      if (updateError) { setError(`Error saving profile: ${updateError.message}`); return; }

      if (showSchool && studentInstitution) await ensureSchoolCommunityAndMembership(userId!);
      router.push(safeRedirectOr(redirectParam, '/find?trigger=signup'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally { setLoading(false); }
  };

  // ---- Step 5: Tutor profile ----
  const handleTutorProfile = async () => {
    if (tLevels.length === 0) { setError('Select at least one teaching level.'); return; }
    const needsSubjects = tLevels.some((l) => l !== 'sea');
    if (needsSubjects && tSubjects.length === 0) { setError('Select at least one subject.'); return; }
    setError('');
    setLoading(true);
    try {
      await supabase.from('profiles').update({ teaching_levels: tLevels }).eq('id', userId);
      if (tSubjects.length > 0) await setUserSubjects(userId!, tSubjects);
      router.push(safeRedirectOr(redirectParam, '/tutor/dashboard'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally { setLoading(false); }
  };

  const toggleLevel = (v: string) =>
    setTLevels((cur) => cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  const addTutorSubject = (s: string) => { if (!tSubjects.includes(s)) setTSubjects((cur) => [...cur, s]); setTQuery(''); };
  const removeTutorSubject = (s: string) => setTSubjects((cur) => cur.filter((x) => x !== s));

  const filteredTutorSubjects = useMemo(() =>
    TUTOR_SUBJECT_LIST.filter((s) => s.toLowerCase().includes(tQuery.toLowerCase()) && !tSubjects.includes(s)).slice(0, 8),
    [tQuery, tSubjects]);

  return {
    redirectParam, presetRole,
    step, goto, userId,
    fullName, setFullName,
    username, setUsername, usernameError, usernameChecking, usernameAvailable, usernameValid,
    email, setEmail, emailValid,
    country, setCountry,
    password, setPassword, passwordValid, showPw, setShowPw,
    agree, setAgree, marketingConsent, setMarketingConsent,
    detailsValid,
    role, setRole, parentAccountsEnabled,
    code, setCode, resendIn, resendLoading, verifyError, verifying,
    affiliation, setAffiliation, studentInstitution, setStudentInstitution, year, setYear,
    tLevels, tSubjects, tQuery, setTQuery, toggleLevel, addTutorSubject, removeTutorSubject, filteredTutorSubjects,
    loading, error, setError,
    handleStep1, handleStep2, sendCode, handleVerify, handleStudentProfile, handleTutorProfile,
  };
}

export type SignupFlow = ReturnType<typeof useSignupFlow>;
