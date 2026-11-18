'use client';

/**
 * Sign up, new UI — Figma "Sign up and Log in" (64:*) plus G1b (31:6480).
 *
 * /signup with no role shows the role picker (RO01). With ?role= it runs the
 * account flow for that type, coloured by role:
 *   details  — PO06 (parent) / TO04 (teacher); the student form follows the
 *              same frame in student green (the set has no separate one)
 *   verify   — the 6-digit code our backend sends (the frames show a magic
 *              link, G5; /api/auth/register needs the code)
 *   profile  — student: G1b level + school; teacher: levels + subjects
 *
 * Every rule and network call is useSignupFlow, shared with the old card.
 * This file is presentation only.
 *
 * Differences from the frames, each deliberate:
 * - Teachers are asked for a username (their public profile address).
 *   Students and parents are not: /api/auth/register still needs one, so it is
 *   derived from the full name, with digits added if taken. Country starts on
 *   Trinidad and Tobago, visible and changeable.
 * - Students and parents answer the Finder BEFORE this screen, and the profile
 *   step is prefilled from it (year, subjects); see AccountFlow.
 * - No WhatsApp field: there is nowhere to store it at sign-up.
 * - The Terms tick box becomes the frames' "By continuing you agree" line.
 * - The marketing tick box stays: it records consent, and it must be a choice.
 * - G1b's subject chips are built (seeded from the Finder). The "first quest"
 *   note is not: quests have no backend.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SIGNUP_COUNTRIES } from '@/lib/auth/signupCountries';
import { cn } from '@/lib/utils';
import {
  TUTOR_LEVELS,
  YEAR_LEVELS,
  canonicalForYear,
  useSignupFlow,
  type SignupFlow,
} from '../useSignupFlow';
import {
  AuthAlert,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthInput,
  AuthLead,
  AuthMain,
  AuthSelect,
  AuthTitle,
  AuthTopBar,
  GoogleButton,
  LegalLine,
  OrDivider,
  PasswordInput,
  ROLE_TAG,
  Spinner,
  ULink,
  type AuthRole,
} from './AuthKit';
import RolePickerV2 from './RolePickerV2';
import SchoolPickerV2 from './SchoolPickerV2';
import { useParentAccountsFlag } from './useParentAccountsFlag';

const ROLE_WORD: Record<AuthRole, string> = { student: 'student', parent: 'parent', tutor: 'teacher' };

export default function SignupV2() {
  const params = useSearchParams();
  const parentAccounts = useParentAccountsFlag();
  const raw = params.get('role');
  const role: AuthRole | null = raw === 'student' || raw === 'parent' || raw === 'tutor' ? raw : null;

  // A parent link while parent accounts are off falls back to the picker
  // without the parent card, rather than creating a parent account the
  // product has switched off.
  if (!role || (role === 'parent' && !parentAccounts)) {
    return <RolePickerV2 parentAccounts={parentAccounts} redirect={params.get('redirect')} />;
  }
  return <AccountFlow key={role} role={role} />;
}

function AccountFlow({ role }: { role: AuthRole }) {
  const router = useRouter();
  // Students and parents never see a username field: theirs is not a public
  // address, so it is derived from the full name (see useSignupFlow).
  const f = useSignupFlow({ role, autoUsername: role !== 'tutor' });

  /**
   * FINDER FIRST, for every student and parent (owner, 18 Nov 2026).
   *
   * The account is created on the far side of the questionnaire, so signup can
   * reuse its answers instead of asking them again. Someone who reaches
   * /signup?role=student without a run on this browser is sent to the Finder;
   * its results then link back here. A ?redirect= (an invite, Class Match Week,
   * a class link) means another flow sent them, and wins. A Finder that is
   * switched off (enabled: false) never redirects.
   */
  const learner = role === 'student' || role === 'parent';
  const sendToFinder =
    learner && f.step === 'details' && !f.redirectParam && f.finder?.enabled === true && !f.finder.hasRun;
  useEffect(() => {
    if (sendToFinder) router.replace(`/find?role=${role}`);
  }, [sendToFinder, role, router]);

  // The frames agree to the Terms by continuing (see LegalLine), and the
  // business is in Trinidad and Tobago, so start there.
  const { setAgree, setCountry } = f;
  useEffect(() => {
    setAgree(true);
    setCountry((c) => c || 'TT');
  }, [setAgree, setCountry]);

  if (learner && f.step === 'details' && (f.finder === null || sendToFinder)) {
    return (
      <AuthFrame>
        <AuthMain className="items-center justify-center">
          <span className="text-ink-muted">
            <Spinner />
          </span>
        </AuthMain>
      </AuthFrame>
    );
  }

  if (f.step === 'verify') return <VerifyStep f={f} role={role} />;
  if (f.step === 'confirmed') return <ConfirmedStep role={role} />;
  if (f.step === 'profile' && role === 'student') return <StudentProfileStep f={f} />;
  if (f.step === 'profile' && role === 'tutor') return <TutorProfileStep f={f} />;
  return <DetailsStep f={f} role={role} />;
}

