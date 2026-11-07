'use client';

/**
 * A class, as a parent sees it, new UI. Reached from Explore cards, Classes
 * rows and Billing rows.
 *
 * PROVISIONAL VISUALS: no Figma frame for the parent class page. Built from
 * system parts in the order the student join mockup uses (what, who, when,
 * price, then the action).
 *
 * PRESENTATION ONLY. The route keeps every enrolment decision (which endpoint,
 * preorder vs subscribe vs credits, the child checks); this component draws the
 * class and calls `onJoin`. What it fixes from the old view:
 * - The green gradient hero with white text (2.1:1 on brand) is gone. The class
 *   is introduced by its subject tile and an ink title.
 * - "Schedule: None". The schedule is derived from the tutor's recurrence;
 *   when there is nothing to say, the row is left out rather than saying None.
 * - "Join class" when the child is already in it. The OLD view read
 *   `group.enrolled`, which is about the VIEWER — the parent, who is never a
 *   member. This takes the children's own enrolments and says who is in.
 */

import Link from 'next/link';
import { Button, Card, NavRow, SummaryRow, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ClassCover } from './ClassCover';
import type { GroupData, SessionRow } from '@/components/classes/ClassDetailView';
import { formatAstTimeRange } from '@/lib/utils/scheduleFormat';

/** "Sat 7 Nov", in the class's own timezone (AST), per the system's date format. */
const formatAstDate = (d: Date, o: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString('en-GB', { ...o, timeZone: 'America/Port_of_Spain' });

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 2 });
const money = (n: number) => `TT$${TT.format(n)}`;

function time12(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function joinDays(days: number[]): string {
  const names = [...new Set(days)].sort().map((d) => DAY[d]).filter(Boolean);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/** "Mon & Wed · 4:30 PM · 60 min", or null when the class has no schedule. */
export function scheduleLine(group: Pick<GroupData, 'sessions' | 'schedule_display'>): string | null {
  const lines = (group.sessions ?? [])
    .filter((s: SessionRow) => (s.recurrence_days?.length ?? 0) > 0)
    .map((s) => {
      const parts = [joinDays(s.recurrence_days!), time12(s.start_time), s.duration_minutes ? `${s.duration_minutes} min` : null];
      return parts.filter(Boolean).join(' · ');
    });
  if (lines.length) return [...new Set(lines)].join('; ');
  const raw = (group.schedule_display ?? '').trim();
  if (!raw || /^(none|null|tbd|n\/a)$/i.test(raw)) return null;
  return raw.split('\n')[0];
}

function nextSessions(sessions: SessionRow[], n = 3) {
  const now = Date.now();
  const out: { id: string; start: Date; mins: number }[] = [];
  for (const s of sessions ?? []) {
    for (const o of s.occurrences ?? []) {
      if (o.cancelled_at) continue;
      const start = new Date(o.scheduled_start_at);
      const end = new Date(o.scheduled_end_at);
      if (Number.isNaN(start.getTime()) || end.getTime() < now) continue;
      out.push({ id: o.id, start, mins: s.duration_minutes ?? Math.round((end.getTime() - start.getTime()) / 60000) });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, n);
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

export function ParentClassDetailV2({
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
  const schedule = scheduleLine(group);
  const upcoming = nextSessions(group.sessions);
  const seatsLeft =
    group.max_students > 0 ? Math.max(0, group.max_students - (group.member_count ?? 0)) : null;
  const full = seatsLeft === 0;
  const format =
    group.class_format === 'physical' ? 'In person' : group.class_format === 'hybrid' ? 'Online or in person' : 'Online';

  const price = group.price_monthly
    ? { amount: money(group.price_monthly), unit: '/month' }
    : group.price_per_session
      ? { amount: money(group.price_per_session), unit: '/session' }
      : null;

  const inNames = enrolments.filter((e) => e.status === 'in').map((e) => e.childName.split(' ')[0]);
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

  const facts = (
    <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
      {schedule ? <SummaryRow label="When" value={<span className="whitespace-normal">{schedule}</span>} /> : null}
      {price ? (
        <SummaryRow label="Price" value={`${price.amount} ${price.unit}`} />
      ) : (
        <SummaryRow label="Price" value="Free" />
      )}
      {seatsLeft !== null ? (
        <SummaryRow label="Places" value={full ? 'Full · waitlist open' : `${seatsLeft} of ${group.max_students} left`} />
      ) : null}
      {group.venue ? (
        <SummaryRow
          label="Where"
          value={[group.venue.name, group.venue.region?.name].filter(Boolean).join(' · ')}
        />
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
          You choose the child next. Nothing is charged until you pay.
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
        !pane && 'lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-ds-6 lg:gap-y-ds-4'
      )}
    >
      <div className={cn('flex flex-col gap-ds-4', !pane && 'lg:col-start-1')}>
        <ClassCover
          image={group.cover_image}
          subject={label}
          className={cn('rounded-ds-card', pane ? 'h-[140px]' : 'h-[132px] md:h-[200px] lg:h-[240px]')}
        />
        <div className="flex min-w-0 flex-col gap-ds-2">
          <h1 className="ds-page-title">{group.name}</h1>
          <div className="flex flex-wrap gap-ds-2">
            {group.form_level ? <Tag tone="outline">{group.form_level}</Tag> : null}
            <Tag tone="outline">{format}</Tag>
            {group.average_rating ? <Tag tone="outline">★ {group.average_rating.toFixed(1)}</Tag> : null}
          </div>
        </div>
      </div>

      {anyEnrolled ? (
        <div className={cn(!pane && 'lg:col-start-1')}>
          <Card
            tone="feature"
            eyebrow={inNames.length ? 'Enrolled' : 'Waiting for the tutor'}
            title={
              inNames.length
                ? `${inNames.join(' and ')} ${inNames.length === 1 ? 'is' : 'are'} in this class`
                : `Request sent for ${waitingNames.join(' and ')}`
            }
            body={
              inNames.length && waitingNames.length
                ? `Request sent for ${waitingNames.join(' and ')}.`
                : inNames.length
                  ? upcoming[0]
                    ? `Next · ${formatAstDate(upcoming[0].start, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatAstTimeRange(upcoming[0].start, upcoming[0].mins)}`
                    : 'You get their attendance and any feedback the tutor writes.'
                  : 'The tutor approves who joins. You will hear when they answer.'
            }
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
            <p className="font-display text-[32px] font-extrabold leading-none tabular-nums text-ink">
              {price.amount}
              <span className="font-body text-[15px] font-normal text-ink-muted"> {price.unit}</span>
            </p>
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
