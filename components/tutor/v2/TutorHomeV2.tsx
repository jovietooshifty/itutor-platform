'use client';

/**
 * TutorHomeV2 — the new tutor Home, from the Design canvas "iTutor Teacher UI".
 *
 * Three states, picked from real data:
 * - m07 "New teacher": the 3-step setup checklist is not finished.
 * - m07b "Profile done, no students": setup done, nobody enrolled yet.
 * - m06 "Home" (phone) / d01 (desktop): everything else.
 *
 * Phone order follows m06 (the first urgent item, the rest, Up next, This
 * week, Your classes). From lg up it is d01's two columns (Next session,
 * Needs your attention, Your classes | This week, Messages, Finish your
 * profile). One tree serves both: on phones the column wrappers are
 * `contents` and `order-*` sets the sequence.
 *
 * Every number comes from /api/tutor/home. The canvas's "Time saved" and
 * "Awaiting parent" rows have no source and are not drawn.
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, QuestProgress, SectionHeader, SubjectTile, Tag } from '@/components/ui';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';
import { AST_TIME_ZONE } from '@/lib/utils/scheduleFormat';
import { cn } from '@/lib/utils';

type Action = { id: string; tone: 'danger' | 'warn' | 'info'; tag: string; title: string; detail: string; href: string; cta: string };
type ClassRowData = {
  id: string;
  name: string;
  subject: string | null;
  status: string | null;
  schedule: string | null;
  hasUpcoming: boolean;
  students: number;
  seats: number | null;
  price: number;
  priceUnit: 'month' | 'session' | null;
};
type HomeData = {
  name: string | null;
  next: null | { kind: 'class' | 'lesson'; href: string; title: string; start: string; end: string; students: number | null; seats: number | null };
  actions: Action[];
  messages: Array<{ id: string; name: string; preview: string; at: string | null; unread: number; href: string }>;
  unreadMessages: number;
  week: { start: string; collected: number; newStudents: number; lessonsTaught: number };
  classes: ClassRowData[];
  totalClasses: number;
  totalStudents: number;
  setup: { photoAndBio: boolean; publishedClass: boolean; contactConfirmed: boolean };
};

const money = (n: number) => `TT$${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0 })}`;

function astParts(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: AST_TIME_ZONE });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: AST_TIME_ZONE });
  return { day, time };
}

/** "today" / "tomorrow" / "Wed" — in AST, which is how classes are scheduled. */
function relativeDay(iso: string): string {
  const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: AST_TIME_ZONE });
  const target = key(new Date(iso));
  const today = new Date();
  if (target === key(today)) return 'today';
  if (target === key(new Date(today.getTime() + 86_400_000))) return 'tomorrow';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: AST_TIME_ZONE });
}

function greeting(): string {
  const h = Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: AST_TIME_ZONE }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const ACTION_TAG: Record<Action['tone'], 'danger' | 'warning' | 'outline'> = {
  danger: 'danger',
  warn: 'warning',
  info: 'outline',
};

