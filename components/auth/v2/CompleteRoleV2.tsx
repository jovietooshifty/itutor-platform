'use client';

/**
 * The account-type question after Google sign-up (/signup/complete-role),
 * new UI. PRESENTATION ONLY: app/signup/complete-role/page.tsx keeps every
 * piece of logic (resolve-role, /api/auth/complete-profile, the Finder
 * prefill, returnTo) and passes state and handlers in here.
 *
 * Built from the "Sign up and Log in" set (RO01 cards, the profile chips of
 * the email path). Differences from the old card:
 * - The parent card is hidden while parent accounts are off, rather than
 *   shown as "Coming soon" (the email path does the same).
 * - The student "Are you affiliated with a school?" question is gone: the
 *   school is simply optional, as on the email path. Picking one saves it.
 * - The photo step is the shared ProfilePhotoStep, in its own styling inside
 *   the new frame: PROVISIONAL.
 */

import { useEffect } from 'react';
import ProfilePhotoStep from '@/components/onboarding/ProfilePhotoStep';
import type { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { cn } from '@/lib/utils';
import {
  AuthAlert,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthInput,
  AuthLead,
  AuthMain,
  AuthTitle,
  AuthTopBar,
  ROLE_TAG,
  Spinner,
  type AuthRole,
} from './AuthKit';
import { Chip } from './SignupV2';
import SchoolPickerV2 from './SchoolPickerV2';

const CARDS: { role: AuthRole; tag: string; title: string; detail: string }[] = [
  { role: 'student', tag: 'STUDENT', title: "I'm a student", detail: 'Classes and 1:1 lessons with Caribbean teachers' },
  { role: 'parent', tag: 'PARENT', title: "I'm a parent", detail: "Find and pay for your child's lessons" },
  { role: 'tutor', tag: 'TEACHER', title: "I'm a teacher", detail: 'Teach classes and 1:1, get paid in TTD' },
];

export type CompleteRoleV2Props = {
  checking: boolean;
  step: 'role' | 'profile' | 'photo';
  userId: string | null;
  role: AuthRole | null;
  setRole: (r: AuthRole) => void;
  error: string;
  clearError: () => void;
  loading: boolean;
  parentAccountsEnabled: boolean;
  onRoleContinue: () => void;
  // student
  years: { value: string; label: string }[];
  year: string;
  setYear: (y: string) => void;
  school: Institution | null;
  setSchool: (i: Institution | null) => void;
  markSchoolOptional: () => void;
  onStudentSave: () => void;
  // tutor
  tutorLevels: { value: string; label: string }[];
  tLevels: string[];
  toggleLevel: (v: string) => void;
  tSubjects: string[];
  tQuery: string;
  setTQuery: (q: string) => void;
  subjectMatches: string[];
  addSubject: (s: string) => void;
  removeSubject: (s: string) => void;
  onTutorSave: () => void;
  // photo
  onDone: () => void;
};

export default function CompleteRoleV2(p: CompleteRoleV2Props) {
  // The old form asked "attend / teach / no" before saving a school. The new
  // one just offers the school, so the answer is "attend" whenever one is
  // picked and nothing is saved when none is.
  const { step, role, markSchoolOptional } = p;
  useEffect(() => {
    if (step === 'profile' && role === 'student') markSchoolOptional();
  }, [step, role, markSchoolOptional]);

  if (p.checking) {
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

  if (p.step === 'photo' && p.userId) {
    return (
      <AuthFrame>
        <AuthTopBar noBack />
        <AuthMain>
          <AuthTitle>Add a profile photo</AuthTitle>
          <AuthLead>So {p.role === 'tutor' ? 'families' : 'your teachers'} know who you are. You can skip this.</AuthLead>
          <div className="rounded-[10px] bw-hair border-border bg-surface-card p-4">
            <ProfilePhotoStep userId={p.userId} role={p.role === 'tutor' ? 'tutor' : 'student'} onSaved={p.onDone} onSkip={p.onDone} />
          </div>
        </AuthMain>
      </AuthFrame>
    );
  }

  if (p.step === 'profile' && p.role === 'student') {
    return (
      <AuthFrame>
        <AuthTopBar noBack right={<span className="ml-auto text-[13px] font-extrabold tracking-[0.72px] text-brand-edge">LAST STEP</span>} />
        <AuthMain>
          <AuthTitle>What are you studying?</AuthTitle>
          <AuthLead>So we can show you the right classes and teachers.</AuthLead>
          {p.error ? <AuthAlert>{p.error}</AuthAlert> : null}
          <fieldset className="m-0 flex flex-col border-0 p-0">
            <legend className="mb-[8px] text-[15px] font-extrabold text-ink">Year</legend>
            <div className="flex flex-wrap gap-ds-2">
              {p.years.map((y) => (
                <Chip key={y.value} on={p.year === y.value} onClick={() => p.setYear(y.value)}>
                  {y.value}
                </Chip>
              ))}
            </div>
          </fieldset>
          <SchoolPickerV2 value={p.school} onChange={p.setSchool} />
          <AuthButton tone="ink" onClick={p.onStudentSave} busy={p.loading} disabled={!p.year}>
            Continue
          </AuthButton>
        </AuthMain>
      </AuthFrame>
    );
  }

  if (p.step === 'profile' && p.role === 'tutor') {
    const needsSubjects = p.tLevels.some((l) => l !== 'sea');
    const ready = p.tLevels.length > 0 && (!needsSubjects || p.tSubjects.length > 0);
    return (
      <AuthFrame>
        <AuthTopBar noBack right={<span className="ml-auto text-[13px] font-extrabold tracking-[0.72px] text-[#9a6200]">LAST STEP</span>} />
        <AuthMain>
          <AuthTitle>What do you teach?</AuthTitle>
          <AuthLead>Families find you by level and subject. You can change these later.</AuthLead>
          {p.error ? <AuthAlert>{p.error}</AuthAlert> : null}
          <fieldset className="m-0 flex flex-col border-0 p-0">
            <legend className="mb-[8px] text-[15px] font-extrabold text-ink">Levels</legend>
            <div className="flex flex-wrap gap-ds-2">
              {p.tutorLevels.map((l) => (
                <Chip key={l.value} on={p.tLevels.includes(l.value)} onClick={() => p.toggleLevel(l.value)}>
                  {l.label}
                </Chip>
              ))}
            </div>
          </fieldset>
          {needsSubjects ? (
            <AuthField label="Subjects" htmlFor="cr-subject" hint="Search, then tap to add.">
              <AuthInput id="cr-subject" value={p.tQuery} onChange={(e) => p.setTQuery(e.target.value)} placeholder="e.g. CSEC Mathematics" autoComplete="off" />
              {p.tQuery.trim() ? (
                <ul className="m-0 list-none overflow-hidden rounded-[8px] bw-hair border-border-strong bg-surface-card p-0">
                  {p.subjectMatches.length === 0 ? (
                    <li className="px-[14px] py-3 text-[15px] text-ink-muted">No subject matches that.</li>
                  ) : (
                    p.subjectMatches.map((s) => (
                      <li key={s} className="bw-t-hair border-line-soft first:border-t-0">
                        <button type="button" onClick={() => p.addSubject(s)} className="flex min-h-[44px] w-full items-center px-[14px] text-left text-[15px] text-ink hover:bg-surface-sunken">
                          {s}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
              {p.tSubjects.length ? (
                <div className="flex flex-wrap gap-ds-2 pt-1">
                  {p.tSubjects.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => p.removeSubject(s)}
                      aria-label={`Remove ${s}`}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-ink px-[14px] text-[14px] font-extrabold text-on-ink"
                    >
                      {s} <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </AuthField>
          ) : null}
          <AuthButton tone="tutor" onClick={p.onTutorSave} busy={p.loading} disabled={!ready}>
            Continue
          </AuthButton>
        </AuthMain>
      </AuthFrame>
    );
  }

  // step === 'role'
  return (
    <AuthFrame tone="brand">
      <AuthTopBar noBack />
      <AuthMain>
        <AuthTitle size={34}>
          One more thing:
          <br />
          who are you?
        </AuthTitle>
        {p.error ? <AuthAlert>{p.error}</AuthAlert> : null}
        <div role="radiogroup" aria-label="Account type" className="flex flex-col gap-[14px]">
          {CARDS.filter((c) => c.role !== 'parent' || p.parentAccountsEnabled).map((c) => {
            const on = p.role === c.role;
            return (
              <button
                key={c.role}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  p.setRole(c.role);
                  p.clearError();
                }}
                className={cn(
                  'flex min-h-[112px] overflow-hidden rounded-[10px] bw-bold border-ink bg-surface-card text-left',
                  on ? 'shadow-[0_4px_0_rgb(var(--ds-ink))] [outline-style:solid] outline-[3px] outline-offset-2 outline-ink' : 'shadow-[0_4px_0_rgb(var(--ds-ink))]',
                  'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink'
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-[5px] py-[14px] pl-[16px] pr-3">
                  <span className={cn('self-start rounded-[4px] bw-hair border-ink px-2 py-[3px] text-[12px] font-extrabold tracking-[0.72px]', ROLE_TAG[c.role])}>
                    {c.tag}
                  </span>
                  <span className="font-display text-[20px] font-extrabold leading-[22px] text-ink">{c.title}</span>
                  <span className="text-[14px] leading-[18.9px] text-ink-muted">{c.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <p className="m-0 text-center text-[14px] font-extrabold text-ink">You can&apos;t change account type later, so pick the one that fits.</p>
        <AuthButton tone="ink" onClick={p.onRoleContinue} busy={p.loading} disabled={!p.role}>
          Continue
        </AuthButton>
      </AuthMain>
    </AuthFrame>
  );
}
