'use client';

/**
 * A class the student has not joined yet — Figma `2:922` "Class details
 * (before joining)", file rwytRx6xmRHf4AMzpxAznd.
 *
 * PRESENTATION ONLY. The route (app/student/explore/[groupId]) loads the class
 * with fetchClassDetail, asks the server whether a parent must approve
 * (ParentGate), and owns the join flow. This draws the frame and calls
 * `onCta`. What the button says comes from lib/classes/classCta, the same rule
 * as the old page, so the two cannot disagree while both exist.
 *
 * Frame, top to bottom: cover · tags (subject, level, GROUP CLASS) · title ·
 * tutor row · "class basics" card (schedule + weekday strip, price, level,
 * where) · next-class ink card · About with Read more · a bottom bar with the
 * price and the action, above the tab bar.
 *
 * Deliberate departures from the frame:
 * - The heart (save) has no backend, so it is not drawn.
 * - The frame swaps the app header for a back bar. The header stays (search,
 *   bell, account) and the back link leads the content, as on the parent
 *   detail screens, so the two apps behave alike.
 * - Wide screens: two columns with a sticky price/action panel. PROVISIONAL,
 *   there is no desktop frame.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CreditCard,
  Globe,
  GraduationCap,
  MapPin,
} from '@phosphor-icons/react';
import { Button, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ClassCover } from '@/components/parent/v2/ClassCover';
import { preorderFor, type GroupData, type ParentGate, type SessionRow } from '@/components/classes/ClassDetailView';
import { SecureSpotTermsV2 } from '@/components/classes/SecureSpotTermsV2';
import { classCta, type ClassCta } from '@/lib/classes/classCta';
import { formatLevel } from '@/lib/utils/formatLevel';

const TZ = 'America/Port_of_Spain';
const AST_OFFSET_MS = 4 * 3_600_000;
/** The frame's strip starts on Sunday. */
const STRIP = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function money(n: number) {
  return `TT$${Number.isInteger(n) ? n.toLocaleString('en-TT') : n.toFixed(2)}`;
}

function astWeekday(d: Date) {
  return new Date(d.getTime() - AST_OFFSET_MS).getUTCDay();
}

function liveSeries(sessions: SessionRow[]) {
  const now = Date.now();
  return (sessions ?? []).filter(
    (s) =>
      (s.recurrence_days?.length ?? 0) > 0 &&
      (s.occurrences ?? []).some((o) => !o.cancelled_at && new Date(o.scheduled_end_at).getTime() >= now)
  );
}

/** "6:00 to 7:30 PM" from an "18:00" start and a duration. */
function timeRange(hhmm: string | null, mins: number | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const fmt = (total: number) => {
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return { t: `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`, ap: hh < 12 ? 'AM' : 'PM' };
  };
  const a = fmt(h * 60 + (m || 0));
  if (!mins) return `${a.t} ${a.ap}`;
  const b = fmt(h * 60 + (m || 0) + mins);
  return a.ap === b.ap ? `${a.t} to ${b.t} ${b.ap}` : `${a.t} ${a.ap} to ${b.t} ${b.ap}`;
}