/* ─── details: PO06 / TO04 ─── */

function suggestUsername(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
}

function DetailsStep({ f, role }: { f: SignupFlow; role: AuthRole }) {
  const [usernameTouched, setUsernameTouched] = useState(false);
  const loginHref = f.redirectParam ? `/login?redirect=${encodeURIComponent(f.redirectParam)}` : '/login';
  const tone = role;

  const onName = (v: string) => {
    f.setFullName(v);
    // Students and parents: the hook derives the username itself.
    if (role === 'tutor' && !usernameTouched) f.setUsername(suggestUsername(v));
  };

  const usernameState = !f.username
    ? null
    : f.usernameError
      ? { error: f.usernameError }
      : f.usernameChecking
        ? { hint: 'Checking…' }
        : f.usernameAvailable
          ? { ok: 'Available' }
          : null;

  return (
    <AuthFrame>
      <AuthTopBar
        backHref={f.redirectParam ? `/signup?redirect=${encodeURIComponent(f.redirectParam)}` : '/signup'}
        right={
          <span className={cn('rounded-[4px] px-2 py-[3px] text-[12px] font-extrabold tracking-[0.72px]', ROLE_TAG[role])}>
            {ROLE_WORD[role].toUpperCase()} ACCOUNT
          </span>
        }
      />
      <AuthMain>
        <AuthTitle>Create your {ROLE_WORD[role]} account</AuthTitle>

        {f.error && (
          <AuthAlert>
            {f.error.startsWith('Email already registered') ? (
              <>
                That email already has an account.{' '}
                <a href={loginHref} className="font-extrabold underline">
                  Log in instead
                </a>
              </>
            ) : (
              f.error
            )}
          </AuthAlert>
        )}

        <GoogleButton redirect={f.redirectParam} />
        <OrDivider />

        <form onSubmit={f.handleStep1} className="flex flex-col gap-[14px]" noValidate>
          <AuthField
            label="Full name"
            htmlFor="su-name"
            hint={role === 'tutor' ? undefined : 'Shown to your teachers.'}
          >
            <AuthInput
              id="su-name"
              autoComplete="name"
              placeholder={role === 'parent' ? 'Your name' : 'First and last name'}
              value={f.fullName}
              onChange={(e) => onName(e.target.value)}
              disabled={f.loading}
            />
          </AuthField>

          {role === 'tutor' ? (
          <AuthField
            label="Username"
            htmlFor="su-username"
            hint={usernameState?.hint ?? 'Letters, numbers and _. Shown on your profile.'}
            error={usernameState?.error}
            ok={usernameState?.ok}
          >
            <AuthInput
              id="su-username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={f.username}
              onChange={(e) => {
                setUsernameTouched(true);
                f.setUsername(e.target.value);
              }}
              invalid={!!usernameState?.error}
              disabled={f.loading}
              maxLength={30}
            />
          </AuthField>
          ) : null}

          <AuthField label="Email" htmlFor="su-email">
            <AuthInput
              id="su-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={f.email}
              onChange={(e) => f.setEmail(e.target.value)}
              disabled={f.loading}
            />
          </AuthField>

          <AuthField label="Country" htmlFor="su-country">
            <AuthSelect id="su-country" value={f.country} onChange={(e) => f.setCountry(e.target.value)} disabled={f.loading}>
              {SIGNUP_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </AuthSelect>
          </AuthField>

          <AuthField
            label="Password"
            htmlFor="su-password"
            hint="At least 8 characters"
            ok={f.passwordValid ? '8 characters or more' : undefined}
          >
            <PasswordInput
              id="su-password"
              value={f.password}
              onChange={f.setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              disabled={f.loading}
            />
          </AuthField>

          <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[1.4] text-ink-muted">
            <input
              type="checkbox"
              checked={f.marketingConsent}
              onChange={(e) => f.setMarketingConsent(e.target.checked)}
              className="mt-[2px] h-5 w-5 shrink-0 accent-[#0f6e3f]"
            />
            <span>Send me class recommendations and occasional updates. You can unsubscribe from any email.</span>
          </label>

          <div className="pt-2">
            <AuthButton tone={tone === 'student' ? 'ink' : tone} type="submit" busy={f.loading} disabled={!f.detailsValid}>
              Continue
            </AuthButton>
          </div>
          <LegalLine role={role} />
        </form>

        <p className="text-center text-[16px] text-ink">
          Have an account?{' '}
          <a href={loginHref} className="font-extrabold underline underline-offset-2">
            Log in
          </a>
        </p>
      </AuthMain>
    </AuthFrame>
  );
}

/* ─── verify: 6-digit code ─── */

function VerifyStep({ f, role }: { f: SignupFlow; role: AuthRole }) {
  const mm = Math.floor(f.resendIn / 60);
  const ss = String(f.resendIn % 60).padStart(2, '0');
  return (
    <AuthFrame>
      <AuthTopBar onBack={() => f.goto('details')} />
      <AuthMain>
        <AuthTitle>Check your inbox</AuthTitle>
        <AuthLead>
          We sent a 6-digit code to <strong className="font-extrabold text-ink">{f.email}</strong>. Enter it to create
          your account.
        </AuthLead>

        {f.error && <AuthAlert>{f.error}</AuthAlert>}

        <OtpBoxes value={f.code} onChange={f.setCode} onComplete={f.handleVerify} disabled={f.verifying} />
        {f.verifyError && (
          <p role="alert" className="text-center text-[14px] font-bold text-danger">
            {f.verifyError}
          </p>
        )}

        <AuthButton
          tone={role === 'student' ? 'ink' : role}
          onClick={f.handleVerify}
          busy={f.verifying}
          disabled={f.code.join('').length !== 6}
        >
          Create account
        </AuthButton>
        <AuthButton tone="outline" onClick={() => void f.sendCode()} disabled={f.resendIn > 0 || f.resendLoading} waiting={f.resendIn > 0}>
          {f.resendLoading ? 'Sending…' : f.resendIn > 0 ? `Resend in ${mm}:${ss}` : 'Resend code'}
        </AuthButton>
        <p className="text-center text-[14px] text-ink-muted">
          It can take a minute to arrive. Check your spam folder if you don&apos;t see it.
        </p>

        <div className="flex-1" />
        <div className="flex justify-center">
          <ULink onClick={() => f.goto('details')}>Change email</ULink>
        </div>
      </AuthMain>
    </AuthFrame>
  );
}

function OtpBoxes({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // onComplete reads the hook's `code` state, which only holds the new digits
  // on the NEXT render. So completion is detected here, after that render,
  // rather than inside the change handler.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (armed && value.every((c) => c) && value.join('').length === 6) {
      setArmed(false);
      onComplete();
    }
  }, [armed, value, onComplete]);

  const setAt = (i: number, ch: string) => {
    const next = [...value];
    next[i] = ch;
    onChange(next);
    if (ch && i < 5) refs.current[i + 1]?.focus();
    if (ch) setArmed(true);
  };
  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {value.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Digit ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={c}
          disabled={disabled}
          onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const txt = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!txt) return;
            e.preventDefault();
            onChange(txt.split('').concat(Array(6).fill('')).slice(0, 6));
            refs.current[Math.min(txt.length, 5)]?.focus();
            if (txt.length === 6) setArmed(true);
          }}
          className={cn(
            'h-14 w-0 min-w-0 flex-1 rounded-[8px] bw-hair border-border-strong bg-surface-card text-center',
            'font-display text-[24px] font-extrabold tabular-nums text-ink outline-none',
            'focus:border-brand-edge focus:shadow-[0_0_0_1px_#0f6e3f] disabled:opacity-60'
          )}
        />
      ))}
    </div>
  );
}

