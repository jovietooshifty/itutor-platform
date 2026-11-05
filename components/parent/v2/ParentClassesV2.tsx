'use client';

/**
 * Parent Classes, new UI — SCREEN_MAP logic row 1, frames `160:3622`
 * (upcoming) and `160:3831` (past).
 *
 * THIS SCREEN REPLACES TWO ROUTES. `/parent/subscriptions` (the enrolment list)
 * and `/parent/approvals` (the request queue) become one Classes tab with an
 * Upcoming / Past toggle. Both old routes now redirect here when the flag is
 * on, and still render their old selves when it is off — nothing 404s either
 * way, and no bookmark breaks.
 *
 * WHY A REQUEST AND AN ENROLMENT SHARE A SCREEN. They were separate pages
 * because they are separate tables, which is a reason for the database and not
 * for the parent. To a parent both answer one question — what is my child in,
 * or about to be in — and splitting them meant the thing that actually needs
 * acting on lived on the page they visited less. Requests therefore sit ABOVE
 * enrolments in Upcoming, not in a tab of their own.
 *
 * THREE EXISTING ENDPOINTS, NO NEW ONES:
 *   /api/parent/billing         subscriptions[] — every enrolment, with status
 *   /api/parent/approvals       pending[] — 1:1 session requests
 *   /api/parent/class-requests  pending[] — group class requests
 *
 * The two request queues are deliberately both read. The old approvals page
 * fetched both; the attention card once fetched only one, and a parent with a
 * child waiting on them was told "nothing needs you" while the queue showed a
 * request. One of them is easy to forget, so it is named here.
 *
 * UPCOMING vs PAST IS DERIVED FROM STATUS, not from a date. An enrolment is
 * past when it has been cancelled or has completed; everything else — active,
 * secured, in grace, suspended, paused — is a class the child is still in, even
 * when something is wrong with it. A suspended class belongs in front of the
 * parent, not filed away.
 *
 * ANSWERING A REQUEST happens here, in ParentRequestSheet: tapping a "Waiting
 * on you" row opens it, and `?request=<id>` (Home's "Review & pay", and any
 * old /parent/approvals link, which redirects here) opens it on arrival. The
 * old `/parent/approvals?v2=0` escape hatch is gone with it.
 *
 * `?booking=&checkout=` is Stripe's return from paying for an approved 1:1
 * session; it used to land on /parent/approvals, and the banner moved here.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckoutStateBanner from '@/components/parent/CheckoutStateBanner';
import { ParentRequestSheet, type AnyRequest } from './ParentRequestSheet';
import {
  Button,
  Card,
  DsIcon,
  IconNote,
  NavRow,
  SubjectTile,
  Tag,
} from '@/components/ui';
import { subjectCode, subjectColor } from './subjectTile';

type Subscription = {
  id: string;
  groupId: string | null;
  childId: string;
  childName: string;
  className: string;
  tutorName: string | null;
  status: string;
  amount: number;
  cancelled: boolean;
  cancelScheduled: boolean;
  paused: boolean;
  pausedByTutor: boolean;
  pauseEnds: string | null;
  nextCharge: string | null;
};

/** A 1:1 session a child asked for. */
type SessionRequest = {
  id: string;
  childName: string;
  tutorId?: string;
  minutes?: number;
  tutorName: string;
  when: string;
  priceWhenRequested: number;
  isFree: boolean;
  closesAt: string | null;
  closed: boolean;
};

/** A group class a child asked to join. */
type ClassRequest = {
  id: string;
  groupId: string;
  className: string;
  tutorName: string;
  childName: string;
  priceTtd: number;
  isFree: boolean;
  scheduleLabel: string | null;
  requiresTutorApproval?: boolean;
};

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 0 });
const money = (n: number) => `TT$${TT.format(Math.round(n))}`;

/**
 * Has this enrolment ended?
 *
 * `cancelled` is the API's own flag (a real cancelled_at). COMPLETED is a class
 * that ran its course. A cancellation SCHEDULED for the end of the period is
 * NOT past — the child still attends until then, and filing it under Past would
 * hide a class they have this week.
 */
function isPast(s: Subscription): boolean {
  return s.cancelled || s.status === 'COMPLETED' || s.status === 'CANCELLED';
}

