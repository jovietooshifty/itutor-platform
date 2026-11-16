'use client';

/**
 * Tutor Requests, new UI — /tutor/bookings. Canvas m23 ("Requests for help").
 *
 * The canvas shows named families asking for help, with Reply / Send class.
 * The only named requests that exist are:
 * - one-on-one lesson requests (bookings), and
 * - asks to join a class (group_members.status = pending).
 * Both are listed here by name. Accepting, declining or proposing a new time
 * stays on the screens that already do it (the booking page, the class page),
 * so nothing about money or seats changes in this redraw.
 *
 * "Families are asking for" uses /api/tutor/demand, which is counts only.
 * Those families asked iTutor to tell them when a class opens; they did not
 * agree to be contacted by a teacher, so there is no Reply on that list, only
 * "Create a class" (same rule as DemandPanel).
 *
 * Below the requests, the tutor's lessons: Upcoming / Past / Closed, which is
 * what the old bookings list showed. Desktop has no canvas frame: one reading
 * column, PROVISIONAL.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Segmented, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { AST_TIME_ZONE } from '@/lib/utils/scheduleFormat';
import TutorV2Shell from './TutorV2Shell';

type Booking = {
  id: string;
  student_id: string;
  subject_id: string | null;
  status: string;
  requested_start_at: string | null;
  requested_end_at: string | null;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  duration_minutes: number | null;
  price_ttd: number | null;
  student_notes: string | null;
  created_at: string;
};
type Row = Booking & { student: string; subject: string; session: { status: string; scheduled_end_at: string | null } | null };
type JoinReq = { id: string; studentName: string; groupId: string; groupName: string; joinedAt: string };
type Cluster = { key: string; subject: string; levelLabel: string; deliveryLabel: string; families: number };
type Tab = 'upcoming' | 'past' | 'closed';

const WAITING = ['PENDING_PARENT_APPROVAL', 'PARENT_APPROVED', 'COUNTER_PROPOSED'];
const CLOSED = ['DECLINED', 'CANCELLED', 'EXPIRED', 'WITHDRAWN', 'PARENT_REJECTED', 'SEAT_UNAVAILABLE_REFUNDED'];

const STATUS_TEXT: Record<string, string> = {
  PENDING_PARENT_APPROVAL: 'Waiting for a parent to approve',
  PARENT_APPROVED: 'Parent approved',
  COUNTER_PROPOSED: 'You suggested another time',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired unanswered',
  WITHDRAWN: 'Withdrawn',
  PARENT_REJECTED: 'Parent said no',
  SEAT_UNAVAILABLE_REFUNDED: 'Refunded, time no longer free',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CONFIRMED: 'Confirmed',
};

function when(iso: string | null) {
  if (!iso) return 'Time to be agreed';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: AST_TIME_ZONE });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: AST_TIME_ZONE });
  return `${day} · ${time}`;
}

const startOf = (b: Booking) => b.confirmed_start_at ?? b.requested_start_at;

function isPast(b: Row, now: number) {
  if (b.status === 'COMPLETED' || b.status === 'NO_SHOW') return true;
  if (b.status !== 'CONFIRMED') return false;
  const end = b.session?.scheduled_end_at ?? b.confirmed_end_at ?? b.requested_end_at;
  return Boolean(end && new Date(end).getTime() < now);
}

export default function TutorRequestsV2() {
  return (
    <TutorV2Shell title="Requests">
      <RequestsBody />
    </TutorV2Shell>
  );
}

function RequestsBody() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [joins, setJoins] = useState<JoinReq[] | null>(null);
  const [demand, setDemand] = useState<Cluster[]>([]);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.id || profile.role !== 'tutor') return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: e } = await supabase
          .from('bookings')
          .select(
            'id, student_id, subject_id, status, requested_start_at, requested_end_at, confirmed_start_at, confirmed_end_at, duration_minutes, price_ttd, student_notes, created_at'
          )
          .eq('tutor_id', profile.id)
          .order('created_at', { ascending: false });
        if (e) throw e;
        const list = (data ?? []) as Booking[];
        const sIds = Array.from(new Set(list.map((b) => b.student_id)));
        const subIds = Array.from(new Set(list.map((b) => b.subject_id).filter(Boolean))) as string[];
        const bIds = list.map((b) => b.id);
        const [people, subs, sess] = await Promise.all([
          sIds.length ? supabase.from('profiles').select('id, username, display_name, full_name').in('id', sIds) : Promise.resolve({ data: [] as any[] }),
          subIds.length ? supabase.from('subjects').select('id, name, label').in('id', subIds) : Promise.resolve({ data: [] as any[] }),
          bIds.length ? supabase.from('sessions').select('booking_id, status, scheduled_end_at').in('booking_id', bIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const pName = new Map((people.data ?? []).map((p: any) => [p.id, getDisplayName(p)]));
        const sName = new Map((subs.data ?? []).map((s: any) => [s.id, s.label || s.name]));
        const sByB = new Map((sess.data ?? []).map((s: any) => [s.booking_id, s]));
        if (!cancelled)
          setRows(
            list.map((b) => ({
              ...b,
              student: (pName.get(b.student_id) as string) || 'Student',
              subject: (b.subject_id && (sName.get(b.subject_id) as string)) || 'One-on-one lesson',
              session: (sByB.get(b.id) as any) ?? null,
            }))
          );
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    fetch('/api/tutor/pending-join-requests', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((j) => !cancelled && setJoins(j.requests ?? []))
      .catch(() => !cancelled && setJoins([]));
    fetch('/api/tutor/demand', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { clusters: [] }))
      .then((j) => !cancelled && setDemand((j.clusters ?? []).slice(0, 5)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.role]);

  const now = Date.now();
  const pending = useMemo(() => (rows ?? []).filter((b) => b.status === 'PENDING'), [rows]);
  const waiting = useMemo(() => (rows ?? []).filter((b) => WAITING.includes(b.status)), [rows]);
  const lists = useMemo(() => {
    const all = rows ?? [];
    const upcoming = all
      .filter((b) => b.status === 'CONFIRMED' && !isPast(b, now))
      .sort((a, b) => (startOf(a) ?? '').localeCompare(startOf(b) ?? ''));
    const past = all.filter((b) => isPast(b, now)).sort((a, b) => (startOf(b) ?? '').localeCompare(startOf(a) ?? ''));
    const closed = all.filter((b) => CLOSED.includes(b.status));
    return { upcoming, past, closed };
  }, [rows, now]);

  const loadingAll = rows === null && !error;
  const nothingToAnswer = rows !== null && joins !== null && pending.length === 0 && joins.length === 0 && waiting.length === 0;

  return (
    <div className="flex flex-col gap-ds-5">
      <div className="flex flex-col gap-ds-1">
        <h1 className="ds-page-title m-0">Requests</h1>
        <p className="m-0 text-[15px] text-ink-muted">Families asking for a lesson or a seat. A request is not a booking until you accept it.</p>
      </div>

      {error ? (
        <p className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-3 text-[14px] font-bold text-ink" role="alert">
          We couldn&apos;t load your lessons. Refresh to try again.
        </p>
      ) : null}

      {loadingAll ? <div className="h-[220px] animate-pulse rounded-ds-card bg-surface-sunken" aria-busy /> : null}

      {nothingToAnswer ? (
        <div className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <p className="m-0 text-[15px] font-extrabold text-ink">No requests right now</p>
          <p className="m-0 mt-ds-1 text-[14px] text-ink-muted">
            When a family asks for a one-on-one lesson or a seat in a class, it shows here and on Home.
          </p>
        </div>
      ) : null}

      {pending.length ? (
        <Group title="Lesson requests" count={pending.length}>
          {pending.map((b) => (
            <RequestCard
              key={b.id}
              tag={b.subject}
              title={b.student}
              detail={`${when(b.requested_start_at)}${b.duration_minutes ? ` · ${b.duration_minutes} min` : ''}${b.price_ttd != null ? ` · TT$${Number(b.price_ttd).toLocaleString('en-US')}` : ''}`}
              note={b.student_notes}
              href={`/tutor/bookings/${b.id}`}
              cta="Review request"
            />
          ))}
        </Group>
      ) : null}

      {joins && joins.length ? (
        <Group title="Asked to join a class" count={joins.length}>
          {joins.map((j) => (
            <RequestCard key={j.id} tag={j.groupName} title={j.studentName} detail="Asked for a seat" href={`/tutor/classes/${j.groupId}`} cta="Review" />
          ))}
        </Group>
      ) : null}

      {waiting.length ? (
        <Group title="Waiting on the family" count={waiting.length}>
          {waiting.map((b) => (
            <RequestCard
              key={b.id}
              tag={b.subject}
              title={b.student}
              detail={`${when(startOf(b))} · ${STATUS_TEXT[b.status] ?? b.status}`}
              href={`/tutor/bookings/${b.id}`}
              cta="Open"
              quiet
            />
          ))}
        </Group>
      ) : null}

      {demand.length ? (
        <section className="flex flex-col gap-ds-2">
          <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">Families are asking for</h2>
          <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card">
            {demand.map((c, i) => (
              <div key={c.key} className={cn('flex flex-wrap items-center justify-between gap-x-ds-3 gap-y-[2px] px-ds-card py-ds-3', i > 0 && 'bw-t-hair border-line-soft')}>
                <div className="min-w-0">
                  <div className="break-words text-[15px] font-extrabold text-ink">{c.subject}</div>
                  <div className="text-[13px] text-ink-muted">
                    {c.levelLabel} · {c.deliveryLabel}
                  </div>
                </div>
                <span className="text-[14px] font-bold tabular-nums text-ink-muted">
                  {c.families} {c.families === 1 ? 'family' : 'families'}
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-ds-2 bw-t-hair border-line-soft px-ds-card py-ds-3">
              <span className="text-[13px] text-ink-muted">
                These families asked us to tell them when a class opens, so we don&apos;t share who they are.
              </span>
              <Button variant="outline" size="sm" className="self-start" onClick={() => router.push('/tutor/classes/new')}>
                Create a class
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {rows && rows.length ? (
        <section className="flex flex-col gap-ds-3">
          <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Your one-on-one lessons</h2>
          <div className="lg:max-w-[420px]">
            <Segmented
              label="Lessons"
              options={[
                { id: 'upcoming', label: `Upcoming${lists.upcoming.length ? ` (${lists.upcoming.length})` : ''}` },
                { id: 'past', label: 'Past' },
                { id: 'closed', label: 'Closed' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          {lists[tab].length === 0 ? (
            <p className="m-0 text-[14px] text-ink-muted">
              {tab === 'upcoming' ? 'No lessons booked ahead.' : tab === 'past' ? 'No past lessons yet.' : 'Nothing declined, cancelled or expired.'}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col rounded-ds-card bw-hair border-border bg-surface-card p-0">
              {lists[tab].map((b, i) => (
                <li key={b.id} className={cn(i > 0 && 'bw-t-hair border-line-soft')}>
                  <Link href={`/tutor/bookings/${b.id}`} className="ds-press flex min-h-[64px] items-center gap-ds-3 px-ds-card py-ds-3 text-ink no-underline">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[15px] font-extrabold">
                        {b.student} · {b.subject}
                      </span>
                      <span className="block text-[13px] text-ink-muted">{when(startOf(b))}</span>
                    </span>
                    {tab !== 'upcoming' ? <span className="shrink-0 text-[13px] font-bold text-ink-muted">{STATUS_TEXT[pastStatus(b)] ?? b.status}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** A confirmed lesson in the past reads by what its session says happened. */