function ConfirmedStep({ role }: { role: AuthRole }) {
  return (
    <AuthFrame>
      <AuthMain className="items-center justify-center text-center">
        <span className="grid h-20 w-20 place-items-center rounded-[16px] bw-bold border-ink bg-brand shadow-[0_4px_0_rgb(var(--ds-ink))]">
          <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <AuthTitle>You&apos;re in</AuthTitle>
        <AuthLead>
          {role === 'parent' ? 'Taking you to iTutor…' : 'One more step, then you are done.'}
        </AuthLead>
        <span className="text-ink-muted">
          <Spinner />
        </span>
      </AuthMain>
    </AuthFrame>
  );
}

/* ─── profile: student (G1b) ─── */

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'min-h-[44px] rounded-[8px] bw-bold px-[14px] text-[15px] font-extrabold transition-colors',
        on ? 'border-ink bg-brand text-ink' : 'border-border-strong bg-surface-card text-ink'
      )}
    >
      {children}
    </button>
  );
}

/**
 * The learner's profile step, PARTLY FILLED from the Finder (owner, 18 Nov).
 *
 * - Year: already answered in the Finder, so it shows as a settled answer with
 *   a Change link, not the chip grid again. CAPE is the one exception: the
 *   Finder records "CAPE" and the profile needs Lower 6 or Upper 6, so only
 *   those two chips are offered.
 * - Subjects: the Finder's picks arrive as chips; the question is "anything
 *   else?", answered from the same subject list the Finder used.
 * - School: new here, optional.
 */