function statusTag(s: Subscription) {
  if (s.cancelled) return <Tag tone="outline">Ended</Tag>;
  if (s.status === 'COMPLETED') return <Tag tone="outline">Completed</Tag>;
  if (s.cancelScheduled) return <Tag tone="warning">Ending soon</Tag>;
  if (s.paused) {
    return <Tag tone="warning">{s.pausedByTutor ? 'Tutor break' : 'Paused'}</Tag>;
  }
  if (s.status === 'SUSPENDED') return <Tag tone="danger">Suspended</Tag>;
  if (s.status === 'GRACE') return <Tag tone="warning">Payment due</Tag>;
  if (s.status === 'PENDING_PAYMENT') return <Tag tone="warning">Awaiting payment</Tag>;
  return <Tag tone="brand">Active</Tag>;
}

function subMeta(s: Subscription) {
  // Past tense on a class that has ended. "TT$140/month" under a finished
  // class reads as a charge still running, which is the one thing a parent
  // looking at Past must not be left wondering about.
  const price =
    s.amount > 0
      ? isPast(s)
        ? `was ${money(s.amount)}/month`
        : `${money(s.amount)}/month`
      : 'Free';
  return (
    <>
      {[s.childName, price].join(' · ')} {statusTag(s)}
    </>
  );
}