function pastStatus(b: Row) {
  if (b.status !== 'CONFIRMED') return b.status;
  const s = b.session?.status;
  if (s === 'COMPLETED' || s === 'COMPLETED_ASSUMED') return 'COMPLETED';
  if (s === 'NO_SHOW_STUDENT') return 'NO_SHOW';
  if (s === 'CANCELLED') return 'CANCELLED';
  return 'CONFIRMED';
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-ds-2">
      <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">
        {title} · {count}
      </h2>
      <div className="flex flex-col gap-ds-3">{children}</div>
    </section>
  );
}

function RequestCard({
  tag,
  title,
  detail,
  note,
  href,
  cta,
  quiet,
}: {
  tag: string;
  title: string;
  detail: string;
  note?: string | null;
  href: string;
  cta: string;
  quiet?: boolean;
}) {
  return (
    <div className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <Tag tone="outline" className="self-start">
        {tag}
      </Tag>
      <div className="flex flex-col gap-[2px]">
        <span className="break-words text-[16px] font-extrabold text-ink">{title}</span>
        <span className="text-[14px] text-ink-muted">{detail}</span>
      </div>
      {note ? <p className="m-0 break-words rounded-ds-sm bg-surface-sunken px-ds-3 py-ds-2 text-[14px] text-ink">“{note}”</p> : null}
      <Link
        href={href}
        className={cn(
          'ds-press inline-flex min-h-[44px] items-center justify-center self-start rounded-ds-full px-ds-4 font-body text-[15px] font-extrabold no-underline',
          quiet ? 'bw-hair border-border-strong bg-surface-card text-ink' : 'bg-brand text-ink'
        )}
      >
        {cta}
      </Link>
    </div>
  );
}
