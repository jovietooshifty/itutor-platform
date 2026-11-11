'use client';

/**
 * A class, as a parent sees it, new UI. Reached from Explore cards, Classes
 * rows and Billing rows.
 *
 * TWO STATES:
 * - Enrolled (a child of this parent is in the class): Figma "Class page –
 *   enrolled", `160:6571`. Eyebrow, title, tutor row, schedule card, about,
 *   the dark "Next class" card, the verified-tutor card, the price and the
 *   "<child> is enrolled" pill.
 * - Not enrolled: PROVISIONAL VISUALS. No Figma frame for the parent class
 *   page before joining. Built from system parts in the order the student join
 *   mockup uses (what, who, when, price, then the action).
 * Both lg-up two-column layouts are PROVISIONAL: no wide frame.
 *
 * PRESENTATION ONLY. The route keeps every enrolment decision (which endpoint,
 * preorder vs subscribe vs credits, the child checks); this component draws the
 * class and calls `onJoin`. What it fixes from the old view:
 * - The green gradient hero with white text (2.1:1 on brand) is gone. The class
 *   is introduced by its subject colour and an ink title.
 * - "Schedule: None". The schedule is derived from the tutor's recurrence;
 *   when there is nothing to say, the row is left out rather than saying None.
 * - "Join class" when the child is already in it. The OLD view read
 *   `group.enrolled`, which is about the VIEWER — the parent, who is never a
 *   member. This takes the children's own enrolments and says who is in.
 * - The price said TT$120/month and "Nothing is charged until you pay", then
 *   checkout added a processing fee. The fee and the total are now on the
 *   price card, from the same gross-up the checkout charges.
 */