function joinDays(days: number[]) {
  const names = [...new Set(days)].sort().map((d) => DAY[d]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function nextOccurrence(sessions: SessionRow[]) {
  const now = Date.now();
  let best: Date | null = null;
  for (const s of sessions ?? []) {
    for (const o of s.occurrences ?? []) {
      if (o.cancelled_at) continue;
      const start = new Date(o.scheduled_start_at);
      if (new Date(o.scheduled_end_at).getTime() < now) continue;
      if (!best || start < best) best = start;
    }
  }
  return best;
}

/** "TODAY" / "IN 1 DAY" / "IN 4 DAYS", counted in Trinidad calendar days. */
function relDays(d: Date) {
  const day = (ms: number) => Math.floor((ms - AST_OFFSET_MS) / 86_400_000);
  const diff = day(d.getTime()) - day(Date.now());
  if (diff <= 0) return 'Today';
  return diff === 1 ? 'In 1 day' : `In ${diff} days`;
}

function BasicsRow({
  icon,
  title,
  sub,
  first,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string | null;
  first?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-[10px] py-ds-3', !first && 'bw-t-hair border-surface-sunken')}>
      <div className="flex items-center gap-ds-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm bg-ink text-brand">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[16px] font-extrabold text-ink">{title}</p>
          {sub ? <p className="m-0 text-[13px] text-ink-muted">{sub}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function PriceBlock({ cta, perLabel }: { cta: ClassCta; perLabel: string }) {
  return (
    <div className="min-w-0">
      <p className="m-0 font-display text-[20px] font-black leading-[22px] tabular-nums text-ink">
        {cta.price > 0 ? money(cta.price) : 'Free'}
        {cta.price > 0 ? (
          <span className="font-body text-[13px] font-bold text-ink-muted">{` /${perLabel}`}</span>
        ) : null}
      </p>
      <p className="m-0 mt-[2px] truncate text-[13px] text-ink-muted">{cta.caption}</p>
    </div>
  );
}

export interface StudentClassDetailV2Props {
  group: GroupData;
  parentGate: ParentGate | null;
  /** Called for every CTA except "Open class", which navigates itself. */
  onJoin: () => void;
}

export function useStudentClassCta(group: GroupData, parentGate: ParentGate | null) {
  // Null on the first render, then the clock — see classCta's note.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!group.paymentPending || !group.paymentPendingExpiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [group.paymentPending, group.paymentPendingExpiresAt]);
  return useMemo(() => classCta(group, parentGate, now), [group, parentGate, now]);
}

/** The bar pinned above the phone tab bar (passed to the shell's bottomBar). */
export function StudentClassJoinBar({ group, parentGate, onJoin }: StudentClassDetailV2Props) {
  const router = useRouter();
  const cta = useStudentClassCta(group, parentGate);
  const perLabel = group.price_monthly ? 'mo' : 'session';
  return (
    <div className="flex items-center justify-between gap-ds-3 bw-t-hair border-border bg-surface-card px-ds-4 pb-[14px] pt-[13px] lg:hidden">
      <PriceBlock cta={cta} perLabel={perLabel} />
      <Button
        size="lg"
        disabled={cta.disabled}
        variant={cta.isFull && cta.kind === 'waitlist' ? 'dark' : 'primary'}
        className="shrink-0 px-[28px]"
        onClick={() => (cta.kind === 'open' ? router.push(`/student/classes/${group.id}`) : onJoin())}
      >
        {cta.label}
      </Button>
    </div>
  );
}

export function StudentClassDetailV2({ group, parentGate, onJoin }: StudentClassDetailV2Props) {
  const router = useRouter();
  const cta = useStudentClassCta(group, parentGate);
  const [aboutOpen, setAboutOpen] = useState(false);
  const preorder = useMemo(() => preorderFor(group), [group]);

  const subject = group.subject || group.name;
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const perLabel = group.price_monthly ? 'mo' : 'session';

  const series = liveSeries(group.sessions);
  const days = new Set<number>(series.flatMap((s) => s.recurrence_days ?? []));
  const next = nextOccurrence(group.sessions);
  if (days.size === 0 && next) days.add(astWeekday(next));
  const first = series[0];
  const schedule =
    days.size > 0
      ? [joinDays([...days]), timeRange(first?.start_time ?? null, first?.duration_minutes ?? group.session_length_minutes)]
          .filter(Boolean)
          .join(' · ')
      : null;

  const level = group.form_level ? formatLevel(group.form_level) : null;
  // Curriculum tag ("CSEC") when the subject or level names one.
  const curriculum = /\b(CSEC|CAPE|SEA)\b/i.exec(`${group.subject ?? ''} ${group.form_level ?? ''} ${group.name}`)?.[1]?.toUpperCase();
  const where =
    group.class_format === 'physical' || group.class_format === 'hybrid'
      ? {
          icon: <MapPin size={18} weight="bold" aria-hidden />,
          title: group.venue?.name ?? (group.class_format === 'hybrid' ? 'Online or in person' : 'In person'),
          sub: group.venue?.region?.name ?? null,
        }
      : {
          icon: <Globe size={18} weight="bold" aria-hidden />,
          title: group.google_classroom_link ? 'Google Classroom' : 'Online class',
          sub: 'You get the link after joining',
        };

  const tutorMeta =
    group.average_rating && group.average_rating > 0
      ? `★ ${group.average_rating.toFixed(1)}`
      : 'No reviews yet';

  const basics = (
    <div className="flex flex-col rounded-ds-card bw-bold border-ink bg-surface-card px-ds-4 py-ds-1h">
      <BasicsRow
        first
        icon={<CalendarBlank size={18} weight="bold" aria-hidden />}
        title={schedule ?? 'Schedule to be confirmed'}
        sub={schedule ? 'Trinidad time (AST)' : 'The tutor has not set times yet'}
      >
        {days.size > 0 ? (
          <div className="flex gap-ds-1 pl-12" aria-label={`Meets ${[...days].sort().map((d) => DAY_LONG[d]).join(' and ')}`}>
            {STRIP.map((letter, i) => (
              <span
                key={i}
                aria-hidden
                className={cn(
                  'flex h-8 min-w-0 flex-1 items-center justify-center rounded-ds-xs text-[12px] font-extrabold',
                  days.has(i) ? 'bg-brand text-ink' : 'bw-hair border-border text-ink-muted'
                )}
              >
                {letter}
              </span>
            ))}
          </div>
        ) : null}
      </BasicsRow>
      <BasicsRow
        icon={<CreditCard size={18} weight="bold" aria-hidden />}
        title={cta.price > 0 ? `${money(cta.price)} a ${perLabel === 'mo' ? 'month' : 'session'}` : 'Free'}
        sub={
          cta.price > 0 && group.price_monthly
            ? preorder && !group.enrolled
              ? 'First month paid up front · nothing renews by itself'
              : 'Cancel anytime'
            : null
        }
      />
      {level ? (
        <BasicsRow icon={<GraduationCap size={18} weight="bold" aria-hidden />} title={level} />
      ) : null}
      <BasicsRow icon={where.icon} title={where.title} sub={where.sub} />
    </div>
  );

  return (
    <div className="flex flex-col gap-ds-card lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-ds-6">
      <div className="flex min-w-0 flex-col gap-ds-card">
        <Link
          href="/student/find-tutors"
          className="ds-link inline-flex min-h-[44px] items-center gap-ds-1h self-start text-[15px] font-extrabold text-ink"
        >
          <CaretLeft size={20} weight="bold" aria-hidden />
          Explore
        </Link>

        <ClassCover
          image={group.cover_image}
          subject={subject}
          className="h-[120px] rounded-ds-card md:h-[200px] lg:h-[240px]"
        />

        <div className="flex flex-col gap-ds-2">
          <div className="flex flex-wrap gap-ds-1h">
            {group.subject ? <Tag tone="warning">{group.subject.toUpperCase()}</Tag> : null}
            {curriculum ? <Tag tone="outline">{curriculum}</Tag> : null}
            <Tag tone="outline">GROUP CLASS</Tag>
            {cta.isFull ? <Tag tone="dark">FULL</Tag> : null}
          </div>
          <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">{group.name}</h1>
        </div>

        {group.tutor ? (
          <Link
            href={`/student/tutors/${group.tutor.id}`}
            className="ds-press flex items-center gap-ds-3 rounded-ds-card bg-surface-card bw-hair border-border px-[13px] py-[11px]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-ds-sm bg-surface-sunken font-display text-[15px] font-extrabold text-ink">
              {group.tutor.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.tutor.avatar_url} alt="" className="size-full object-cover" />
              ) : (
                tutorName.charAt(0).toUpperCase()
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-extrabold text-ink">{tutorName}</span>
              <span className="block text-[13px] text-ink-muted">{tutorMeta}</span>
            </span>
            <CaretRight size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
          </Link>
        ) : null}

        <div className="lg:hidden">{basics}</div>

        {next ? (
          <div className="flex items-center gap-ds-card rounded-ds-card bg-ink p-ds-card">
            <span className="flex size-[52px] shrink-0 flex-col items-center justify-center gap-[2px] rounded-ds-sm bg-ink-raised text-brand">
              <span className="font-display text-[20px] font-black leading-5 tabular-nums">
                {new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: TZ }).format(next)}
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-[0.8px]">
                {new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: TZ }).format(next)}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-extrabold uppercase tracking-[1.2px] text-brand">
                Next class
              </span>
              <span className="block truncate text-[16px] font-extrabold text-on-ink">
                {`${DAY_LONG[astWeekday(next)]} · ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(next)}`}
              </span>
            </span>
            <Tag tone="warning">{relDays(next).toUpperCase()}</Tag>
          </div>
        ) : null}

        {/* Secure your spot: what is paid now, when the class starts, and what
            happens at the start — before the button, not only in the sheet.
            Only when the student is the one paying (a gated student's parent
            pays, so "Pay today" would be wrong for them). */}
        {preorder && cta.kind === 'secure-spot' ? (
          <SecureSpotTermsV2 preorder={preorder} priceMonthly={group.price_monthly} audience="student" />
        ) : null}

        {group.description ? (
          <section className="flex flex-col gap-ds-2 px-[2px] pt-[2px]">
            <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">About</h2>
            <p
              className={cn(
                'm-0 max-w-[68ch] whitespace-pre-line text-[16px] leading-6 text-ink',
                !aboutOpen && 'line-clamp-3'
              )}
            >
              {group.description}
            </p>
            {group.description.length > 140 ? (
              <button
                type="button"
                onClick={() => setAboutOpen((v) => !v)}
                className="ds-link min-h-[44px] self-start border-0 bg-transparent p-0 text-[15px] font-extrabold text-brand-edge cursor-pointer"
              >
                {aboutOpen ? 'Show less' : 'Read more'}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* lg and up: the decision beside what the student is reading. */}
      <aside className="hidden flex-col gap-ds-3 lg:sticky lg:top-[80px] lg:flex">
        {basics}
        <div className="flex flex-col gap-ds-3 rounded-ds-card bg-surface-card bw-hair border-border p-ds-4">
          <PriceBlock cta={cta} perLabel={perLabel} />
          <Button
            size="lg"
            block="always"
            disabled={cta.disabled}
            variant={cta.kind === 'waitlist' ? 'dark' : 'primary'}
            onClick={() => (cta.kind === 'open' ? router.push(`/student/classes/${group.id}`) : onJoin())}
          >
            {cta.label}
          </Button>
        </div>
      </aside>
    </div>
  );
}

export default StudentClassDetailV2;
