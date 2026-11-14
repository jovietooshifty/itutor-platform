'use client';

/**
 * TutorClassManageV2 — the new "Manage class" screen (canvas m10 phone,
 * d03 desktop). The default view of /tutor/classes/[id] under the new UI.
 *
 * What it shows is all real: derived state, next session, seats, enrolment
 * (open / closed for a break / full), the roster with payment and access
 * read from `group_enrollments.status`, pending join requests, and a share
 * card with the class's real link.
 *
 * Everything that changes the class still happens in the full class hub
 * (the old page, now inside the new shell), reached with `?tab=`:
 * Edit class → settings, Add a session → sessions, requests and adding a known
 * student → roster, Pause → settings (the pause control lives in its Danger
 * zone). "Class tools" lists all four so nothing the hub does is lost.
 *
 * Left out, because nothing backs them:
 * - "Confirm class is still on" (no confirmation record exists);
 * - "Class views" (no view tracking);
 * - m13's invitation list with statuses (the only invite API adds a student
 *   to the class directly, which m13 promises never to do). "Add students"
 *   opens the share sheet instead.
 *
 * Share links use NEXT_PUBLIC_APP_URL (the live site in production, the
 * preview on previews), never the canvas's illustrative itutor.app/c/… link.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, NavRow, SubjectTile, Tag } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';
import { AST_TIME_ZONE } from '@/lib/utils/scheduleFormat';
import { cn } from '@/lib/utils';
import { STATE_TAG, money, shortDate, type ClassItem } from './classState';

type RosterRow = {
  id: string;
  name: string;
  parent: string | null;
  enrolledAt: string | null;
  status: string;
  graceEndsAt: string | null;
  seatType: string | null;
};

type Overview = {
  class: ClassItem & {
    format: 'online' | 'physical' | 'hybrid' | null;
    endDate: string | null;
    enrolmentClosedUntil: string | null;
    requireJoinRequests: boolean;
  };
  next: { start: string; end: string } | null;
  lastEnded: string | null;
  roster: RosterRow[];
  requests: Array<{ id: string; name: string; at: string | null }>;
};

type Tone = 'brand' | 'warning' | 'danger' | 'outline' | 'dark';

/** Payment and access, from the enrolment's billing status. */
function enrolmentLabels(status: string, free: boolean): { line: string; payment: string; access: string; tag: string; tone: Tone } {
  switch (status) {
    case 'ACTIVE':
      return free
        ? { line: 'Enrolled · free class', payment: 'Free', access: 'Active', tag: 'Enrolled', tone: 'brand' }
        : { line: 'Enrolled · paid', payment: 'Paid', access: 'Active', tag: 'Paid', tone: 'brand' };
    case 'SECURED':
      return { line: 'Spot secured · starts soon', payment: 'Secured', access: 'Starts soon', tag: 'Secured', tone: 'outline' };
    case 'PENDING_PAYMENT':
      return { line: 'Checkout started · payment pending', payment: 'Pending', access: 'Not yet', tag: 'Waiting', tone: 'outline' };
    case 'GRACE':
      return { line: 'Payment failed · in grace period', payment: 'Failed', access: 'Grace period', tag: 'Action', tone: 'danger' };
    case 'SUSPENDED':
    case 'ACTIVATION_FAILED':
      return { line: 'Payment failed · access on hold', payment: 'Failed', access: 'On hold', tag: 'Action', tone: 'danger' };
    case 'COMPLETED':
      return { line: 'Completed', payment: 'Paid', access: 'Ended', tag: 'Done', tone: 'outline' };
    default:
      return { line: status.toLowerCase().replace(/_/g, ' '), payment: '—', access: '—', tag: status, tone: 'outline' };
  }
}

const PAY_TONE: Record<string, Tone> = { Paid: 'brand', Free: 'brand', Failed: 'danger', Pending: 'warning', Secured: 'outline' };

