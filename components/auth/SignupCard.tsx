'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Check, ChevronDown, Eye, EyeOff, GraduationCap,
  Loader2, Search, UserRound, Users, Lightbulb, X as XIcon,
} from 'lucide-react';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { SIGNUP_COUNTRIES } from '@/lib/auth/signupCountries';
import { STEPS, TUTOR_LEVELS, YEAR_LEVELS, useSignupFlow, type Step, type UserRole } from './useSignupFlow';

/**
 * The account-creation card — the whole of it: state, steps, validation, the
 * Google button, verification, profile.
 *
 * Extracted from app/signup/page.tsx so there is exactly ONE account-creation
 * implementation. The signup PAGE renders it beside the brand panel; Class
 * Match Week renders it in a modal over the questionnaire, so finishing the
 * questions does not throw the visitor onto an unrelated full-page screen.
 * Both get the same steps, the same validation and the same future fixes.
 *
 * `variant` changes chrome only: the page keeps its "Back to site" link and
 * the card owns its rounding and shadow; the modal swaps that for a close
 * button and lets the overlay own the elevation.
 */
export type SignupCardProps = {
  variant?: "page" | "modal";
  /** Modal only: dismiss without completing. */
  onClose?: () => void;
  /** Where to land after signup. Falls back to the ?redirect= param. */
  redirectTo?: string | null;
  /** A role already chosen upstream, which skips the role step. */
  role?: UserRole | null;
  /**
   * A year level already given, from a Finder run answered before signup.
   *
   * Pre-selects the year dropdown rather than hiding it: a prefilled value the
   * person can see and change is a courtesy, a hidden one is a claim about them.
   * Asking "which year are you in?" twice in the same sitting is the single most
   * visible way this reordering can fail, so it is worth the prop.
   *
   * Null for CAPE, deliberately. The Finder stores a canonical level, and both
   * `Lower 6` and `Upper 6` normalise to `CAPE` — so there is no inverse and a
   * guess would record a fact about a person that they never gave. They pick.
   */
  prefillFormLevel?: string | null;
};

