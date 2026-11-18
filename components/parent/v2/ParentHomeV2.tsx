'use client';

/**
 * Parent Home, new UI — Figma `160:1828` (needs action), `160:2057` (all paid),
 * `160:2208` (new parent, no classes).
 *
 * SAME DATA AS THE OLD DASHBOARD, NEW LOOK. SCREEN_MAP marks all three frames
 * RESKIN, so every number here comes from an endpoint that already existed:
 *
 *   /api/parent/attention  the two action cards. It already returns exactly the
 *                          three kinds the frames draw — a failed payment, a
 *                          join request, and tutor feedback — with the title,
 *                          detail, href and button label each one needs.
 *   /api/parent/dashboard  `upcomingSessions[0]` is the "Up next" feature card.
 *   /api/parent/billing    `subscriptions[]` gives Payments by child and the
 *                          class list, already scoped to this parent's children.
 *
 * WHAT IS NOT HERE. The frames carry a "Popular classes" section. That is
 * marketplace data, and SCREEN_MAP's logic row 3 says parent Explore reuses
 * ExploreMarketplace rather than opening a second data path to the same
 * groups. Wiring a thinner second read here is the exact thing that row
 * forbids, so the section lands with Explore in the logic half of this flow.
 *
 * THE FOURTH STATE. Arjun drew three; there are four. A parent with no child
 * linked at all cannot "find a class for" anyone, so that case keeps its own
 * empty state pointing at /parent/children. Without it the screen would
 * address a child who does not exist.
 */

import { useCallback, useEffect, useState } from 'react';
import { withRequest } from '@/components/parent/v2/attention';
import { useRouter } from 'next/navigation';
import { Check } from '@phosphor-icons/react';
import {
  Button,
  Card,
  ClassRow,
  IconNote,
  SectionHeader,
  StepList,
  SummaryRow,
  Tag,
} from '@/components/ui';
import { subjectCode, subjectColor } from './subjectTile';

type AttentionItem = {
  kind: 'approval' | 'payment' | 'feedback';
  id: string;
  childName: string | null;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  closesAt?: string | null;
};

type UpcomingSession = {
  id: string;
  childName: string;
  tutorName: string;
  subjectName: string;
  scheduledStartAt: string;
};

/** One occurrence from /api/parent/calendar: a group class or a 1:1 session. */
type CalendarEvent = {
  key: string;
  childId: string;
  title: string;
  tutorName: string | null;
  start: string;
  type: '1:1' | 'group';
  past: boolean;
};
type CalendarChild = { id: string; name: string; color: string };

type Subscription = {
  /** The CLASS id. /parent/classes/[groupId] is keyed on the group. */
  groupId: string | null;
  id: string;
  childId: string;
  childName: string;
  className: string;
  tutorName: string | null;
  status: string;
  amount: number;
  nextCharge: string | null;
  cancelled: boolean;
  paused: boolean;
};

/** One row of /api/parent/children/classes: a class a child is in. */
type ChildClass = {
  childId: string;
  childName: string;
  groupId: string;
  className: string;
  tutorName: string | null;
  priceMonthly: number;
  billed: boolean;
};

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 0 });
const money = (n: number) => `TT$${TT.format(Math.round(n))}`;

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-TT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Port_of_Spain',
  });
  const time = d.toLocaleTimeString('en-TT', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Port_of_Spain',
  });
  return `${date} · ${time}`;
}

const AST = 'America/Port_of_Spain';
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: AST });
}
function dayLabel(iso: string): string {
  if (isToday(iso)) return 'Today';
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  if (dayKey(iso) === dayKey(tomorrow)) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: AST });
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: AST });
}

function isToday(iso: string): boolean {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-CA', { timeZone: 'America/Port_of_Spain' });
  return fmt(new Date(iso)) === fmt(new Date());
}