function timeRange(start: string, end: string): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: AST_TIME_ZONE });
  const a = t(start);
  const b = t(end);
  // "4:30–5:30 PM" when both share AM/PM.
  const [aT, aP] = a.split(' ');
  const [bT, bP] = b.split(' ');
  return aP === bP ? `${aT}–${bT} ${bP}` : `${a}–${b}`;
}

function initials(name: string): string {
  const p = name.replace(/\./g, '').split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}

function shareBase(): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (env) return env;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

const FORMAT_LABEL: Record<string, string> = { online: 'Online', physical: 'In person', hybrid: 'Online & in person' };

export default function TutorClassManageV2({ classId, onUnavailable }: { classId: string; onUnavailable: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [isError, setError] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`/api/tutor/classes/${classId}/overview`, { cache: 'no-store' });
      // Not this tutor's class (or an admin entering as tutor): the full hub
      // has its own access rules, so hand over to it.
      if (res.status === 404 || res.status === 403) {
        onUnavailable();
        return;
      }
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not load class');
      setData(json.data as Overview);
    } catch {
      setError(true);
    }
  }, [classId, onUnavailable]);
  useEffect(() => {
    load();
  }, [load]);

  const hub = (tab: 'sessions' | 'roster' | 'settings' | 'stream') => router.push(`/tutor/classes/${classId}?tab=${tab}`);

  const share = useMemo(() => {
    if (!data) return null;
    const url = `${shareBase()}/student/explore/${classId}`;
    const when = data.class.schedule ? ` We meet ${data.class.schedule.replace(' · ', ' at ')}.` : '';
    const message = `Hi! I'm teaching ${data.class.name} on iTutor.${when} You can see the details and join here: ${url}`;
    return { url, message };
  }, [data, classId]);

  if (isError) {
    return (
      <Card title="This class didn't load" body="Check your connection and try again.">
        <Button variant="outline" size="md" onClick={() => load()}>
          Try again
        </Button>
      </Card>
    );
  }
  if (!data || !share) {
    return (
      <div aria-busy className="flex flex-col gap-ds-3">
        <div className="h-6 w-28 animate-pulse rounded-ds-sm bg-surface-sunken" />
        <div className="h-40 animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-48 animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  const c = data.class;
  const label = c.subject || c.name;
  const tag = STATE_TAG[c.state];
  const free = !(c.price > 0);
  const nextText = data.next ? `${shortDate(data.next.start)} · ${timeRange(data.next.start, data.next.end)}` : null;
  const seatText = c.seats ? `${c.students} of ${c.seats}` : `${c.students}`;
  const enrolment = data.class.enrolmentClosedUntil
    ? `Closed until ${shortDate(data.class.enrolmentClosedUntil)}`
    : c.state === 'draft'
      ? 'Not published'
      : c.state === 'full'
        ? 'Full'
        : c.visibility === 'private'
          ? 'Open · invite only'
          : 'Open';
  const enrolmentLine =
    c.state === 'draft'
      ? 'Draft · families cannot see this class yet'
      : data.class.enrolmentClosedUntil
        ? `Enrolment closed until ${shortDate(data.class.enrolmentClosedUntil)}`
        : c.state === 'full'
          ? `Full · ${seatText} seats taken`
          : `Enrolment is open · ${c.seats ? `${seatText} seats taken` : `${c.students} enrolled`}`;
  const metaLine = [
    c.schedule,
    c.price > 0 ? `${money(c.price)}/${c.priceUnit ?? 'month'}` : 'Free',
    c.format ? FORMAT_LABEL[c.format] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const fixCard =
    c.state === 'fix' ? (
      <Card tone="alert" tag={<Tag tone="warning">Fix this class</Tag>} title={`${c.name} is missing a session`}
        body={
          data.lastEnded
            ? `The last session was ${shortDate(data.lastEnded)}. Add the next one so families can see when it meets.`
            : 'Add a session so families can see when it meets.'
        }
      >
        <Button variant="dark" size="md" onClick={() => hub('sessions')}>
          Add a session
        </Button>
      </Card>
    ) : null;

  const requestsCard =
    data.requests.length > 0 ? (
      <Card
        tag={<Tag tone="warning">Request</Tag>}
        title={
          data.requests.length === 1
            ? `${data.requests[0].name} asked to join`
            : `${data.requests.length} students asked to join`
        }
        body="Approve or decline from the students list."
      >
        <Button variant="outline" size="md" onClick={() => hub('roster')}>
          Review requests
        </Button>
      </Card>
    ) : null;

  const rosterEmpty = (
    <p className="m-0 py-ds-2 text-[14px] text-ink-muted">
      No students yet. Share the class link with families you teach so they can join.
    </p>
  );

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex flex-col gap-ds-2">
        <Link href="/tutor/classes" className="w-fit text-[14px] font-extrabold text-ink-muted no-underline hover:text-ink">
          ← Back to classes
        </Link>
        <div className="flex items-center justify-between gap-ds-3">
          <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Manage class</h1>
          <Button variant="outline" size="md" onClick={() => hub('settings')}>
            Edit class
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-ds-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-ds-5">
        <div className="flex min-w-0 flex-col gap-ds-4">
          {/* The class (m10 hero / d03 header card). */}
          <Card className="gap-ds-3">
            <div className="flex items-start gap-ds-3">
              <SubjectTile code={subjectCode(label)} color={subjectColor(label)} size={56} className="text-[16px] font-black" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-[18px] font-extrabold leading-6">{c.name}</div>
                <div className="text-[13px] leading-[18px] text-ink-muted">{metaLine}</div>
                <div className="mt-ds-2">
                  <Tag tone={tag.tone}>{tag.label}</Tag>
                </div>
              </div>
            </div>

            {/* Phone (m10): two lines. Desktop (d03): three facts. */}
            <div className="flex flex-col gap-[2px] bw-t-hair border-line-soft pt-ds-3 lg:hidden">
              <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">Next session</span>
              <span className={cn('text-[15px] font-extrabold', !nextText && 'text-danger')}>{nextText ?? 'None scheduled'}</span>
              <span className="text-[13px] text-ink-muted">{enrolmentLine}</span>
            </div>
            <dl className="m-0 hidden grid-cols-3 gap-ds-3 bw-t-hair border-line-soft pt-ds-3 lg:grid">
              <Fact label="Next session" value={nextText ?? 'None scheduled'} danger={!nextText && c.state !== 'draft'} />
              <Fact label="Seats" value={c.state === 'draft' ? '—' : seatText} />
              <Fact label="Enrolment" value={enrolment} />
            </dl>

            <div className="flex flex-wrap gap-ds-2">
              <Button variant="primary" size="md" onClick={() => setShareOpen(true)}>
                Add students
              </Button>
              <Button variant="outline" size="md" className="lg:hidden" onClick={() => setShareOpen(true)}>
                Share
              </Button>
              <Button variant="outline" size="md" onClick={() => hub('settings')}>
                {data.class.enrolmentClosedUntil || c.state === 'paused' ? 'Manage break' : 'Pause'}
              </Button>
            </div>
          </Card>

          {fixCard}
          {requestsCard}

          {/* Roster: list on phones (m10), table on desktop (d03). */}
          <section className="flex flex-col gap-ds-2">
            <div className="flex items-baseline justify-between">
              <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Students</h2>
              <button
                type="button"
                onClick={() => hub('roster')}
                className="border-0 bg-transparent p-0 font-body text-[14px] font-extrabold text-brand-edge cursor-pointer"
              >
                Roster
              </button>
            </div>
            <Card className="lg:hidden">
              {data.roster.length === 0 ? (
                rosterEmpty
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {data.roster.map((r, i) => {
                    const l = enrolmentLabels(r.status, free);
                    return (
                      <li key={r.id} className={cn('flex items-center gap-ds-3 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
                        <Avatar label={r.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-extrabold leading-5">{r.name}</span>
                          <span className="block text-[13px] leading-[18px] text-ink-muted">{l.line}</span>
                        </span>
                        <Tag tone={l.tone}>{l.tag}</Tag>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card className="hidden lg:flex">
              {data.roster.length === 0 ? (
                rosterEmpty
              ) : (
                <table className="w-full border-collapse text-left text-[14px]">
                  <thead>
                    <tr className="text-[12px] uppercase tracking-[0.04em] text-ink-muted">
                      {['Learner', 'Enrolment', 'Payment', 'Access'].map((h) => (
                        <th key={h} className="bw-b-hair border-line-soft py-ds-2 pr-ds-3 font-extrabold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.roster.map((r) => {
                      const l = enrolmentLabels(r.status, free);
                      const cell = 'bw-b-hair border-line-soft py-ds-3 pr-ds-3 align-middle';
                      return (
                        <tr key={r.id}>
                          <td className={cell}>
                            <span className="font-extrabold">{r.name}</span>
                            {r.parent ? <span className="text-ink-muted"> · parent {r.parent}</span> : null}
                          </td>
                          <td className={cn(cell, 'whitespace-nowrap')}>
                            {r.status === 'PENDING_PAYMENT' ? 'Checkout started' : r.enrolledAt ? `Enrolled ${shortDate(r.enrolledAt)}` : 'Enrolled'}
                          </td>
                          <td className={cell}>
                            <Tag tone={PAY_TONE[l.payment] ?? 'outline'}>{l.payment}</Tag>
                          </td>
                          <td className={cn(cell, 'whitespace-nowrap')}>{l.access}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          {/* Everything else the class hub does, so nothing is lost. */}
          <section className="flex flex-col gap-ds-2">
            <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Class tools</h2>
            <NavRow title="Sessions & schedule" meta="Add, move or cancel sessions; meeting link" onClick={() => hub('sessions')} />
            <NavRow title="Students & requests" meta="Approve requests, add a student you teach, remove" onClick={() => hub('roster')} />
            <NavRow title="Stream" meta="Posts and announcements for the class" onClick={() => hub('stream')} />
            <NavRow title="Settings" meta="Details, price, visibility, pause, archive" onClick={() => hub('settings')} />
          </section>
        </div>

        {/* Desktop right rail (d03): the share card. */}
        <aside className="hidden lg:flex lg:flex-col lg:gap-ds-4">
          <ShareCard message={share.message} url={share.url} />
        </aside>
      </div>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Add students">
        <p className="m-0 text-[14px] leading-5 text-ink-muted">
          Send families you already teach the class link. Nobody is enrolled or charged until they join and pay themselves.
        </p>
        <ShareCard message={share.message} url={share.url} bare />
        <button
          type="button"
          onClick={() => hub('roster')}
          className="w-fit border-0 bg-transparent p-0 font-body text-[14px] font-extrabold text-ink underline cursor-pointer"
        >
          Add a student who already has an account
        </button>
      </Sheet>
    </div>
  );
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">{label}</dt>
      <dd className={cn('m-0 text-[15px] font-extrabold', danger && 'text-danger')}>{value}</dd>
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken font-display text-[13px] font-extrabold text-ink">
      {initials(label)}
    </span>
  );
}

function ShareCard({ message, url, bare }: { message: string; url: string; bare?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is on screen to copy by hand */
    }
  };
  const body = (
    <>
      <p className="m-0 rounded-ds-sm bg-surface-sunken p-ds-3 text-[14px] leading-5 text-ink [overflow-wrap:anywhere]">{message}</p>
      <div className="flex flex-col gap-ds-2">
        <Button
          variant="primary"
          size="md"
          block
          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')}
        >
          Share on WhatsApp
        </Button>
        <Button variant="outline" size="md" block onClick={copy}>
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
      </div>
    </>
  );
  if (bare) return <div className="flex flex-col gap-ds-3">{body}</div>;
  return (
    <Card title="Share this class" className="gap-ds-3">
      {body}
    </Card>
  );
}