function StudentProfileStep({ f }: { f: SignupFlow }) {
  const fromFinder = f.finder?.hasRun === true;
  const finderLevel = f.finder?.level ?? null;
  const [editYear, setEditYear] = useState(!f.year);
  const capeOnly = !f.year && finderLevel === 'CAPE';
  const yearChoices = capeOnly ? YEAR_LEVELS.filter((y) => y.value === 'Lower 6' || y.value === 'Upper 6') : YEAR_LEVELS;
  const yearLabel = YEAR_LEVELS.find((y) => y.value === f.year)?.value ?? f.year;

  return (
    <AuthFrame>
      <AuthTopBar noBack right={<span className="ml-auto text-[13px] font-extrabold tracking-[0.72px] text-brand-edge">LAST STEP</span>} />
      <AuthMain>
        <AuthTitle>{fromFinder ? 'Almost done' : 'What are you studying?'}</AuthTitle>
        <AuthLead>
          {fromFinder
            ? 'We kept what you told us. Add anything we missed.'
            : 'So we can show you the right classes and teachers.'}
        </AuthLead>
        {f.error && <AuthAlert>{f.error}</AuthAlert>}

        <form
          onSubmit={(e) => f.handleStudentProfile(e, { schoolGiven: true })}
          className="flex flex-col gap-[18px]"
          noValidate
        >
          {f.year && !editYear ? (
            <div className="flex items-center justify-between gap-ds-3 rounded-[10px] bw-hair border-border-strong bg-surface-card px-[14px] py-[12px]">
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold text-ink-muted">Year</span>
                <span className="block text-[16px] font-extrabold text-ink">{yearLabel}</span>
              </span>
              <ULink onClick={() => setEditYear(true)}>Change</ULink>
            </div>
          ) : (
            <fieldset className="flex flex-col gap-[8px]">
              <legend className="mb-[8px] text-[15px] font-extrabold text-ink">
                {capeOnly ? 'Lower 6 or Upper 6?' : 'Year'}
              </legend>
              <div className="flex flex-wrap gap-ds-2">
                {yearChoices.map((y) => (
                  <Chip key={y.value} on={f.year === y.value} onClick={() => f.setYear(y.value)}>
                    {y.value}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          <LearnerSubjectsField
            year={f.year}
            value={f.studentSubjects}
            onChange={f.setStudentSubjects}
            fromFinder={fromFinder && f.studentSubjects.length > 0}
          />

          <SchoolPickerV2 value={f.studentInstitution} onChange={f.setStudentInstitution} />

          <AuthButton tone="ink" type="submit" busy={f.loading} disabled={!f.year}>
            Finish
          </AuthButton>
        </form>
      </AuthMain>
    </AuthFrame>
  );
}

/** Subjects as removable chips, plus a search over the Finder's subject list. */
function LearnerSubjectsField({
  year,
  value,
  onChange,
  fromFinder,
}: {
  year: string;
  value: string[];
  onChange: (next: string[]) => void;
  fromFinder: boolean;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const level = canonicalForYear(year);

  useEffect(() => {
    let cancelled = false;
    const url = level ? `/api/finder/subjects?level=${encodeURIComponent(level)}` : '/api/finder/subjects';
    fetch(url)
      .then((r) => (r.ok ? r.json() : { subjects: [] }))
      .then((d: { subjects?: string[] }) => {
        if (!cancelled) setOptions(Array.isArray(d.subjects) ? d.subjects : []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [level]);

  const has = (s: string) => value.some((v) => v.toLowerCase() === s.toLowerCase());
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return options.filter((s) => s.toLowerCase().includes(t) && !has(s)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, options, value]);

  return (
    <AuthField
      label={fromFinder ? 'Do you study anything else?' : 'What subjects do you study?'}
      htmlFor="su-learner-subject"
      hint={fromFinder ? 'Your subjects from the questions are below. Search to add more.' : 'Search, then tap to add.'}
    >
      {value.length > 0 && (
        <div className="flex flex-wrap gap-ds-2 pb-1">
          {value.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(value.filter((v) => v !== s))}
              aria-label={`Remove ${s}`}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-ink px-[14px] text-[14px] font-extrabold text-on-ink"
            >
              {s} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
      <AuthInput
        id="su-learner-subject"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="e.g. Chemistry"
        autoComplete="off"
      />
      {q.trim() && (
        <ul className="overflow-hidden rounded-[8px] bw-hair border-border-strong bg-surface-card">
          {shown.length === 0 ? (
            <li className="px-[14px] py-3 text-[15px] text-ink-muted">No subject matches that.</li>
          ) : (
            shown.map((s) => (
              <li key={s} className="bw-t-hair border-line-soft first:border-t-0">
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, s]);
                    setQ('');
                  }}
                  className="flex min-h-[44px] w-full items-center px-[14px] text-left text-[15px] text-ink hover:bg-surface-sunken"
                >
                  {s}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </AuthField>
  );
}

/* ─── profile: teacher ─── */

/**
 * Subjects first, levels after. A subject label carries its exam ("CSEC
 * Chemistry" is Form 4-5), so the level chips arrive already ticked from the
 * subjects; only Form 1-3, which have no subjects in the list, need a tap.
 * Before this the screen required levels AND subjects: two questions for one
 * fact.
 */
function TutorProfileStep({ f }: { f: SignupFlow }) {
  const ready = f.tSubjects.length > 0 || f.tLevels.length > 0;
  const shown = useMemo(() => f.filteredTutorSubjects, [f.filteredTutorSubjects]);
  return (
    <AuthFrame>
      <AuthTopBar noBack right={<span className="ml-auto text-[13px] font-extrabold tracking-[0.72px] text-[#9a6200]">LAST STEP</span>} />
      <AuthMain>
        <AuthTitle>What do you teach?</AuthTitle>
        <AuthLead>Families find you by subject. You can change these later.</AuthLead>
        {f.error && <AuthAlert>{f.error}</AuthAlert>}

        <AuthField label="Subjects" htmlFor="su-subject" hint="Search, then tap to add.">
          <AuthInput
            id="su-subject"
            value={f.tQuery}
            onChange={(e) => f.setTQuery(e.target.value)}
            placeholder="e.g. CSEC Mathematics"
            autoComplete="off"
          />
          {f.tQuery.trim() && (
            <ul className="overflow-hidden rounded-[8px] bw-hair border-border-strong bg-surface-card">
              {shown.length === 0 ? (
                <li className="px-[14px] py-3 text-[15px] text-ink-muted">No subject matches that.</li>
              ) : (
                shown.map((s) => (
                  <li key={s} className="bw-t-hair border-line-soft first:border-t-0">
                    <button
                      type="button"
                      onClick={() => f.addTutorSubject(s)}
                      className="flex min-h-[44px] w-full items-center px-[14px] text-left text-[15px] text-ink hover:bg-surface-sunken"
                    >
                      {s}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          {f.tSubjects.length > 0 && (
            <div className="flex flex-wrap gap-ds-2 pt-1">
              {f.tSubjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => f.removeTutorSubject(s)}
                  aria-label={`Remove ${s}`}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-ink px-[14px] text-[14px] font-extrabold text-on-ink"
                >
                  {s} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
        </AuthField>

        <fieldset className="flex flex-col">
          <legend className="mb-[4px] text-[15px] font-extrabold text-ink">Levels</legend>
          <p className="mb-[8px] text-[14px] text-ink-muted">
            Filled in from your subjects. Tap to add Forms 1 to 3 if you teach them.
          </p>
          <div className="flex flex-wrap gap-ds-2">
            {TUTOR_LEVELS.map((l) => (
              <Chip
                key={l.value}
                on={f.tLevels.includes(l.value)}
                onClick={() => f.toggleLevel(l.value)}
              >
                {l.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <AuthButton tone="tutor" onClick={f.handleTutorProfile} busy={f.loading} disabled={!ready}>
          Finish
        </AuthButton>
      </AuthMain>
    </AuthFrame>
  );
}