export default function SignupCard({
  variant = 'page',
  onClose,
  redirectTo,
  role: roleOverride,
  prefillFormLevel,
}: SignupCardProps) {
  // All state and handlers live in useSignupFlow, shared with the new-UI
  // screens (components/auth/v2/SignupV2). This card is presentation only.
  const {
    redirectParam, step, goto,
    username, setUsername, usernameError, usernameChecking, usernameAvailable,
    email, setEmail, country, setCountry,
    password, setPassword, passwordValid, showPw, setShowPw,
    agree, setAgree, marketingConsent, setMarketingConsent, detailsValid,
    role, setRole, parentAccountsEnabled,
    code, setCode, resendIn, resendLoading, verifyError, verifying,
    affiliation, setAffiliation, studentInstitution, setStudentInstitution, year, setYear,
    tLevels, tSubjects, tQuery, setTQuery, toggleLevel, addTutorSubject, removeTutorSubject, filteredTutorSubjects,
    loading, error,
    handleStep1, handleStep2, sendCode, handleVerify, handleStudentProfile, handleTutorProfile,
  } = useSignupFlow({ redirectTo, role: roleOverride, prefillFormLevel });


  return (
    <div
      className={
        variant === 'modal'
          ? 'flex max-h-[88vh] w-full flex-col overflow-hidden rounded-3xl bg-white text-gray-900'
          : 'mx-auto flex h-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white text-gray-900 shadow-2xl'
      }
    >
      {/* Top bar: leave the site on the page, dismiss the overlay in the modal. */}
      <div className="flex items-center justify-end border-b border-gray-100 px-5 py-3">
        {variant === 'modal' ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign up"
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : (
          <Link href="/" className="text-xs font-medium text-gray-400 transition hover:text-gray-600">
            Back to site
          </Link>
        )}
      </div>

      {/* Progress */}
      <div className="px-6 pt-6 sm:px-8">
        <StepProgress current={step} />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6 sm:px-8">

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
                {/* ===== STEP: DETAILS ===== */}
                {step === 'details' && (
                  <StepWrap key="details">
                    <StepHeader title="Create your account" sub="A few details to get started — you can change them later." />

                    {/* Google sits above the fields: most people arriving here
                        already have an account they can reuse, so the one-tap
                        route should be the first thing they see rather than
                        something found below the form. */}
                    {/* The callback decides where to land; pass the visitor's
                        destination so it can honour it instead of defaulting
                        to a dashboard. */}
                    <div className="mt-6">
                      <GoogleButton
                        redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback${
                          redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : ''
                        }`}
                        label="Continue with Google"
                      />
                    </div>

                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-400">or</span>
                      </div>
                    </div>

                    <form onSubmit={handleStep1} className="space-y-4">
                      <Field label="Username" hint={username && usernameError ? usernameError : undefined}
                        suffix={usernameChecking ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : usernameAvailable && username ? <Check className="h-4 w-4 text-itutor-green" /> : undefined}>
                        <input
                          type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. ramdeen_phys" autoComplete="username"
                          className={cn('w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2',
                            usernameError ? 'border-red-400 focus:ring-red-200' : usernameAvailable && username ? 'border-itutor-green focus:ring-green-100' : 'border-gray-200 focus:border-itutor-green focus:ring-green-100')}
                          disabled={loading} required minLength={3} maxLength={30}
                        />
                      </Field>

                      <Field label="Email">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com" autoComplete="email"
                          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100"
                          disabled={loading} required />
                      </Field>

                      <Field label="Country">
                        <CountryPicker value={country} onChange={setCountry} />
                      </Field>

                      <Field label="Password" hint={password && !passwordValid ? 'At least 8 characters' : undefined}>
                        <div className="relative">
                          <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters" autoComplete="new-password"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100"
                            disabled={loading} required />
                          <button type="button" onClick={() => setShowPw((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </Field>

                      <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm text-gray-500">
                        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-itutor-green focus:ring-itutor-green" />
                        <span>
                          I agree to the{' '}
                          <a href="/terms/student" target="_blank" className="font-medium text-gray-900 underline">Terms</a>{' '}
                          and{' '}
                          <a href="/terms/student" target="_blank" className="font-medium text-gray-900 underline">Privacy Policy</a>.
                        </span>
                      </label>

                      {/* Separate from the Terms box on purpose: agreeing to the
                          Terms is required to hold an account, and consenting to
                          marketing email is not. Ticked by default and freely
                          unticked — what is recorded is the answer the person
                          actually left, along with the fact that it came from
                          this form rather than from the backfill of existing
                          accounts. */}
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-500">
                        <input type="checkbox" checked={marketingConsent}
                          onChange={(e) => setMarketingConsent(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-itutor-green focus:ring-itutor-green" />
                        <span>
                          Send me class recommendations and occasional updates. You can
                          unsubscribe from any email.
                        </span>
                      </label>

                      <button type="submit" disabled={!detailsValid || loading}
                        className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                        {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continue'}
                      </button>

                      <p className="pt-1 text-center text-sm text-gray-500">
                        Already have an account?{' '}
                        {/* Carry `redirect` across, same as the login page does
                            in the other direction — otherwise bouncing between
                            the two loses where the visitor was headed. */}
                        <Link
                          href={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'}
                          className="font-medium text-itutor-green underline"
                        >
                          Log in
                        </Link>
                      </p>
                    </form>
                  </StepWrap>
                )}

                {/* ===== STEP: ROLE ===== */}
                {step === 'role' && (
                  <StepWrap key="role">
                    <BackBtn onClick={() => goto('details')} />
                    <StepHeader title="What brings you here?" sub="Pick what fits — you can adjust this later." />
                    <div className="mt-6 space-y-3">
                      <RoleCard active={role === 'student'} onClick={() => setRole('student')}
                        icon={<GraduationCap className="h-5 w-5" />} title="I'm a student" desc="Find tutors and join lessons" />
                      <RoleCard active={role === 'tutor'} onClick={() => setRole('tutor')}
                        icon={<UserRound className="h-5 w-5" />} title="I'm an iTutor" desc="Teach 1:1s and run lessons" />
                      {parentAccountsEnabled && (
                        <RoleCard active={role === 'parent'} onClick={() => setRole('parent')}
                          icon={<Users className="h-5 w-5" />} title="I'm a parent / guardian" desc="Manage my child's learning" />
                      )}
                    </div>
                    <button onClick={handleStep2} disabled={!role || loading}
                      className="mt-6 w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                      {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continue'}
                    </button>
                  </StepWrap>
                )}

                {/* ===== STEP: VERIFY ===== */}
                {step === 'verify' && (
                  <StepWrap key="verify">
                    <BackBtn onClick={() => goto('role')} />
                    <StepHeader
                      title="Check your email"
                      sub={<>We sent a 6-digit code to <span className="font-medium text-gray-900">{email}</span>.</>}
                    />
                    <div className="mt-6 space-y-4">
                      <OTPInputs value={code} onChange={setCode} onComplete={handleVerify} />
                      {verifyError && <p className="text-center text-sm text-red-500">{verifyError}</p>}
                      <button onClick={handleVerify} disabled={code.join('').length !== 6 || verifying}
                        className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                        {verifying ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Verify & create account'}
                      </button>
                      <div className="text-center text-sm text-gray-500">
                        Didn&apos;t get it?{' '}
                        <button type="button" disabled={resendIn > 0 || resendLoading} onClick={sendCode}
                          className="font-medium text-itutor-green underline disabled:no-underline disabled:opacity-50">
                          {resendLoading ? 'Sending…' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                        </button>
                      </div>
                      <p className="text-center text-xs text-gray-400">
                        Emails can take up to a minute. Check spam if you don&apos;t see it.
                      </p>
                    </div>
                  </StepWrap>
                )}

                {/* ===== STEP: CONFIRMED ===== */}
                {step === 'confirmed' && (
                  <StepWrap key="confirmed">
                    <div className="flex flex-col items-center pt-6 text-center">
                      <motion.div
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                        className="grid h-20 w-20 place-items-center rounded-full text-itutor-green"
                        style={{ backgroundColor: 'rgba(25,147,86,0.12)' }}
                      >
                        <Check className="h-10 w-10" strokeWidth={3} />
                      </motion.div>
                      <h2 className="mt-5 font-display text-2xl font-bold">You&apos;re verified!</h2>
                      <p className="mt-2 max-w-sm text-sm text-gray-500">
                        {role === 'student'
                          ? 'One last step — tell us about your studies.'
                          : role === 'tutor'
                            ? 'One last step — set up your tutor profile.'
                            : 'Taking you to your dashboard…'}
                      </p>
                      {role === 'tutor' && (
                        <p className="mt-3 max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
                          Credential verification is required before you can teach. You&apos;ll be guided through this next.
                        </p>
                      )}
                      <div className="mt-6 flex items-center gap-2 text-xs text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Redirecting…
                      </div>
                    </div>
                  </StepWrap>
                )}

                {/* ===== STEP: PROFILE — STUDENT ===== */}
                {step === 'profile' && role === 'student' && (
                  <StepWrap key="profile-student">
                    <StepHeader title="Tell us about your studies" sub="This helps us match you with the right tutors and lessons." />
                    <form onSubmit={handleStudentProfile} className="mt-6 space-y-5">
                      <Field label="Are you affiliated with a school?">
                        <div className="grid grid-cols-3 gap-2">
                      {([{ v: 'attend', l: 'Yes, attend' }, { v: 'teach', l: 'Yes, teach' }, { v: 'no', l: 'No' }] as const).map((o) => (
                          <button key={o.v} type="button" onClick={() => { setAffiliation(o.v); setStudentInstitution(null); }}
                            className={cn('rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                              affiliation === o.v ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-200 bg-white hover:border-itutor-green/40')}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </Field>

                      {(affiliation === 'attend' || affiliation === 'teach') && (
                        <Field label="School (optional)">
                          <InstitutionAutocomplete
                            selectedInstitution={studentInstitution}
                            onChange={setStudentInstitution}
                            filters={{ institution_level: 'secondary' }}
                            disabled={loading}
                            placeholder="Type to search (e.g. PERS, Presentation, QRC)..."
                            required={false}
                            hideDefaultHint
                          />
                        </Field>
                      )}

                      <Field label="Year level *">
                        <select value={year} onChange={(e) => setYear(e.target.value)} disabled={loading}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100">
                          <option value="">Select your year</option>
                          {YEAR_LEVELS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
                        </select>
                      </Field>

                      <button type="submit" disabled={loading}
                        className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                        {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Complete profile'}
                      </button>
                    </form>
                  </StepWrap>
                )}

                {/* ===== STEP: PROFILE — TUTOR ===== */}
                {step === 'profile' && role === 'tutor' && (
                  <StepWrap key="profile-tutor">
                    <div className="flex flex-col items-center text-center">
                      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-itutor-green text-white shadow-lg">
                        <Lightbulb className="h-6 w-6" />
                      </div>
                      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">Set up your tutor profile</h2>
                      <p className="mt-1.5 max-w-md text-sm text-gray-500">
                        Add the levels you teach and your subjects so students can find you.
                      </p>
                    </div>

                    <div className="mt-6 space-y-5">
                      <div className="rounded-2xl p-4 ring-1 ring-itutor-green/20" style={{ backgroundColor: 'rgba(25,147,86,0.05)' }}>
                        <label className="text-sm font-semibold text-gray-800">Teaching Levels <span className="text-red-500">*</span></label>
                        <p className="mt-0.5 text-xs text-gray-500">Select all levels you can teach.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {TUTOR_LEVELS.map((l) => {
                            const active = tLevels.includes(l.value);
                            return (
                              <button key={l.value} type="button" onClick={() => toggleLevel(l.value)}
                                className={cn('rounded-full border px-4 py-1.5 text-sm font-semibold transition',
                                  active ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-200 bg-white hover:border-itutor-green/40')}>
                                {l.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {tLevels.some((l) => l !== 'sea') && (
                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                          <label className="text-sm font-semibold text-gray-800">Subjects you can teach <span className="text-red-500">*</span></label>
                          <p className="mt-0.5 text-xs text-gray-500">Search and add CSEC / CAPE subjects.</p>
                          <div className="relative mt-3">
                            <input value={tQuery} onChange={(e) => setTQuery(e.target.value)}
                              placeholder="Type subject name (e.g. CSEC Math, CAPE Physics)…"
                              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100" />
                            {tQuery.trim() && (
                              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                                {filteredTutorSubjects.length === 0
                                  ? <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
                                  : filteredTutorSubjects.map((s) => (
                                    <li key={s}>
                                      <button type="button" onClick={() => addTutorSubject(s)}
                                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                                        {s}<span className="text-xs text-gray-400">Add</span>
                                      </button>
                                    </li>
                                  ))}
                              </ul>
                            )}
                          </div>
                          {tSubjects.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {tSubjects.map((s) => (
                                <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                                  {s}
                                  <button type="button" onClick={() => removeTutorSubject(s)} className="text-gray-400 hover:text-gray-700">
                                    <XIcon className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <button onClick={handleTutorProfile} disabled={loading ||
                        tLevels.length === 0 || (tLevels.some((l) => l !== 'sea') && tSubjects.length === 0)}
                        className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                        {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Complete Profile'}
                      </button>
                    </div>
                  </StepWrap>
                )}

        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function StepProgress({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s.id} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= idx ? 'bg-itutor-green' : 'bg-gray-200')} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {STEPS.map((s, i) => (
          <span key={s.id} className={cn(i === idx && 'text-itutor-green')}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

function StepWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
      {children}
    </motion.div>
  );
}

function StepHeader({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-1.5 text-sm text-gray-500">{sub}</p>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mb-3 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700">
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
}

function Field({ label, children, hint, suffix }: { label: string; children: React.ReactNode; hint?: string; suffix?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        {children}
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-red-500">{hint}</p>}
    </div>
  );
}

function RoleCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition',
        active ? 'border-itutor-green bg-green-50' : 'border-gray-200 bg-white hover:border-itutor-green/40')}>
      <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl',
        active ? 'bg-itutor-green text-white' : 'bg-gray-100 text-gray-400')}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-sm text-gray-500">{desc}</div>
      </div>
      <div className={cn('grid h-5 w-5 place-items-center rounded-full border-2 transition',
        active ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-300')}>
        {active && <Check className="h-3 w-3" strokeWidth={3} />}
      </div>
    </button>
  );
}

function OTPInputs({ value, onChange, onComplete }: { value: string[]; onChange: (v: string[]) => void; onComplete?: () => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const setAt = (i: number, ch: string) => {
    const next = [...value];
    next[i] = ch;
    onChange(next);
    if (ch && i < 5) refs.current[i + 1]?.focus();
    if (next.every((c) => c) && next.join('').length === 6) onComplete?.();
  };
  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {value.map((c, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric" maxLength={1} value={c}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(-1); setAt(i, v); }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus(); }}
          onPaste={(e) => {
            const txt = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!txt) return;
            e.preventDefault();
            const next = txt.split('').concat(Array(6).fill('')).slice(0, 6);
            onChange(next);
            refs.current[Math.min(txt.length, 5)]?.focus();
            if (txt.length === 6) onComplete?.();
          }}
          className="h-14 w-11 rounded-xl border-2 border-gray-200 bg-white text-center text-xl font-semibold tabular-nums shadow-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100 sm:h-16 sm:w-12 sm:text-2xl"
        />
      ))}
    </div>
  );
}

function CountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const COUNTRIES = SIGNUP_COUNTRIES;

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = COUNTRIES.find((c) => c.code === value);
  const filtered = useMemo(() => {
    if (!q.trim()) return COUNTRIES;
    const s = q.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(s));
  }, [q]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 px-3 text-sm shadow-sm transition hover:border-gray-300">
        <span className={cn('flex items-center gap-2', !selected && 'text-gray-400')}>
          {selected ? <><span className="text-base">{selected.flag}</span>{selected.name}</> : 'Select your country'}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search countries…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0
              ? <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
              : filtered.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => { onChange(c.code); setOpen(false); setQ(''); }}
                    className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50', value === c.code && 'bg-gray-50')}>
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1">{c.name}</span>
                    {value === c.code && <Check className="h-4 w-4 text-itutor-green" />}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GoogleButton({ redirectTo, label }: { redirectTo: string; label: string }) {
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState('');

  const handleClick = async () => {
    setOauthLoading(true);
    setOauthError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { access_type: 'offline', prompt: 'consent' } },
    });
    if (error) { setOauthError('Failed to connect with Google. Please try again.'); setOauthLoading(false); }
  };

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={oauthLoading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50">
        {oauthLoading
          ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          : <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.07H2.18a11 11 0 0 0 0 9.87l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>}
        {oauthLoading ? 'Connecting…' : label}
      </button>
      {oauthError && <p className="mt-1.5 text-center text-xs text-red-500">{oauthError}</p>}
    </div>
  );
}