export default function ParentClassesV2() {
  const router = useRouter();
  const params = useSearchParams();
  const [openRequest, setOpenRequest] = useState<AnyRequest | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [wantedRequest, setWantedRequest] = useState<string | null>(params.get('request'));
  const checkoutBookingId = params.get('booking');
  const [checkoutDismissed, setCheckoutDismissed] = useState(false);
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [sessionReqs, setSessionReqs] = useState<SessionRequest[]>([]);
  const [classReqs, setClassReqs] = useState<ClassRequest[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [billingRes, approvalsRes, classRes] = await Promise.all([
        fetch('/api/parent/billing', { cache: 'no-store' }),
        fetch('/api/parent/approvals', { cache: 'no-store' }),
        fetch('/api/parent/class-requests', { cache: 'no-store' }),
      ]);

      // Billing carries the screen. If the two request queues fail the screen
      // is still worth rendering without them, so only this one is fatal.
      if (!billingRes.ok) throw new Error(`billing ${billingRes.status}`);
      const billing = await billingRes.json();
      setSubs(billing.subscriptions ?? []);

      if (approvalsRes.ok) {
        const j = await approvalsRes.json();
        setSessionReqs(j.pending ?? []);
      }
      if (classRes.ok) {
        const j = await classRes.json();
        setClassReqs(j.pending ?? []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Open the request named in ?request= once the queues have loaded. Cleared
  // after, so closing the sheet does not reopen it on the next reload.
  useEffect(() => {
    if (!wantedRequest || loading) return;
    const c = classReqs.find((r) => r.id === wantedRequest);
    const s = sessionReqs.find((r) => r.id === wantedRequest);
    if (c) setOpenRequest({ kind: 'class', ...c });
    else if (s) setOpenRequest({ kind: 'session', ...s });
    setWantedRequest(null);
  }, [wantedRequest, loading, classReqs, sessionReqs]);

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy="true">
        <h1 className="font-display text-[30px] font-extrabold leading-[34px] text-ink">
          Classes
        </h1>
        <div className="h-11 rounded-ds-card bg-surface-sunken" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] rounded-ds-card bg-surface-sunken" />
        ))}
      </div>
    );
  }

  if (error || !subs) {
    return (
      <div className="flex flex-col gap-ds-4">
        <h1 className="font-display text-[30px] font-extrabold leading-[34px] text-ink">
          Classes
        </h1>
        <Card>
          <p className="font-body text-[15px] font-extrabold text-ink">
            We could not load your classes.
          </p>
          <p className="mt-1 font-body text-[13px] text-ink-muted">
            Nothing has changed — this is a problem reading, not a problem with
            any enrolment.
          </p>
          <Button className="mt-ds-3" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const upcoming = subs.filter((s) => !isPast(s));
  const past = subs.filter(isPast);
  const requestCount = sessionReqs.length + classReqs.length;
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="flex flex-col gap-ds-4">
      <h1 className="font-display text-[30px] font-extrabold leading-[34px] text-ink">
        Classes
      </h1>

      {checkoutBookingId && !checkoutDismissed ? (
        <CheckoutStateBanner
          bookingId={checkoutBookingId}
          hint={params.get('checkout')}
          onDismiss={() => setCheckoutDismissed(true)}
        />
      ) : null}

      {flash ? (
        <p role="status" className="rounded-ds-card bg-brand px-ds-card py-ds-2 font-body text-[14px] font-extrabold text-ink">
          {flash}
        </p>
      ) : null}

      <ParentRequestSheet
        request={openRequest}
        onClose={() => setOpenRequest(null)}
        onSettled={(m) => {
          setFlash(m);
          window.setTimeout(() => setFlash(null), 8000);
          void load();
        }}
      />

      {/* The toggle. Two buttons rather than links: switching halves of one
          screen is not a navigation, and a URL per half would make the back
          button undo a filter.

          Frame 160:3622 has now been read. The selected segment is an INK
          fill with light text, not the brand green this was built with by
          analogy — corrected.

          STILL NOT THE FRAME, structurally. 160:3622 is a dated SCHEDULE:
          rows grouped under date headings, each with a dark date tile and
          a time range, and a yellow NEXT tag on the soonest. This screen
          lists ENROLMENTS instead. That is a data change, not a restyle —
          it needs session occurrences per child — so it is tracked rather
          than faked. */}
      <div
        role="tablist"
        aria-label="Classes"
        className="flex gap-ds-1 rounded-ds-card bw-hair border-border bg-surface-card p-[4px]"
      >
        {(['upcoming', 'past'] as const).map((key) => {
          const active = tab === key;
          const count = key === 'upcoming' ? upcoming.length : past.length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={[
                'flex-1 rounded-ds-btn px-ds-3 py-ds-2 font-body text-[14px] font-extrabold',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
                active ? 'bg-ink text-on-ink' : 'bg-transparent text-ink-muted',
              ].join(' ')}
            >
              {key === 'upcoming' ? 'Upcoming' : 'Past'}
              {count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Requests sit above enrolments, and only in Upcoming — a decision the
          parent has not taken yet outranks a class already running. */}
      {tab === 'upcoming' && requestCount > 0 && (
        <section className="flex flex-col gap-ds-2">
          <h2 className="font-display text-[18px] font-extrabold text-ink">
            Waiting on you
          </h2>

          {classReqs.map((r) => (
            <NavRow
              key={r.id}
              onClick={() => setOpenRequest({ kind: 'class', ...r })}
              tile={
                <SubjectTile
                  code={subjectCode(r.className)}
                  color={subjectColor(r.className)}
                />
              }
              title={`${r.childName.split(' ')[0]} wants to join ${r.className}`}
              meta={
                <>
                  {r.isFree ? 'Free class' : money(r.priceTtd)}
                  {r.scheduleLabel ? ` · ${r.scheduleLabel}` : ''}{' '}
                  <Tag tone="warning">Needs you</Tag>
                </>
              }
            />
          ))}

          {sessionReqs.map((r) => (
            <NavRow
              key={r.id}
              onClick={() => setOpenRequest({ kind: 'session', ...r })}
              tile={
                <SubjectTile
                  code={subjectCode(r.tutorName)}
                  color={subjectColor(r.tutorName)}
                />
              }
              title={`${r.childName.split(' ')[0]} asked for a session with ${r.tutorName}`}
              meta={
                <>
                  {r.when} · {r.isFree ? 'Free' : money(r.priceWhenRequested)}{' '}
                  {r.closed ? (
                    <Tag tone="outline">Closed</Tag>
                  ) : (
                    <Tag tone="warning">Needs you</Tag>
                  )}
                </>
              }
            />
          ))}
        </section>
      )}

      {shown.length > 0 ? (
        <section className="flex flex-col gap-ds-2">
          {tab === 'upcoming' && requestCount > 0 && (
            <h2 className="font-display text-[18px] font-extrabold text-ink">
              Enrolled
            </h2>
          )}
          {shown.map((s) => (
            <NavRow
              key={s.id}
              href={s.groupId ? `/parent/classes/${s.groupId}` : undefined}
              tile={
                <SubjectTile
                  code={subjectCode(s.className)}
                  color={subjectColor(s.className)}
                />
              }
              title={s.className}
              meta={subMeta(s)}
            />
          ))}
        </section>
      ) : tab === 'upcoming' && requestCount === 0 ? (
        <Card>
          <p className="font-body text-[15px] font-extrabold text-ink">
            No classes yet
          </p>
          <p className="mt-1 font-body text-[13px] text-ink-muted">
            When a child joins a class it appears here, with what you pay and
            when.
          </p>
          <Button className="mt-ds-3" onClick={() => router.push('/parent/classes')}>
            Find a class
          </Button>
        </Card>
      ) : tab === 'past' ? (
        <IconNote
          icon={<DsIcon name="classes" />}
          title="Nothing has ended yet"
          meta="Classes that finish or are cancelled move here."
        />
      ) : null}
    </div>
  );
}