export default function TutorHomeV2() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useQuery<HomeData>({
    queryKey: ['tutor-home'],
    queryFn: async () => {
      const res = await fetch('/api/tutor/home', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not load Home');
      return json.data as HomeData;
    },
  });

  if (isLoading) {
    return (
      <div aria-busy className="flex flex-col gap-ds-3">
        <div className="h-9 w-56 animate-pulse rounded-ds-sm bg-surface-sunken" />
        <div className="h-36 animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-28 animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card title="Home didn't load" body="Check your connection and try again.">
        <Button variant="outline" size="md" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  const name = data.name ?? 'there';
  const stepsDone = [data.setup.photoAndBio, data.setup.publishedClass, data.setup.contactConfirmed].filter(Boolean).length;
  const setupDone = stepsDone === 3;

  if (!setupDone || data.totalStudents === 0) {
    return <SetupHome data={data} name={name} stepsDone={stepsDone} setupDone={setupDone} />;
  }

  const [urgent, ...rest] = data.actions;
  const urgentIsDanger = urgent?.tone === 'danger';

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center justify-between gap-ds-3">
        <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">
          <span className="lg:hidden">{name}&rsquo;s week</span>
          <span className="hidden lg:inline">
            {greeting()}, {name}
          </span>
        </h1>
        <Button variant="primary" size="md" className="hidden lg:inline-flex" onClick={() => router.push('/tutor/classes/new')}>
          Create a class
        </Button>
      </div>

      <div className="flex flex-col gap-ds-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-ds-5">
        {/* Left column (d01) */}
        <div className="contents lg:flex lg:flex-col lg:gap-ds-5">
          {/* m06: the payment failure sits on its own, above everything. */}
          {urgentIsDanger ? (
            <Card tone="alert" tag={<Tag tone="danger">{urgent.tag}</Tag>} title={urgent.title} body={urgent.detail} className="order-1 lg:hidden">
              <Button variant="danger" size="md" onClick={() => router.push(urgent.href)}>
                {urgent.cta}
              </Button>
            </Card>
          ) : null}

          {data.next ? (
            <Card tone="feature" eyebrow={`Up next · ${relativeDay(data.next.start)}`} title={data.next.title} className="order-3 lg:order-none">
              <div className="pb-ds-3 text-[14px] leading-5 text-on-ink-muted">
                {astParts(data.next.start).day} · {astParts(data.next.start).time}
                {data.next.kind === 'class'
                  ? ` · ${data.next.students ?? 0}${data.next.seats ? ` of ${data.next.seats}` : ''} student${(data.next.students ?? 0) === 1 && !data.next.seats ? '' : 's'}`
                  : ''}
              </div>
              <Button variant="primary" size="md" className="self-start" onClick={() => router.push(data.next!.href)}>
                {data.next.kind === 'class' ? 'View class' : 'View lesson'}
              </Button>
            </Card>
          ) : (
            <Card eyebrow="Up next" title="Nothing scheduled" body="No class or 1:1 lesson is coming up." className="order-3 lg:order-none" />
          )}

          <AttentionCard
            // Phones already showed the first payment failure above.
            actions={urgentIsDanger ? rest : data.actions}
            all={data.actions}
            messages={data.messages}
            className="order-2 lg:order-none"
          />

          <section className="order-5 flex flex-col gap-ds-2 lg:order-none">
            <SectionHeader title="Your classes" action={data.totalClasses > 0 ? 'See all' : undefined} onAction={() => router.push('/tutor/classes')} />
            {data.classes.length === 0 ? (
              <Card body="No classes yet.">
                <Button variant="outline" size="md" onClick={() => router.push('/tutor/classes/new')}>
                  Create a class
                </Button>
              </Card>
            ) : (
              <div className="flex flex-col gap-ds-2">
                {data.classes.map((c) => (
                  <ClassLine key={c.id} c={c} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column (d01) */}
        <div className="contents lg:flex lg:flex-col lg:gap-ds-5">
          <section className="order-4 flex flex-col gap-ds-2 lg:order-none">
            <SectionHeader title="This week" action="See report" onAction={() => router.push('/tutor/analytics')} />
            <Card>
              <dl className="m-0 flex flex-col">
                <Kv label="Collected" value={money(data.week.collected)} />
                <Kv label="New students" value={String(data.week.newStudents)} />
                <Kv label="Lessons taught" value={String(data.week.lessonsTaught)} last />
              </dl>
            </Card>
          </section>

          <section className="hidden flex-col gap-ds-2 lg:flex">
            <SectionHeader
              title="Messages"
              action={data.unreadMessages > 0 ? undefined : 'Open'}
              onAction={() => router.push('/tutor/messages')}
            />
            <Card>
              {data.messages.length === 0 ? (
                <p className="m-0 text-[14px] text-ink-muted">You&rsquo;re all caught up.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {data.messages.map((m, i) => (
                    <li key={m.id} className={cn(i > 0 && 'bw-t-hair border-line-soft')}>
                      <Link href={m.href} className="ds-press flex items-center gap-ds-3 py-ds-2 text-ink no-underline">
                        <Avatar label={m.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold">{m.name}</span>
                          <span className="block truncate text-[13px] text-ink-muted">{m.preview}</span>
                        </span>
                        <Tag tone="warning">{m.unread} new</Tag>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function AttentionCard({
  actions,
  all,
  messages,
  className,
}: {
  actions: Action[];
  all: Action[];
  messages: HomeData['messages'];
  className?: string;
}) {
  // Phones list unread chats here too ("Kiara's parent asked about Form 5");
  // desktop gives them their own Messages card.
  const phoneMessages = messages.slice(0, 2);
  const phoneEmpty = actions.length === 0 && phoneMessages.length === 0;
  const desktopEmpty = all.length === 0;
  return (
    <section className={cn('flex flex-col gap-ds-2', phoneEmpty && 'max-lg:hidden', desktopEmpty && 'lg:hidden', className)}>
      <h2 className="m-0 hidden font-display text-[18px] font-extrabold text-ink lg:block">Needs your attention</h2>
      <Card>
        <div className="pb-ds-1 text-[16px] font-extrabold text-ink lg:hidden">Also needs you</div>
        <ul className="m-0 flex list-none flex-col p-0">
          {/* Desktop shows every action; phones show what the alert card didn't. */}
          {all.map((a, i) => {
            const onPhone = actions.includes(a);
            return (
              <li key={a.id} className={cn(i > 0 && 'lg:bw-t-hair lg:border-line-soft', !onPhone && 'max-lg:hidden')}>
                <Link href={a.href} className="ds-press flex items-center gap-ds-3 py-ds-2 text-ink no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold leading-5">{a.title}</span>
                    <span className="block text-[13px] leading-[18px] text-ink-muted">{a.detail}</span>
                  </span>
                  <Tag tone={ACTION_TAG[a.tone]}>{a.tag}</Tag>
                </Link>
              </li>
            );
          })}
          {phoneMessages.map((m) => (
            <li key={m.id} className="lg:hidden">
              <Link href={m.href} className="ds-press flex items-center gap-ds-3 py-ds-2 text-ink no-underline">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold leading-5">{m.name} messaged you</span>
                  <span className="block truncate text-[13px] leading-[18px] text-ink-muted">{m.preview || 'New message'}</span>
                </span>
                <Tag tone="outline">New</Tag>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function ClassLine({ c }: { c: ClassRowData }) {
  const label = c.subject || c.name;
  const draft = c.status !== 'PUBLISHED';
  const sub = draft
    ? 'Draft · not published yet'
    : !c.hasUpcoming
      ? `No upcoming session · ${c.students} student${c.students === 1 ? '' : 's'}`
      : [c.schedule, c.seats ? `${c.students} of ${c.seats} seats` : `${c.students} student${c.students === 1 ? '' : 's'}`]
          .filter(Boolean)
          .join(' · ');
  return (
    <Link href={`/tutor/classes/${c.id}`} className="ds-press block text-ink no-underline">
      <Card className="flex-row items-center gap-ds-3">
        <SubjectTile code={subjectCode(label)} color={subjectColor(label)} size={48} className="text-[15px] font-black" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold leading-5">{c.name}</span>
          <span className="block text-[13px] leading-[18px] text-ink-muted">{sub}</span>
        </span>
        {c.price > 0 ? (
          <span className="shrink-0 text-right font-display text-[15px] font-extrabold tabular-nums">
            {money(c.price)}
            {c.priceUnit ? <small className="block text-[11px] font-bold text-ink-muted">/{c.priceUnit}</small> : null}
          </span>
        ) : draft ? (
          <Tag tone="outline">Draft</Tag>
        ) : null}
      </Card>
    </Link>
  );
}

function Kv({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-ds-2', !last && 'bw-b-hair border-line-soft')}>
      <dt className="text-[14px] text-ink-muted">{label}</dt>
      <dd className="m-0 font-display text-[16px] font-extrabold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  const initials = label
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[12px] font-extrabold text-ink">
      {initials}
    </span>
  );
}

/** m07 (setup unfinished) and m07b (set up, no students yet). */
function SetupHome({ data, name, stepsDone, setupDone }: { data: HomeData; name: string; stepsDone: number; setupDone: boolean }) {
  const router = useRouter();
  const left = 3 - stepsDone;
  const steps = [
    { done: data.setup.photoAndBio, title: 'Add a photo and bio', detail: 'Needed to publish a class', href: '/tutor/profile' },
    { done: data.setup.publishedClass, title: 'Create a group class', detail: 'Add a schedule and price', href: '/tutor/classes/new' },
    { done: data.setup.contactConfirmed, title: 'Confirm your contact details', detail: 'Email', href: '/tutor/settings' },
  ];
  // Invitations are sent from a class page; with no class yet, the first
  // step is making one.
  const inviteHref = data.classes[0] ? `/tutor/classes/${data.classes[0].id}` : '/tutor/classes/new';

  return (
    <div className="flex flex-col gap-ds-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-ds-5">
      <div className="flex flex-col gap-ds-4">
        <div>
          <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">
            {setupDone ? `You’re ready, ${name}` : `Welcome, ${name}`}
          </h1>
          <p className="m-0 mt-ds-1 text-[15px] leading-[22px] text-ink-muted">
            {setupDone
              ? 'Your profile is complete. Now bring in your first students.'
              : `${left === 1 ? 'One thing' : `${left === 2 ? 'Two' : 'Three'} things`} left before families can find you.`}
          </p>
        </div>

        <Card eyebrow="Finish setting up">
          <div className="flex flex-col gap-ds-2 pt-ds-2">
            <QuestProgress variant="meter" total={3} done={stepsDone} />
            <div className="text-[13px] text-ink-muted">
              {stepsDone} of 3 done
            </div>
            <ol className="m-0 flex list-none flex-col p-0">
              {steps.map((s, i) => (
                <li key={s.title}>
                  <Link href={s.href} className="ds-press flex items-center gap-ds-3 py-ds-2 text-ink no-underline">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-ds-sm font-display text-[14px] font-extrabold',
                        s.done ? 'bg-brand text-ink' : 'bg-surface-sunken text-ink'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold leading-5">{s.title}</span>
                      <span className="block text-[13px] leading-[18px] text-ink-muted">{s.detail}</span>
                    </span>
                    <Tag tone={s.done ? 'brand' : 'warning'}>{s.done ? 'Done' : 'To do'}</Tag>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Card>

        {setupDone ? (
          <Button variant="primary" size="lg" block onClick={() => router.push(inviteHref)}>
            Invite students
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => router.push(data.setup.publishedClass ? steps.find((s) => !s.done)!.href : '/tutor/classes/new')}
          >
            {data.setup.publishedClass ? steps.find((s) => !s.done)!.title : 'Create a class'}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-ds-4">
        <Card eyebrow="Optional" title="Offer one-on-one lessons" body="Families can book once you add your available times.">
          <Button variant="outline" size="md" className="self-start" onClick={() => router.push('/tutor/availability')}>
            Set up 1:1
          </Button>
        </Card>
        <Card eyebrow="Your students" title="No students yet" body="Invite students you already teach, or share your class once it is live.">
          <Button variant="outline" size="md" className="self-start" onClick={() => router.push(inviteHref)}>
            Invite students
          </Button>
        </Card>
      </div>
    </div>
  );
}
