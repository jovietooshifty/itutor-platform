'use client';

/**
 * The Finder questionnaire in the new UI (Figma OB05/OB07/PO01/PO03).
 *
 * PRESENTATION ONLY. Every piece of state, the URL-driven step, the answer
 * hydration, the submit and the analytics stay in FinderWizard, which hands
 * them down here when the new UI is on. That keeps one implementation of the
 * rules its header comment lists (step in the URL, no per-step skipping,
 * Continue disabled rather than hidden, no artificial delay) instead of two
 * that could drift.
 *
 * The SUBJECT step is multi-select (owner, 18 Nov): a tap toggles a row and
 * Continue moves on. OB05's subject tiles and chevrons are gone on purpose.
 */

import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { ReactNode, Ref } from 'react';
import {
  Award,
  BookOpen,
  CalendarDays,
  Compass,
  GraduationCap,
  Laptop,
  MapPin,
  Moon,
  Search,
  Shuffle,
  Sun,
  Sunrise,
  Trophy,
  User,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/matching/availability';
import {
  BUDGET_BANDS,
  DELIVERY_PREFS,
  FINDER_LEVEL_LABELS,
  LESSON_TYPES,
  MAX_SUBJECTS,
  QUESTIONNAIRE_LEVELS,
  STEP,
  URGENCIES,
  type CanonicalLevel,
  type DeliveryPref,
  type FinderAnswers,
  type LessonType,
  type Urgency,
} from '@/lib/finder/wizard';
import { cn } from '@/lib/utils';
import {
  FinderButton,
  FinderFrame,
  FinderLead,
  FinderLink,
  FinderTitle,
  FinderTopBar,
  FindingScreen,
  OptionCard,
  SubjectList,
  SubjectRow,
  type FinderTone,
} from './FinderKit';
import FinderRolePickerV2 from './FinderRolePickerV2';

const LEVEL_ICON: Record<CanonicalLevel, ReactNode> = {
  SEA: <BookOpen className="size-5" />,
  FORM_1: <GraduationCap className="size-5" />,
  FORM_2: <GraduationCap className="size-5" />,
  FORM_3: <GraduationCap className="size-5" />,
  FORM_4: <Award className="size-5" />,
  FORM_5: <Award className="size-5" />,
  CAPE: <Trophy className="size-5" />,
};

function blockIcon(block: string): ReactNode {
  if (block === 'weekday_morning') return <Sunrise className="size-5" />;
  if (block === 'weekday_afternoon') return <Sun className="size-5" />;
  if (block === 'weekday_evening') return <Moon className="size-5" />;
  return <CalendarDays className="size-5" />;
}

const LESSON_ICON: Record<LessonType, ReactNode> = {
  group: <Users className="size-5" />,
  one_on_one: <User className="size-5" />,
  either: <Shuffle className="size-5" />,
};
const DELIVERY_ICON: Record<DeliveryPref, ReactNode> = {
  online: <Laptop className="size-5" />,
  in_person: <MapPin className="size-5" />,
  either: <Shuffle className="size-5" />,
};
const URGENCY_ICON: Record<Urgency, ReactNode> = {
  now: <Zap className="size-5" />,
  this_month: <CalendarDays className="size-5" />,
  exploring: <Compass className="size-5" />,
};

const INPUT =
  'w-full rounded-[10px] bw-bold border-ink bg-surface-card px-[14px] py-[14px] font-body text-[16px] text-ink placeholder:text-ink-muted ' +
  'focus:[outline-style:solid] focus:outline-2 focus:outline-offset-2 focus:outline-ink';

export interface FinderWizardV2Props {
  step: number;
  isParent: boolean;
  isAuthenticated: boolean;
  firstName: string | null;
  answers: FinderAnswers;
  setAnswers: (fn: (a: FinderAnswers) => FinderAnswers) => void;
  subjectOptions: string[] | null;
  subjectError: boolean;
  onRetrySubjects: () => void;
  query: string;
  setQuery: (q: string) => void;
  savedShown: string[];
  restShown: string[];
  who: string;
  index: number;
  total: number;
  isLastStep: boolean;
  canGoBack: boolean;
  answered: boolean;
  submitting: boolean;
  submitError: string | null;
  firstStep: number;
  /** The step after this one, or null on the last / a non-question step. */
  nextStep: number | null;
  advance: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  skip: () => void;
  submit: () => void;
  headingRef: Ref<HTMLHeadingElement>;
  searchParams: ReadonlyURLSearchParams;
}

export default function FinderWizardV2(p: FinderWizardV2Props) {
  const tone: FinderTone = p.isParent ? 'parent' : 'student';
  const { step, answers, setAnswers } = p;

  let title: ReactNode = '';
  let lead: ReactNode = null;
  let body: ReactNode = null;
  let foot: ReactNode = null;

  if (step === STEP.ROLE) {
    title = 'What brings you to iTutor?';
    lead = 'Pick the one that sounds like you.';
    body = <FinderRolePickerV2 searchParams={p.searchParams} showTutor={false} />;
  } else if (step === STEP.LEVEL) {
    title = p.isParent ? `What level is ${p.who} in?` : 'What level are you in?';
    lead = "We'll only show classes that teach your syllabus.";
    body = (
      <div className="flex flex-col gap-ds-2">
        {QUESTIONNAIRE_LEVELS.map((level) => (
          <OptionCard
            key={level.value}
            tone={tone}
            icon={LEVEL_ICON[level.value]}
            label={FINDER_LEVEL_LABELS[level.value]}
            selected={answers.level === level.value}
            onSelect={() => setAnswers((a) => ({ ...a, level: level.value }))}
          />
        ))}
      </div>
    );
    if (p.isParent) foot = 'More than one child? Add the others after you sign up.';
  } else if (step === STEP.CHILD) {
    title = 'Who are these lessons for?';
    lead = 'Just a first name. They do not need their own account yet.';
    body = (
      <div className="flex flex-col gap-ds-2">
        <label className="sr-only" htmlFor="finder-child">
          Child&apos;s first name
        </label>
        <input
          id="finder-child"
          type="text"
          value={answers.childLabel ?? ''}
          onChange={(e) => setAnswers((a) => ({ ...a, childLabel: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && p.answered) p.advance();
          }}
          placeholder="First name"
          maxLength={80}
          autoComplete="off"
          className={INPUT}
        />
        <p className="text-[13px] leading-[1.4] text-ink-muted">
          You can link their account later. Securing a place does not need one now.
        </p>
      </div>
    );
  } else if (step === STEP.SUBJECT) {
    title = p.isParent ? `What does ${p.who} need help with?` : 'What do you need help with?';
    lead = answers.level
      ? `${FINDER_LEVEL_LABELS[answers.level]} subjects. Pick all that apply.`
      : 'Pick every subject you want a class in.';
    // Multi-select: a tap toggles. Continue moves on once at least one is picked.
    const pick = (subject: string) =>
      setAnswers((a) => {
        if (a.subjects.includes(subject)) return { ...a, subjects: a.subjects.filter((s) => s !== subject) };
        if (a.subjects.length >= MAX_SUBJECTS) return a;
        return { ...a, subjects: [...a.subjects, subject] };
      });
    body = (
      <div className="flex flex-col gap-ds-3">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-[14px] top-1/2 size-5 -translate-y-1/2 text-ink" />
          <label className="sr-only" htmlFor="finder-subject-search">
            Search subjects
          </label>
          <input
            id="finder-subject-search"
            type="search"
            value={p.query}
            onChange={(e) => p.setQuery(e.target.value)}
            placeholder="Search subjects"
            className={cn(INPUT, 'py-[12px] pl-[44px]')}
          />
        </div>

        {answers.level && !p.isAuthenticated ? (
          <FinderLink onClick={() => p.goToStep(STEP.LEVEL)} className="-my-2 self-start text-[14px]">
            Not {FINDER_LEVEL_LABELS[answers.level]}? Change level
          </FinderLink>
        ) : null}

        {p.subjectError ? (
          <div className="rounded-[10px] bw-hair border-border bg-surface-card px-[14px] py-ds-3 text-[14px] text-ink-muted">
            We could not load subjects just now.{' '}
            <FinderLink onClick={p.onRetrySubjects} className="min-h-0 text-[14px]">
              Try again
            </FinderLink>
          </div>
        ) : p.subjectOptions === null ? (
          <div className="flex flex-col gap-ds-2" aria-label="Loading subjects">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[60px] animate-pulse rounded-[10px] bg-surface-sunken" />
            ))}
          </div>
        ) : p.savedShown.length === 0 && p.restShown.length === 0 ? (
          <p className="py-ds-2 text-[14px] text-ink-muted">Nothing matches that. Try a shorter word.</p>
        ) : (
          <>
            {p.savedShown.length > 0 ? (
              <SubjectList>
                {p.savedShown.map((s) => (
                  <SubjectRow
                    key={s}
                    subject={s}
                    badge="You study this"
                    tone={tone}
                    selected={answers.subjects.includes(s)}
                    onSelect={() => pick(s)}
                  />
                ))}
              </SubjectList>
            ) : null}
            {p.savedShown.length > 0 && p.restShown.length > 0 ? (
              <p className="pt-ds-1 text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">Other subjects</p>
            ) : null}
            {p.restShown.length > 0 ? (
              <SubjectList>
                {p.restShown.map((s) => (
                  <SubjectRow key={s} subject={s} tone={tone} selected={answers.subjects.includes(s)} onSelect={() => pick(s)} />
                ))}
              </SubjectList>
            ) : null}
          </>
        )}
      </div>
    );
  } else if (step === STEP.AVAILABILITY) {
    title = p.isParent ? `When can ${p.who} have lessons?` : 'When can you have lessons?';
    lead = 'Pick all that work. More times means more classes fit.';
    body = (
      <div className="flex flex-col gap-ds-2">
        {AVAILABILITY_BLOCKS.map((block) => {
          const selected = answers.availabilityBlocks.includes(block.value);
          return (
            <OptionCard
              key={block.value}
              tone={tone}
              multi
              icon={blockIcon(block.value)}
              label={block.label}
              selected={selected}
              onSelect={() =>
                setAnswers((a) => ({
                  ...a,
                  availabilityBlocks: selected
                    ? a.availabilityBlocks.filter((b) => b !== block.value)
                    : [...a.availabilityBlocks, block.value as AvailabilityBlock],
                }))
              }
            />
          );
        })}
      </div>
    );
  } else if (step === STEP.LESSON_TYPE) {
    title = 'Group class or one-to-one?';
    body = (
      <div className="flex flex-col gap-ds-2">
        {LESSON_TYPES.map((t) => (
          <OptionCard
            key={t.value}
            tone={tone}
            icon={LESSON_ICON[t.value]}
            label={t.label}
            detail={t.detail}
            selected={answers.lessonType === t.value}
            onSelect={() => setAnswers((a) => ({ ...a, lessonType: t.value as LessonType }))}
          />
        ))}
      </div>
    );
  } else if (step === STEP.DELIVERY) {
    title = 'Online or in person?';
    lead = 'Most classes are online. Some meet at a venue.';
    body = (
      <div className="flex flex-col gap-ds-2">
        {DELIVERY_PREFS.map((pref) => (
          <OptionCard
            key={pref.value}
            tone={tone}
            icon={DELIVERY_ICON[pref.value]}
            label={pref.label}
            detail={pref.detail}
            selected={answers.deliveryPref === pref.value}
            onSelect={() => setAnswers((a) => ({ ...a, deliveryPref: pref.value as DeliveryPref }))}
          />
        ))}
      </div>
    );
  } else if (step === STEP.BUDGET) {
    title = "What's your monthly budget?";
    lead = 'In TT dollars. We show everything at or below what you pick.';
    body = (
      <div className="flex flex-col gap-ds-2">
        {BUDGET_BANDS.map((band) => (
          <OptionCard
            key={band.value}
            tone={tone}
            icon={<Wallet className="size-5" />}
            label={band.label}
            detail={band.detail}
            selected={answers.budgetBand === band.value}
            onSelect={() => setAnswers((a) => ({ ...a, budgetBand: band.value }))}
          />
        ))}
      </div>
    );
  } else if (step === STEP.URGENCY) {
    title = 'When do you want to start?';
    body = (
      <div className="flex flex-col gap-ds-2">
        {URGENCIES.map((u) => (
          <OptionCard
            key={u.value}
            tone={tone}
            icon={URGENCY_ICON[u.value]}
            label={u.label}
            selected={answers.urgency === u.value}
            onSelect={() => setAnswers((a) => ({ ...a, urgency: u.value as Urgency }))}
          />
        ))}
      </div>
    );
  } else {
    title = "Let's find your iTutor";
    lead = 'A few quick questions, then the classes that fit.';
    body = (
      <FinderButton tone={tone} onClick={() => p.goToStep(p.firstStep)}>
        Start
      </FinderButton>
    );
  }

  const isQuestion = p.index >= 0;
  const showCta = step !== STEP.ROLE && isQuestion;

  return (
    <FinderFrame>
      {p.submitting ? <FindingScreen subject={answers.subjects.length === 1 ? answers.subjects[0] : null} who={p.isParent ? p.who : 'you'} /> : null}
      <FinderTopBar
        tone={tone}
        onBack={p.canGoBack ? p.goBack : undefined}
        backHref={p.canGoBack ? undefined : p.isAuthenticated ? undefined : '/start'}
        progress={isQuestion ? { index: p.index, total: p.total } : undefined}
        right={
          <button
            type="button"
            onClick={p.skip}
            aria-label="Skip the questions and show every class"
            className="ml-1 inline-flex min-h-[44px] items-center px-1 text-[15px] font-extrabold text-ink focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-ink"
          >
            Skip
          </button>
        }
      />

      <main className="flex flex-1 flex-col gap-[14px] px-5 pb-6 pt-1">
        <FinderTitle headingRef={p.headingRef}>{title}</FinderTitle>
        {lead ? <FinderLead>{lead}</FinderLead> : null}
        {p.firstName && p.index === 0 ? (
          <p className="-mt-1 text-[14px] font-extrabold text-ink">Welcome, {p.firstName}. This takes about a minute.</p>
        ) : null}
        {body}
        {foot ? <p className="text-[13px] text-ink-muted">{foot}</p> : null}

        <div className="flex-1" />

        {p.submitError ? (
          <p role="alert" className="rounded-[8px] bw-bold border-danger bg-danger-soft px-[14px] py-[10px] text-[14px] text-ink">
            {p.submitError}
          </p>
        ) : null}

        {showCta ? (
          // Sticky so the button stays reachable under a long subject list or
          // above the soft keyboard; the page background behind it keeps the
          // last option from showing through.
          <div className="sticky bottom-0 -mx-5 bg-surface-page px-5 pb-1 pt-ds-2">
            {step === STEP.SUBJECT ? (
              <FinderButton tone={tone} disabled={!p.answered} onClick={p.advance}>
                {answers.subjects.length > 1 ? `Continue with ${answers.subjects.length} subjects` : 'Continue'}
              </FinderButton>
            ) : (
              <FinderButton
                tone={tone}
                disabled={!p.answered || p.submitting}
                onClick={p.isLastStep ? p.submit : p.advance}
              >
                {p.isLastStep ? (p.isParent ? 'See matches' : 'Find my classes') : 'Continue'}
              </FinderButton>
            )}
          </div>
        ) : null}

        {!p.isAuthenticated ? (
          <p className="text-center text-[14px] text-ink-muted">
            Already have an account?{' '}
            <FinderLink href="/login" className="min-h-0 text-[14px]">
              Log in
            </FinderLink>
          </p>
        ) : null}
      </main>
    </FinderFrame>
  );
}