import Link from 'next/link';
import { Check, ShieldCheck } from '@phosphor-icons/react';
import { Button, Card, NavRow, SummaryRow, Tag } from '@/components/ui';
import { DsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { ClassCover } from './ClassCover';
import type { GroupData, SessionRow } from '@/components/classes/ClassDetailView';
import { formatAstTimeRange } from '@/lib/utils/scheduleFormat';
import { formatLevelShort } from '@/lib/utils/formatLevel';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';

/** "Sat 7 Nov", in the class's own timezone (AST), per the system's date format. */
export const formatAstDate = (d: Date, o: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString('en-GB', { ...o, timeZone: 'America/Port_of_Spain' });

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TT = new Intl.NumberFormat('en-TT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const TT2 = new Intl.NumberFormat('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Whole dollars stay whole ("TT$120"); anything with cents shows both places ("TT$126.99"). */
export const money = (n: number) => `TT$${Number.isInteger(n) ? TT.format(n) : TT2.format(n)}`;

function parseHhmm(hhmm: string | null): [number, number] | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return [h, m || 0];
}

function clock(h: number, m: number, withPeriod = true): string {
  const hr = ((h + 11) % 12) + 1;
  const s = `${hr}:${String(m).padStart(2, '0')}`;
  return withPeriod ? `${s} ${h % 24 < 12 ? 'AM' : 'PM'}` : s;
}

function time12(hhmm: string | null): string | null {
  const t = parseHhmm(hhmm);
  return t ? clock(t[0], t[1]) : null;
}

/** "6:00–7:30 PM AST", or "11:00 AM–12:30 PM AST" when the period changes. */
function timeRange(hhmm: string | null, mins: number | null): string | null {
  const t = parseHhmm(hhmm);
  if (!t) return null;
  if (!mins) return `${clock(t[0], t[1])} AST`;
  const endTotal = t[0] * 60 + t[1] + mins;
  const eh = Math.floor(endTotal / 60) % 24;
  const em = endTotal % 60;
  const samePeriod = t[0] % 24 < 12 === eh < 12;
  return `${clock(t[0], t[1], !samePeriod)}–${clock(eh, em)} AST`;
}

function joinDays(days: number[]): string {
  const names = [...new Set(days)].sort().map((d) => DAY[d]).filter(Boolean);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

type Occurrence = NonNullable<SessionRow['occurrences']>[number];

function isUpcoming(o: Occurrence, now: number) {
  if (o.cancelled_at) return false;
  const end = new Date(o.scheduled_end_at).getTime();
  return Number.isFinite(end) && end >= now;
}

/**
 * The recurring series that will actually happen.
 *
 * A series can exist with no generated occurrences: staging's "n" (FORM_4)
 * has a Mon & Wed series with zero occurrence rows beside a Thu series with
 * 77, so "When" promised Mon & Wed while "Coming up" listed only Thursdays.
 * When ANY series has occurrences loaded, only series with an upcoming one
 * are described, so the two cannot disagree. When none do (occurrences not
 * generated yet, or a caller whose payload carries none), the recurrence is
 * the only description there is, and every series is used.
 */
function liveSeries(sessions: SessionRow[] | null | undefined): SessionRow[] {
  const recurring = (sessions ?? []).filter((s) => (s.recurrence_days?.length ?? 0) > 0);
  const anyLoaded = recurring.some((s) => (s.occurrences?.length ?? 0) > 0);
  if (!anyLoaded) return recurring;
  const now = Date.now();
  return recurring.filter((s) => (s.occurrences ?? []).some((o) => isUpcoming(o, now)));
}

/** One entry per series: { days: "Mon & Wed", time: "4:00–6:00 PM AST" }. */
export function schedulePatterns(
  group: Pick<GroupData, 'sessions'>
): Array<{ days: string; time: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ days: string; time: string | null }> = [];
  for (const s of liveSeries(group.sessions)) {
    const p = { days: joinDays(s.recurrence_days!), time: timeRange(s.start_time, s.duration_minutes) };
    const key = `${p.days}|${p.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** "Mon & Wed · 4:30 PM · 60 min", or null when the class has no schedule. */
export function scheduleLine(group: Pick<GroupData, 'sessions' | 'schedule_display'>): string | null {
  const lines = liveSeries(group.sessions).map((s) => {
    const parts = [joinDays(s.recurrence_days!), time12(s.start_time), s.duration_minutes ? `${s.duration_minutes} min` : null];
    return parts.filter(Boolean).join(' · ');
  });
  if (lines.length) return [...new Set(lines)].join('; ');
  const raw = (group.schedule_display ?? '').trim();
  if (!raw || /^(none|null|tbd|n\/a)$/i.test(raw)) return null;
  return raw.split('\n')[0];
}

export function nextSessions(sessions: SessionRow[] | null | undefined, n = 3) {
  const now = Date.now();
  const out: { id: string; start: Date; mins: number }[] = [];
  for (const s of sessions ?? []) {
    for (const o of s.occurrences ?? []) {
      if (!isUpcoming(o, now)) continue;
      const start = new Date(o.scheduled_start_at);
      const end = new Date(o.scheduled_end_at);
      if (Number.isNaN(start.getTime())) continue;
      out.push({ id: o.id, start, mins: s.duration_minutes ?? Math.round((end.getTime() - start.getTime()) / 60000) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, n);
}

/** "today", "tomorrow", "in 5 days", counted in AST calendar days. */
function relativeDay(d: Date): string {
  const key = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'America/Port_of_Spain' });
  const days = Math.round((Date.parse(key(d)) - Date.parse(key(new Date()))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * What a month of this class costs at checkout: the same gross-up the
 * subscribe and secure-spot checkouts charge (both bill `price_monthly`
 * through Stripe), so the class page and the checkout cannot disagree.
 * Null for a class with no monthly price: a per-session-only price is not
 * what those checkouts bill, so no total is promised for it. A promotion or
 * credits can still lower the checkout figure.
 */
export function monthlyCharge(priceMonthly: number | null | undefined) {
  const base = Number(priceMonthly ?? 0);
  if (!(base > 0)) return null;
  const { processingFee, grossAmount } = calculateGrossAmountForProvider(base, 'stripe');
  return { base, fee: processingFee, total: grossAmount };
}

function initialsOf(name: string): string {
  const parts = name.replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p.charAt(0)).join('') || '?').toUpperCase();
}

/**
 * Label above, value below, so a long value wraps inside the card. SummaryRow
 * keeps its value on one unshrinkable line beside the label, which is right
 * for a price and wrong for "Mon & Wed · 4:00 PM · 120 min; Thu · …".
 */
function StackRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[2px] py-[5px]">
      <span className="text-[14px] leading-[20px] text-ink-muted">{label}</span>
      <span className="min-w-0 break-words text-[14px] font-extrabold leading-[20px] text-ink">{children}</span>
    </div>
  );
}

export interface ChildEnrolment {
  childId: string;
  childName: string;
  status: 'in' | 'pending';
}

export interface ParentClassDetailV2Props {
  group: GroupData;
  /** This class's enrolments among the parent's own children. */
  enrolments: ChildEnrolment[];
  /** Whether any linked child is not yet in or waiting on this class. */
  canAddChild: boolean;
  hasChildren: boolean;
  isPaid: boolean;
  isPreorder: boolean;
  onJoin: () => void;
  /**
   * 'page' (default): the class's own page, two columns from lg up.
   * 'pane': the read-only preview beside the Classes list — one column, no
   * join action (that list only shows classes a child is already in).
   */
  layout?: 'page' | 'pane';
}

export function ParentClassDetailV2(props: ParentClassDetailV2Props) {
  if (props.enrolments.some((e) => e.status === 'in')) return <EnrolledView {...props} />;
  return <BrowseView {...props} />;
}

/* ─── enrolled: Figma 160:6571 ───────────────────────────── */

function EnrolledView({ group, enrolments, canAddChild, onJoin, layout = 'page' }: ParentClassDetailV2Props) {
  const pane = layout === 'pane';
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const patterns = schedulePatterns(group);
  const next = nextSessions(group.sessions, 1)[0] ?? null;
  const charge = monthlyCharge(group.price_monthly);
  const level = formatLevelShort(group.form_level);
  const inFirst = enrolments.filter((e) => e.status === 'in').map((e) => e.childName.split(' ')[0]);
  const waitingFirst = enrolments.filter((e) => e.status === 'pending').map((e) => e.childName.split(' ')[0]);
  const eyebrow = [group.subject, level, 'Group class'].filter(Boolean).join(' · ');

  const tutorRow = group.tutor ? (
    <Link
      href={`/parent/tutors/${group.tutor.id}`}
      className="ds-press flex items-center gap-ds-3 self-stretch rounded-ds-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
    >
      <span className="flex h-[44px] w-[44px] flex-none items-center justify-center overflow-hidden rounded-[12px] bg-ink font-display text-[14px] font-extrabold text-brand">
        {group.tutor.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.tutor.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(tutorName)
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="font-body text-[15px] font-extrabold leading-[18px] text-ink">by {tutorName}</span>
        <span className="font-body text-[13px] font-extrabold text-brand-edge">View profile</span>
      </span>
      <DsIcon name="chevron" size={20} className="flex-none text-ink" />
    </Link>
  ) : null;

  const scheduleCard =
    patterns.length > 0 ? (
      <div className="rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-[9px]">
        <div className="flex items-start justify-between gap-ds-3 py-[5px]">
          <span className="text-[14px] text-ink-muted">Schedule</span>
          <span className="flex min-w-0 flex-col items-end gap-ds-2 text-right text-[14px] font-extrabold text-ink">
            {patterns.map((p) => (
              <span key={`${p.days}|${p.time}`} className="flex flex-col items-end">
                {p.time ? <span>{p.time}</span> : null}
                <span>{p.days}</span>
              </span>
            ))}
          </span>
        </div>
      </div>
    ) : null;

  const nextCard = next ? (
    <div className="flex flex-col rounded-ds-card bw-hair border-ink bg-ink p-ds-card">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.99px] text-brand">Next class</span>
      <span className="pt-1 text-[18px] font-extrabold text-on-ink">
        {formatAstDate(next.start, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
        {next.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Port_of_Spain' })}
      </span>
      <span className="text-[13px] text-on-ink-muted">{relativeDay(next.start)}</span>
    </div>
  ) : null;

  const verifiedCard = group.tutor?.verified ? (
    <div className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[6px] bg-brand text-ink">
        <ShieldCheck size={16} weight="bold" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[15px] font-extrabold leading-[18px] text-ink">{tutorName}</span>
        <span className="text-[13px] text-ink-muted">Verified by iTutor</span>
      </span>
      <Link href={`/parent/tutors/${group.tutor.id}`} className="ds-link flex-none text-[14px] font-extrabold text-brand-edge">
        More info
      </Link>
    </div>
  ) : null;

  const priceBlock = charge ? (
    <div className="flex flex-col gap-[2px]">
      <p className="font-display text-[28px] font-extrabold leading-[28px] tabular-nums text-ink">
        {money(charge.base)}
        <span className="pl-ds-2 font-body text-[14px] font-normal text-ink-muted">/month</span>
      </p>
      <p className="text-[13px] text-ink-muted">
        You approve and pay · {money(charge.total)} a month with {money(charge.fee)} card processing
      </p>
    </div>
  ) : null;

  const enrolledPill = (
    <div className="flex flex-col gap-ds-2">
      <div className="flex min-h-[48px] items-center justify-center gap-ds-2 rounded-ds-btn bw-bold border-brand-legacy bg-surface-card px-ds-4 py-ds-2 text-center text-[15px] font-extrabold text-brand-legacy">
        <Check size={22} weight="bold" className="flex-none" />
        {inFirst.join(' and ')} {inFirst.length === 1 ? 'is' : 'are'} enrolled
      </div>
      {waitingFirst.length ? (
        <p className="text-center text-[13px] text-ink-muted">
          Request sent for {waitingFirst.join(' and ')}. The tutor approves who joins.
        </p>
      ) : null}
      {/* Not in the frame, which has one child. A parent with another child
          not yet in the class still needs a way to add them. */}
      {!pane && canAddChild ? (
        <button
          type="button"
          onClick={onJoin}
          className="ds-link self-center border-0 bg-transparent p-0 font-display text-[15px] font-extrabold text-ink underline underline-offset-4 cursor-pointer"
        >
          Add another child
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-ds-4',
        !pane && 'lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-ds-8'
      )}
    >
      <div className="flex min-w-0 flex-col gap-ds-4">
        <div className="flex flex-col gap-ds-3">
          {eyebrow ? (
            <p className="text-[11px] font-extrabold uppercase tracking-[0.99px] text-ink-muted">{eyebrow}</p>
          ) : null}
          <h1 className="ds-page-title">{group.name}</h1>
        </div>
        {tutorRow}
        {scheduleCard}
        {group.description ? (
          <p className="max-w-[68ch] whitespace-pre-line font-body text-[14px] leading-[20.3px] text-ink">{group.description}</p>
        ) : null}
        {nextCard}
        <div className={cn('flex flex-col gap-ds-4', !pane && 'lg:hidden')}>
          {verifiedCard}
          {priceBlock}
          {enrolledPill}
        </div>
      </div>
      {!pane ? (
        <aside className="hidden flex-col gap-ds-4 lg:sticky lg:top-[80px] lg:flex">
          {priceBlock}
          {enrolledPill}
          {verifiedCard}
        </aside>
      ) : null}
    </div>
  );
}

/* ─── not enrolled: PROVISIONAL ──────────────────────────── */

function BrowseView({
  group,
  enrolments,
  canAddChild,
  hasChildren,
  isPaid,
  isPreorder,
  onJoin,
  layout = 'page',
}: ParentClassDetailV2Props) {
  const label = group.subject || group.name;
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const patterns = schedulePatterns(group);
  const fallbackWhen = patterns.length ? null : scheduleLine(group);
  const upcoming = nextSessions(group.sessions);
  const seatsLeft =
    group.max_students > 0 ? Math.max(0, group.max_students - (group.member_count ?? 0)) : null;
  const full = seatsLeft === 0;
  const format =
    group.class_format === 'physical' ? 'In person' : group.class_format === 'hybrid' ? 'Online or in person' : 'Online';
  const level = formatLevelShort(group.form_level);

  const charge = monthlyCharge(group.price_monthly);
  const price = charge
    ? { amount: money(charge.base), unit: '/month' }
    : group.price_per_session
      ? { amount: money(group.price_per_session), unit: '/session' }
      : null;

  // Only pending children reach this view; any child who is IN gets EnrolledView.
  const waitingNames = enrolments.filter((e) => e.status === 'pending').map((e) => e.childName.split(' ')[0]);
  const anyEnrolled = enrolments.length > 0;

  const joinLabel = isPaid
    ? anyEnrolled
      ? 'Add another child'
      : isPreorder
        ? 'Secure a spot'
        : 'Choose a child and pay'
    : group.require_join_requests
      ? anyEnrolled
        ? 'Request for another child'
        : 'Request a place'
      : anyEnrolled
        ? 'Add another child'
        : 'Join class';

  const pane = layout === 'pane';

  const feeLine = charge
    ? `+ ${money(charge.fee)} card processing · ${money(charge.total)} ${isPreorder ? 'for the first month' : 'a month'} in total`
    : null;

  const facts = (
    <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
      {patterns.length ? (
        <StackRow label="When">
          {patterns.map((p) => (
            <span key={`${p.days}|${p.time}`} className="block">
              {[p.days, p.time].filter(Boolean).join(' · ')}
            </span>
          ))}
        </StackRow>
      ) : fallbackWhen ? (
        <StackRow label="When">{fallbackWhen}</StackRow>
      ) : null}
      {price ? (
        <SummaryRow label="Price" value={`${price.amount} ${price.unit}`} />
      ) : (
        <SummaryRow label="Price" value="Free" />
      )}
      {charge ? (
        <SummaryRow label={`With ${money(charge.fee)} card processing`} value={`${money(charge.total)} /month`} />
      ) : null}
      {seatsLeft !== null ? (
        <SummaryRow label="Places" value={full ? 'Full · waitlist open' : `${seatsLeft} of ${group.max_students} left`} />
      ) : null}
      {group.venue ? (
        <StackRow label="Where">{[group.venue.name, group.venue.region?.name].filter(Boolean).join(' · ')}</StackRow>
      ) : null}
      {group.require_join_requests ? <SummaryRow label="Joining" value="The tutor approves each place" /> : null}
    </div>
  );

  const tutorRow = group.tutor ? (
    <NavRow
      href={`/parent/tutors/${group.tutor.id}`}
      tile={
        <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-surface-sunken font-display text-[15px] font-extrabold text-ink">
          {group.tutor.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.tutor.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            tutorName.charAt(0).toUpperCase()
          )}
        </span>
      }
      title={tutorName}
      meta={group.tutor.verified ? 'Verified tutor · See profile' : 'See profile'}
    />
  ) : null;

  const linkChild = (
    <Card
      tone="outlined"
      title="Link a child first"
      body="Classes are booked for a child on their own account. Link one and you can enrol them here."
    >
      <div className="pt-ds-3">
        <Link href="/parent/children" className="ds-link font-display text-[15px] font-extrabold text-ink underline underline-offset-4">
          Link a child
        </Link>
      </div>
    </Card>
  );

  const joinButton = (always: boolean) => (
    <>
      <Button block={always ? 'always' : true} size="lg" onClick={onJoin}>
        {full && !isPreorder ? 'Join the waitlist' : joinLabel}
      </Button>
      {isPaid ? (
        <p className="pt-ds-2 text-center font-body text-[13px] text-ink-muted">
          {charge
            ? `You choose the child next, then pay ${money(charge.total)} by card. Nothing is charged before that.`
            : 'You choose the child next. Nothing is charged until you pay.'}
        </p>
      ) : null}
    </>
  );

  // Phone (and the Classes preview pane): one column in the order the join
  // mockup uses. From lg up on the class's own page: the story on the left,
  // and what it costs, who teaches it and the button in a sticky panel on the
  // right, so the decision is always beside what the parent is reading.
  // PROVISIONAL: no wide frame.
  return (
    <div
      className={cn(
        'flex flex-col gap-ds-4',
        !pane && 'lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-ds-8 lg:gap-y-ds-4'
      )}
    >
      <div className={cn('flex flex-col gap-ds-4', !pane && 'lg:col-start-1')}>
        {/* The subject colour block, as on its Explore card: the frames never
            draw a tutor's upload, and opening a card should read as that card
            growing. */}
        <ClassCover
          subject={label}
          className={cn('rounded-ds-card', pane ? 'h-[140px]' : 'h-[132px] md:h-[200px] lg:h-[240px]')}
        />
        <div className="flex min-w-0 flex-col gap-ds-2">
          <h1 className="ds-page-title">{group.name}</h1>
          <div className="flex flex-wrap gap-ds-2">
            {level ? <Tag tone="outline">{level}</Tag> : null}
            <Tag tone="outline">{format}</Tag>
            {group.average_rating ? <Tag tone="outline">★ {group.average_rating.toFixed(1)}</Tag> : null}
          </div>
        </div>
      </div>

      {waitingNames.length ? (
        <div className={cn(!pane && 'lg:col-start-1')}>
          <Card
            tone="feature"
            eyebrow="Waiting for the tutor"
            title={`Request sent for ${waitingNames.join(' and ')}`}
            body="The tutor approves who joins. You will hear when they answer."
          />
        </div>
      ) : null}

      {/* Phone order: facts and tutor straight after the title. */}
      <div className={cn('flex flex-col gap-ds-4', !pane && 'lg:hidden')}>
        {facts}
        {tutorRow}
      </div>

      {/* The side panel, lg up on the full page only. */}
      {!pane ? (
        <aside className="hidden flex-col gap-ds-3 lg:sticky lg:top-[80px] lg:col-start-2 lg:row-span-6 lg:row-start-1 lg:flex">
          {price ? (
            <div className="flex flex-col gap-ds-1">
              <p className="font-display text-[32px] font-extrabold leading-none tabular-nums text-ink">
                {price.amount}
                <span className="font-body text-[15px] font-normal text-ink-muted"> {price.unit}</span>
              </p>
              {feeLine ? <p className="font-body text-[13px] text-ink-muted">{feeLine}</p> : null}
            </div>
          ) : null}
          {facts}
          {!hasChildren ? linkChild : canAddChild ? <div>{joinButton(true)}</div> : null}
          {tutorRow}
        </aside>
      ) : null}

      {group.description ? (
        <section className={cn('flex flex-col gap-ds-2', !pane && 'lg:col-start-1')}>
          <h2 className="font-display text-[18px] font-extrabold text-ink">About this class</h2>
          <p className="max-w-[68ch] whitespace-pre-line font-body text-[15px] leading-[22px] text-ink">{group.description}</p>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className={cn('flex flex-col gap-ds-2', !pane && 'lg:col-start-1')}>
          <h2 className="font-display text-[18px] font-extrabold text-ink">Coming up</h2>
          <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
            {upcoming.map((u) => (
              <SummaryRow
                key={u.id}
                label={formatAstDate(u.start, { weekday: 'short', day: 'numeric', month: 'short' })}
                value={formatAstTimeRange(u.start, u.mins)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {pane ? null : !hasChildren ? (
        <div className="lg:hidden">{linkChild}</div>
      ) : canAddChild ? (
        <div className="sticky bottom-0 -mx-ds-4 bw-t-hair border-line-soft bg-surface-page px-ds-4 pb-ds-4 pt-ds-3 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 lg:hidden">
          {joinButton(false)}
        </div>
      ) : null}
    </div>
  );
}

export default ParentClassDetailV2;