export default function ParentHomeV2({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [hasChildren, setHasChildren] = useState(false);
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarChildren, setCalendarChildren] = useState<CalendarChild[]>([]);
  /** Null when the feed failed: the class list then falls back to billing. */
  const [childClasses, setChildClasses] = useState<ChildClass[] | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [attentionRes, dashRes, billingRes, calendar, classesFeed] = await Promise.all([
        fetch('/api/parent/attention', { cache: 'no-store' }),
        fetch('/api/parent/dashboard', { cache: 'no-store' }),
        fetch('/api/parent/billing', { cache: 'no-store' }),
        // Not fatal: without it Up next falls back to the dashboard's 1:1
        // sessions and This week says nothing is scheduled.
        fetch('/api/parent/calendar', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        // Every class each child is in, free ones included — the same rule the
        // child page and Classes count with. Billing alone cannot see a free
        // class. Not fatal either.
        fetch('/api/parent/children/classes', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      // The three carry different halves of the screen; if any fails the page
      // would be quietly wrong rather than visibly broken, so treat it as an
      // error and offer a retry.
      if (!attentionRes.ok || !dashRes.ok || !billingRes.ok) throw new Error('load failed');

      const attention = await attentionRes.json();
      const dash = await dashRes.json();
      const billing = await billingRes.json();

      setItems(attention.items ?? []);
      setHasChildren(Boolean(attention.hasChildren));
      setSessions(dash?.dashboard?.upcomingSessions ?? []);
      setSubs(billing.subscriptions ?? []);
      setEvents(calendar?.events ?? []);
      setCalendarChildren(calendar?.children ?? []);
      setChildClasses(classesFeed ? ((classesFeed.classes ?? []) as ChildClass[]) : null);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === 'loading') {
    return (
      <div className="flex w-full max-w-[720px] flex-col gap-ds-card" aria-busy>
        <div className="h-[30px] w-1/2 animate-pulse rounded-ds-sm bg-surface-sunken" />
        <div className="h-[150px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[170px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[90px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex w-full max-w-[720px] flex-col gap-ds-card">
        <h1 className="ds-page-title">
          Something went wrong
        </h1>
        <Card
          title="We could not load your week"
          body="This is usually temporary. Try again, and if it keeps happening your classes are still safe — nothing has changed."
        >
          <Button variant="primary" block onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  // No child linked at all — the state the Figma frames do not cover.
  if (!hasChildren) {
    return (
      <div className="flex w-full max-w-[720px] flex-col gap-ds-card">
        <h1 className="ds-page-title">
          Welcome, {firstName}
        </h1>
        <Card
          title="Link your child to get started"
          body="We email them a secure link. They appear here once they accept — you cannot add a child without their agreement."
        >
          <Button variant="primary" size="lg" block onClick={() => router.push('/parent/children')}>
            Invite a child
          </Button>
        </Card>
      </div>
    );
  }

  // A cancelled enrolment keeps its row in the billing payload so the history
  // survives; it must not be counted in a monthly total or listed as a class.
  //
  // COMPLETED is excluded too, matching Classes' Upcoming/Past split. Before,
  // a class that had run its course was still listed here and its price was
  // still added to the monthly total — the "3" QA saw beside Classes' "2".
  const active = subs.filter((s) => !s.cancelled && s.status !== 'COMPLETED' && s.status !== 'CANCELLED');
  const classesKnown = childClasses !== null;
  const currentClasses = childClasses ?? [];
  const childNames = Array.from(
    new Set([...subs.map((s) => s.childName), ...currentClasses.map((c) => c.childName)])
  );
  const payingChildNames = Array.from(new Set(active.map((s) => s.childName)));
  const headlineChild = childNames.length === 1 ? childNames[0].split(' ')[0] : null;

  // New parent: a child is linked but has no classes yet — frame 160:2208.
  // A child in a FREE class has no billing row, so billing alone is not enough
  // to say "no classes yet".
  if (subs.length === 0 && currentClasses.length === 0) {
    return (
      <div className="flex w-full max-w-[720px] flex-col gap-ds-card">
        <h1 className="ds-page-title">
          Find a class{headlineChild ? ` for ${headlineChild}` : ''}
        </h1>

        <Button variant="primary" size="lg" block onClick={() => router.push('/parent/classes')}>
          Explore classes
        </Button>

        <SectionHeader title="How it works" />
        <StepList
          steps={[
            { title: 'Pick a class', detail: 'Browse verified teachers and subjects.' },
            {
              title: 'Approve and pay',
              detail: headlineChild
                ? `${headlineChild} asks, you approve and pay.`
                : 'Your child asks, you approve and pay.',
            },
            {
              title: headlineChild ? `${headlineChild} joins` : 'They join',
              detail: headlineChild
                ? `Classes appear in ${headlineChild}'s week.`
                : 'Classes appear here once they join.',
            },
          ]}
        />
      </div>
    );
  }

  // Up next and This week read the calendar feed, which carries group-class
  // occurrences as well as 1:1 sessions. The dashboard's upcomingSessions is
  // 1:1 only, so a parent whose child is in group classes never saw "Up next";
  // it is kept as the fallback for when the calendar fails to load.
  const now = Date.now();
  const weekEnd = now + 7 * 86_400_000;
  const upcomingEvents = events
    .filter((e) => !e.past && new Date(e.start).getTime() >= now - 60 * 60_000)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const childById = new Map(calendarChildren.map((c) => [c.id, c]));
  const nextEvent = upcomingEvents[0] ?? null;
  const nextSession = nextEvent ? null : sessions[0] ?? null;
  const thisWeek = upcomingEvents.filter((e) => new Date(e.start).getTime() <= weekEnd);
  const days: { key: string; label: string; items: CalendarEvent[] }[] = [];
  for (const e of thisWeek) {
    const key = dayKey(e.start);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(e);
    else days.push({ key, label: dayLabel(e.start), items: [e] });
  }

  const monthly = active.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const nextCharge = active.map((s) => s.nextCharge).filter(Boolean)[0] ?? null;

  // The class list is every class each child is IN (free ones included), from
  // /api/parent/children/classes — the count the child page and Classes ›
  // Upcoming show. The price comes from the live subscription where there is
  // one. If that feed failed, fall back to the billed classes alone.
  const billedAmount = new Map(active.map((s) => [`${s.childId}:${s.groupId}`, s.amount]));
  const classRows: Array<{
    key: string;
    groupId: string | null;
    className: string;
    tutorName: string | null;
    childName: string;
    amount: number;
  }> = classesKnown
    ? currentClasses.map((c) => ({
        key: `${c.childId}:${c.groupId}`,
        groupId: c.groupId,
        className: c.className,
        tutorName: c.tutorName,
        childName: c.childName,
        amount: billedAmount.get(`${c.childId}:${c.groupId}`) ?? 0,
      }))
    : active.map((s) => ({
        key: s.id,
        groupId: s.groupId,
        className: s.className,
        tutorName: s.tutorName,
        childName: s.childName,
        amount: s.amount,
      }));

  const classList =
    classRows.length > 0 ? (
      <>
        <SectionHeader
          title={headlineChild ? `Classes for ${headlineChild}` : 'Classes'}
          action="See all"
          onAction={() => router.push('/parent/my-classes')}
        />
        {classRows.map((s) => (
          <ClassRow
            key={s.key}
            code={subjectCode(s.className)}
            color={subjectColor(s.className)}
            title={s.className}
            meta={[s.tutorName, childNames.length > 1 ? s.childName.split(' ')[0] : null]
              .filter(Boolean)
              .join(' · ')}
            price={s.amount > 0 ? money(s.amount) : 'Free'}
            onClick={() => router.push(s.groupId ? `/parent/classes/${s.groupId}` : '/parent/my-classes')}
          />
        ))}
      </>
    ) : null;

  // An action card on a phone; from lg up a full-width banner with its button
  // on the right. The Card's three text rows fill column 1 and the button is
  // pinned to column 2 across them. PROVISIONAL: no wide frame.
  const banner = 'lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-ds-6 lg:gap-y-[2px]';
  const bannerAction = 'lg:col-start-2 lg:row-span-3 lg:row-start-1';

  return (
    <div className="flex flex-col gap-ds-card lg:gap-ds-5">
      <h1 className="ds-page-title">
        {headlineChild ? `${headlineChild}'s week` : 'Your week'}
      </h1>

      {/* Needs-action cards. Order is the API's: approvals first, because they
          are the only items with a deadline. Full width from lg up: the one
          thing on the page that needs a decision should not share a column. */}
      {items.length > 0 ? (
        <div className="flex flex-col gap-ds-card">
          {items.map((item) => {
            if (item.kind === 'payment') {
              return (
                <Card
                  key={`${item.kind}:${item.id}`}
                  tone="alert"
                  tag={<Tag tone="danger">Needs action</Tag>}
                  title={item.title}
                  body={item.detail}
                  className={banner}
                >
                  <div className={bannerAction}>
                    <Button variant="danger" size="sm" block onClick={() => router.push(withRequest(item))}>
                      {item.actionLabel}
                    </Button>
                  </div>
                </Card>
              );
            }
            if (item.kind === 'approval') {
              return (
                <Card
                  key={`${item.kind}:${item.id}`}
                  tag={
                    <Tag tone="outline">
                      {item.childName ? `${item.childName.split(' ')[0]} asks to join` : 'Asks to join'}
                    </Tag>
                  }
                  title={item.title}
                  body={
                    item.closesAt
                      ? `${item.detail} · No place is held. Closes ${item.closesAt}.`
                      : `${item.detail} · No place is held while you decide.`
                  }
                  className={banner}
                >
                  <div className={bannerAction}>
                    <Button variant="primary" block onClick={() => router.push(withRequest(item))}>
                      {item.actionLabel}
                    </Button>
                  </div>
                </Card>
              );
            }
            return (
              <Card
                key={`${item.kind}:${item.id}`}
                tag={<Tag tone="warning">New feedback</Tag>}
                title={item.title}
                body={item.detail}
                className={banner}
              >
                <div className={bannerAction}>
                  <Button variant="outline" size="sm" block onClick={() => router.push(withRequest(item))}>
                    {item.actionLabel}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* From lg up: the week on the left, money and classes in a 380px
          column on the right. On a phone the two stacks run one after the
          other, in the frame's order. PROVISIONAL: no wide frame. */}
      <div className="flex flex-col gap-ds-card lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-ds-6">
        <div className="flex min-w-0 flex-col gap-ds-card">
          {/* All clear — frame 160:2057. First on a phone; from lg up it
              heads the right-hand column instead (rendered there too). */}
          {items.length === 0 ? (
            <IconNote
              className="lg:hidden"
              icon={<Check size={18} weight="bold" />}
              title="All paid. Nothing needs your attention."
              meta={nextCharge ? `Next payment ${nextCharge}` : undefined}
            />
          ) : null}

          {nextEvent ? (
            <Card
              tone="feature"
              eyebrow={isToday(nextEvent.start) ? 'Up next · today' : 'Up next'}
              title={nextEvent.title}
              body={[
                childById.size > 1 ? childById.get(nextEvent.childId)?.name.split(' ')[0] : null,
                nextEvent.tutorName,
                whenLabel(nextEvent.start),
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <Button variant="primary" size="lg" block onClick={() => router.push('/parent/calendar')}>
                View class
              </Button>
            </Card>
          ) : nextSession ? (
            <Card
              tone="feature"
              eyebrow={isToday(nextSession.scheduledStartAt) ? 'Up next · today' : 'Up next'}
              title={nextSession.subjectName}
              body={`${nextSession.tutorName} · ${whenLabel(nextSession.scheduledStartAt)}`}
            >
              <Button variant="primary" size="lg" block onClick={() => router.push('/parent/calendar')}>
                View class
              </Button>
            </Card>
          ) : null}

          {/* The rest of the week, from lg up only: the phone frames stop at
              Up next, and on a phone the Calendar is one tap away. */}
          <section className="hidden flex-col gap-ds-3 lg:flex">
            <SectionHeader title="This week" action="Calendar" onAction={() => router.push('/parent/calendar')} />
            {days.length === 0 ? (
              <p className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card font-body text-[14px] text-ink-muted">
                Nothing scheduled in the next seven days.
              </p>
            ) : (
              <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-1">
                {days.map((d) => (
                  <div key={d.key} className="flex gap-ds-4 bw-b-hair border-line-soft py-ds-3 last:border-b-0">
                    <span className="w-[92px] shrink-0 pt-[1px] font-display text-[14px] font-extrabold text-ink">
                      {d.label}
                    </span>
                    <ul className="flex min-w-0 flex-1 flex-col gap-ds-2">
                      {d.items.map((e) => {
                        const child = childById.get(e.childId);
                        return (
                          <li key={e.key} className="flex items-baseline gap-ds-3">
                            <span className="w-[72px] shrink-0 font-body text-[14px] font-extrabold tabular-nums text-ink">
                              {timeLabel(e.start)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-body text-[14px] font-extrabold text-ink">{e.title}</span>
                              <span className="block truncate font-body text-[13px] text-ink">
                                {[child?.name.split(' ')[0], e.tutorName, e.type === '1:1' ? '1:1' : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </span>
                            {child && childById.size > 1 ? (
                              <span
                                aria-hidden
                                className="h-[10px] w-[10px] shrink-0 rounded-ds-full"
                                style={{ backgroundColor: child.color }}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="hidden flex-col gap-ds-card lg:flex">{classList}</div>
        </div>

        <div className="flex min-w-0 flex-col gap-ds-card">
          {items.length === 0 ? (
            <IconNote
              className="hidden lg:flex"
              icon={<Check size={18} weight="bold" />}
              title="All paid. Nothing needs your attention."
              meta={nextCharge ? `Next payment ${nextCharge}` : undefined}
            />
          ) : null}
          {active.length > 0 ? (
            <>
              <SectionHeader title="Payments by child" action="See all" onAction={() => router.push('/parent/billing')} />
              <Card>
                {payingChildNames.map((name) => {
                  const forChild = active.filter((s) => s.childName === name);
                  const total = forChild.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
                  // "paid": this counts only billed classes, so it is labelled as
                  // such — the class list above counts free ones too, and an
                  // unlabelled "2 classes" here beside "5" there read as an error.
                  return (
                    <SummaryRow
                      key={name}
                      label={
                        <span className="text-ink">
                          {name.split(' ')[0]} · {forChild.length} paid {forChild.length === 1 ? 'class' : 'classes'}
                        </span>
                      }
                      value={`${money(total)}/month`}
                    />
                  );
                })}
                {nextCharge ? <SummaryRow label={<span className="text-ink">Next charge</span>} value={nextCharge} /> : null}
                {payingChildNames.length > 1 ? (
                  <SummaryRow total label="Monthly total" value={`${money(monthly)}/month`} />
                ) : null}
              </Card>
            </>
          ) : null}
          <div className="flex flex-col gap-ds-card lg:hidden">{classList}</div>
        </div>
      </div>
    </div>
  );
}
