'use client';

/**
 * One child, new UI. Reached from a child card on Settings or Profile.
 *
 * PROVISIONAL VISUALS: no Figma frame. Built from system parts in the order a
 * parent opens this page to check: what is next, how attendance is going, what
 * they are enrolled in, then the controls.
 *
 * The old page was five tabs (Overview, Schedule, Classes, Messages, Billing)
 * and a red "Danger zone". This is one scrolling screen:
 * - The Classes tab drew marketplace cards with "Class by Tutor" placeholders;
 *   these are the child's real enrolments as rows, each opening its class.
 * - Schedule (attendance) is a figure WITH its denominator, from the server's
 *   rateLabel, never recomputed here (§6), and opens the session list.
 * - Messages and the two money switches are ports of ChildMessageHistory and
 *   ChildBillingControls onto system parts. Same endpoints, same copy where
 *   the copy carries a rule (§9.4 two-way disclosure, §7 self-pay tripwire).
 *   The originals stay for the flag-off page.
 * - "Remove from my account" is a plain row that opens a confirm sheet.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, NavRow, SubjectTile, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { Sheet } from './Sheet';
import { ChildTile } from './ParentChildrenV2';
import { subjectCode, subjectColor } from './subjectTile';

type Enrollment = {
  groupId: string;
  name: string;
  subject: string | null;
  status: string;
  tutorName?: string | null;
  priceMonthly?: number | null;
  /**
   * The shared "is in this class" rule (lib/server/parentChildClasses), set by
   * the overview route. Undefined only from an older server.
   */
  current?: boolean;
};
/** One entry from /api/parent/calendar — the same feed the Calendar renders. */
type CalEvent = {
  key: string;
  childId: string;
  title: string;
  tutorName: string | null;
  start: string;
  type: '1:1' | 'group';
  past: boolean;
  cancelled?: boolean;
};
type Booking = {
  id: string;
  tutorName: string;
  subject: string | null;
  status: string;
  start: string | null;
  priceTtd: number | null;
  durationMinutes: number | null;
};
type AttStatus = 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded';
type AttRow = { key: string; type: '1:1' | 'group'; label: string; start: string; present: boolean; status?: AttStatus | null; lateMinutes?: number | null };
type AttSummary = { counted?: number; total: number; rateLabel?: string };

const TZ = 'America/Port_of_Spain';
const fmtWhen = (iso: string) =>
  `${new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })} · ${new Date(
    iso
  ).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}`;

/** §6 vocabulary, character-identical to the other surfaces. */
const ATT: Record<AttStatus, { label: string; tone: 'brand' | 'warning' | 'danger' | 'outline' }> = {
  attended: { label: 'Attended', tone: 'brand' },
  late: { label: 'Late', tone: 'warning' },
  absent: { label: 'Absent', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'outline' },
  excluded: { label: 'Didn’t run', tone: 'outline' },
};

const ENROL: Record<string, { label: string; tone: 'brand' | 'warning' | 'danger' | 'outline' } | null> = {
  active: null,
  approved: null,
  pending: { label: 'Waiting for the tutor', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'warning' },
  banned: { label: 'Removed by tutor', tone: 'danger' },
  removed: { label: 'Left', tone: 'outline' },
  declined: { label: 'Declined', tone: 'outline' },
};

const BOOKING: Record<string, string> = {
  PENDING_PARENT_APPROVAL: 'Waiting on you',
  PENDING: 'Waiting for the tutor',
  CONFIRMED: 'Booked',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
  DECLINED: 'Declined',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-ds-2 font-display text-[18px] font-extrabold leading-[22px] text-ink">{children}</h2>
  );
}

export default function ParentChildV2() {
  const { childId } = useParams<{ childId: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [att, setAtt] = useState<AttRow[]>([]);
  const [summary, setSummary] = useState<AttSummary | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<'attendance' | 'remove' | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    (async () => {
      try {
        // The calendar feed answers "Next". It used to come from 1:1 bookings
        // alone, so a child with a group class tomorrow read "Nothing booked"
        // while the Calendar showed that class.
        const [ov, at, cal] = await Promise.all([
          fetch(`/api/parent/children/${childId}/overview`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/parent/children/${childId}/attendance`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch('/api/parent/calendar', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        if (cal) setEvents(((cal.events ?? []) as CalEvent[]).filter((e) => e.childId === childId));
        if (ov) {
          setName(ov.child?.name || 'Child');
          setEnrollments(ov.enrollments ?? []);
          setBookings(ov.bookings ?? []);
        }
        if (at) {
          setAtt(at.attendance ?? []);
          setSummary(at.summary ?? null);
        }
      } finally {
        setLoading(false);
      }
    })().catch(() => setLoading(false));
  }, [childId]);

  const first = (name || 'Your child').split(' ')[0];
  // In the class = the shared rule from the server, the same one Home, Classes
  // and the children list count with. A request still waiting on the tutor is
  // listed with its tag but not counted: the child is not in that class yet.
  const isIn = (e: Enrollment) => e.current ?? ['approved', 'active'].includes(e.status);
  const inClasses = enrollments.filter(isIn);
  const waitingOnTutor = enrollments.filter((e) => !isIn(e) && e.status === 'pending');
  const current = [...inClasses, ...waitingOnTutor];
  const past = enrollments.filter((e) => !current.includes(e));
  const nextEvent =
    events
      .filter((e) => !e.past && !e.cancelled && new Date(e.start).getTime() > Date.now())
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ?? null;
  const upcoming = bookings
    .filter((b) => b.start && new Date(b.start).getTime() > Date.now() && !['CANCELLED', 'DECLINED'].includes(b.status))
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());
  const waiting = bookings.filter((b) => b.status === 'PENDING_PARENT_APPROVAL');

  const remove = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch('/api/parent/remove-child', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId }),
      });
      if (res.ok) router.push('/parent/dashboard');
      else setRemoveError('That did not go through. Nothing was changed.');
    } catch {
      setRemoveError('That did not go through. Nothing was changed.');
    } finally {
      setRemoving(false);
    }
  };

  const activeCount = inClasses.length;

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title={loading ? undefined : name}>
      {loading ? (
        <DetailSkeleton rows={3} />
      ) : (
        <>
          <div className="flex items-center gap-ds-3">
            <ChildTile name={name} size={52} />
            <p className="font-body text-[14px] text-ink-muted">
              Student account linked · in {activeCount} {activeCount === 1 ? 'class' : 'classes'}
            </p>
          </div>

          {waiting.length > 0 ? (
            <NavRow
              href="/parent/my-classes"
              className="border-ink"
              title={`${waiting.length} ${waiting.length === 1 ? 'request is' : 'requests are'} waiting on you`}
              meta="No place is held while a request waits, and each one closes two hours before its class."
            />
          ) : null}

          <div className="grid grid-cols-2 gap-ds-2">
            <button
              type="button"
              onClick={() => setSheet('attendance')}
              className="flex flex-col items-start gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">Attendance</span>
              <span className="font-display text-[20px] font-extrabold leading-[24px] text-ink">
                {summary?.rateLabel ?? 'No sessions yet'}
              </span>
              <span className="font-body text-[13px] text-ink-muted">See every session</span>
            </button>
            <button
              type="button"
              onClick={() => router.push('/parent/calendar')}
              className="flex min-w-0 flex-col items-start gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">Next</span>
              <span className="font-display text-[20px] font-extrabold leading-[24px] text-ink">
                {nextEvent
                  ? new Date(nextEvent.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
                  : 'Nothing scheduled'}
              </span>
              <span className="w-full truncate font-body text-[13px] text-ink-muted">
                {nextEvent
                  ? `${new Date(nextEvent.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })} · ${nextEvent.title}`
                  : 'Open the calendar'}
              </span>
            </button>
          </div>

          <SectionTitle>Classes</SectionTitle>
          {current.length === 0 ? (
            <EmptyCard
              title={`${first} is not in a class yet`}
              action={
                <Button size="sm" onClick={() => router.push('/parent/classes')}>
                  Explore classes
                </Button>
              }
            />
          ) : (
            current.map((e) => {
              const st = ENROL[e.status];
              const label = e.subject || e.name;
              return (
                <NavRow
                  key={e.groupId}
                  href={`/parent/classes/${e.groupId}`}
                  tile={<SubjectTile code={subjectCode(label)} color={subjectColor(label)} size={44} />}
                  title={e.name}
                  meta={
                    <>
                      <span>{e.tutorName || 'Tutor'}</span>
                      {st ? <Tag tone={st.tone}>{st.label}</Tag> : null}
                    </>
                  }
                />
              );
            })
          )}

          {upcoming.length > 0 ? (
            <>
              <SectionTitle>1:1 sessions</SectionTitle>
              {upcoming.map((b) => (
                <NavRow
                  key={b.id}
                  chevron={false}
                  tile={<SubjectTile code={subjectCode(b.subject)} color={subjectColor(b.subject)} size={44} />}
                  title={b.subject || 'Tutoring session'}
                  meta={
                    <>
                      <span>{b.tutorName} · {fmtWhen(b.start!)}</span>
                      {BOOKING[b.status] && b.status !== 'CONFIRMED' ? (
                        <Tag tone={b.status === 'PENDING_PARENT_APPROVAL' ? 'warning' : 'outline'}>{BOOKING[b.status]}</Tag>
                      ) : null}
                    </>
                  }
                />
              ))}
            </>
          ) : null}

          <SectionTitle>Messages</SectionTitle>
          <ChildMessagesV2 childId={childId} first={first} />

          <SectionTitle>Spending</SectionTitle>
          <ChildBillingV2 childId={childId} first={first} />

          {past.length > 0 ? (
            <>
              <SectionTitle>Past classes</SectionTitle>
              {past.map((e) => (
                <NavRow
                  key={e.groupId}
                  href={`/parent/classes/${e.groupId}`}
                  title={e.name}
                  meta={
                    <>
                      <span>{e.tutorName || 'Tutor'}</span>
                      {ENROL[e.status] ? <Tag tone={ENROL[e.status]!.tone}>{ENROL[e.status]!.label}</Tag> : null}
                    </>
                  }
                />
              ))}
            </>
          ) : null}

          <NavRow
            onClick={() => setSheet('remove')}
            title={<span className="text-danger">Remove {first} from my account</span>}
            meta="Their student account and class history stay as they are."
          />
        </>
      )}

      <Sheet open={sheet === 'attendance'} onClose={() => setSheet(null)} title={`${first}’s sessions`}>
        {summary?.rateLabel ? (
          <p className="font-body text-[14px] text-ink-muted">Attendance {summary.rateLabel}</p>
        ) : null}
        {att.length === 0 ? (
          <p className="font-body text-[14px] text-ink-muted">No sessions have happened yet.</p>
        ) : (
          <ul className="flex flex-col">
            {att.map((r) => {
              const st = ATT[r.status ?? (r.present ? 'attended' : 'absent')];
              return (
                <li key={r.key} className="flex items-center justify-between gap-ds-3 bw-b-hair border-line-soft py-ds-2">
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[15px] font-extrabold text-ink">{r.label}</span>
                    <span className="block font-body text-[13px] text-ink-muted">
                      {fmtWhen(r.start)}
                      {r.status === 'late' && r.lateMinutes ? ` · ${r.lateMinutes} min late` : ''}
                    </span>
                  </span>
                  <Tag tone={st.tone}>{st.label}</Tag>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>

      <Sheet
        open={sheet === 'remove'}
        onClose={() => setSheet(null)}
        title={`Remove ${first}?`}
        footer={
          <>
            <Button variant="danger" block size="lg" disabled={removing} onClick={remove}>
              {removing ? 'Removing…' : `Remove ${first}`}
            </Button>
            <Button variant="outline" block size="lg" onClick={() => setSheet(null)}>
              Keep linked
            </Button>
          </>
        }
      >
        <p className="font-body text-[14px] text-ink">
          This removes the link between your parent account and {first}’s student account. You will stop
          seeing their classes and paying for them here.
        </p>
        <p className="font-body text-[14px] text-ink-muted">
          Their account and class history stay as they are, and they can still log in on their own. To
          link again you would send a new invite.
        </p>
        {removeError ? (
          <p role="alert" className="font-body text-[13px] font-extrabold text-danger">
            {removeError}
          </p>
        ) : null}
      </Sheet>
    </DetailScreen>
  );
}

/* ── Messages: port of ChildMessageHistory (§9.4) ───────────────────────── */

type Message = { id: string; fromChild: boolean; text: string; at: string };
type Thread = { id: string; tutorId?: string; tutorName: string; tutorAvatar: string | null; messages: Message[] };

function ChildMessagesV2({ childId, first }: { childId: string; first: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Thread | null>(null);

  useEffect(() => {
    fetch(`/api/parent/children/${childId}/messages`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setThreads(j.threads ?? []);
          setSince(j.since ?? null);
        }
      })
      .finally(() => setLoaded(true));
  }, [childId]);

  const sinceLabel = since
    ? new Date(since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
    : null;

  if (!loaded) return <div className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" />;

  return (
    <>
      <p className="font-body text-[13px] text-ink-muted">
        {first} can see that you have access to these conversations. You are reading them, not taking part.
        {sinceLabel ? ` Messages from ${sinceLabel} onward; anything earlier stays private.` : ' Anything sent before you were linked stays private.'}
      </p>
      {threads.length === 0 ? (
        <EmptyCard title="No messages yet" body={`When ${first} messages a teacher, the conversation appears here.`} />
      ) : (
        threads.map((t) => (
          <NavRow
            key={t.id}
            onClick={() => setOpen(t)}
            tile={
              <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-surface-sunken font-display text-[15px] font-extrabold text-ink">
                {t.tutorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.tutorAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  t.tutorName.charAt(0).toUpperCase()
                )}
              </span>
            }
            title={t.tutorName}
            meta={
              t.messages.length === 0
                ? 'Nothing since you were linked'
                : `${t.messages.length} ${t.messages.length === 1 ? 'message' : 'messages'}`
            }
          />
        ))
      )}
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `${first} and ${open.tutorName}` : ''}
        footer={
          <Button variant="outline" block size="lg" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        {open ? (
          <>
            {/* self-start: in the sheet's column the tag would otherwise
                stretch to the full width and read as a banner. */}
            <Tag tone="outline" className="self-start">
              Read only
            </Tag>
            {open.messages.length === 0 ? (
              <p className="font-body text-[14px] text-ink-muted">Nothing since you were linked.</p>
            ) : (
              open.messages.map((m) => (
                <div key={m.id} className={cn('flex', m.fromChild ? 'justify-end' : 'justify-start')}>
                  <div className="max-w-[82%]">
                    <div
                      className={cn(
                        'rounded-ds-card px-ds-3 py-ds-2 font-body text-[14px] leading-[20px] text-ink',
                        m.fromChild ? 'bg-brand' : 'bw-hair border-border bg-surface-sunken'
                      )}
                    >
                      {m.text}
                    </div>
                    <p className={cn('mt-[2px] font-body text-[12px] text-ink-muted', m.fromChild ? 'text-right' : 'text-left')}>
                      {m.fromChild ? first : open.tutorName} · {m.at}
                    </p>
                  </div>
                </div>
              ))
            )}
            <p className="font-body text-[13px] text-ink-muted">
              You cannot reply here. To speak to {open.tutorName},{' '}
              <a
                href={open.tutorId ? `/parent/messages?tutor=${encodeURIComponent(open.tutorId)}` : '/parent/messages'}
                className="ds-link font-extrabold text-ink underline"
              >
                use your own thread in Messages
              </a>
              .
            </p>
          </>
        ) : null}
      </Sheet>
    </>
  );
}

/* ── Spending: port of ChildBillingControls (§7) ────────────────────────── */

type Billing = { selfPayEnabled: boolean; requiresApproval: boolean };

function Switch({ on, busy, onToggle, label }: { on: boolean; busy: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        'relative h-[28px] w-[48px] shrink-0 rounded-ds-full bw-bold border-ink cursor-pointer disabled:opacity-60',
        on ? 'bg-brand' : 'bg-surface-card'
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[20px] w-[20px] rounded-ds-full bg-ink transition-all',
          on ? 'left-[22px]' : 'left-[2px]'
        )}
      />
    </button>
  );
}

function ChildBillingV2({ childId, first }: { childId: string; first: string }) {
  const [state, setState] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/parent/children/${childId}/billing`, { cache: 'no-store' });
      if (res.ok) setState((await res.json()) as Billing);
    } catch {
      /* section shows nothing */
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  const patch = async (body: Record<string, unknown>, key: string, successNote?: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/parent/children/${childId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'That did not save.');
        return;
      }
      if (successNote) setNote(successNote);
      await load();
    } catch {
      setError('That did not save.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="flex items-start justify-between gap-ds-3">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-extrabold text-ink">Ask me before booking</p>
          <p className="font-body text-[13px] text-ink-muted">
            {state.requiresApproval
              ? `${first}’s requests come to you first, including free classes, where you are agreeing to the enrolment.`
              : `${first} can join classes without asking. You will still be notified.`}
          </p>
        </div>
        <Switch
          on={state.requiresApproval}
          busy={busy === 'approval'}
          label={`Booking approval for ${first}`}
          onToggle={() => patch({ requiresApproval: !state.requiresApproval }, 'approval')}
        />
      </div>
      <div className="bw-t-hair border-line-soft" />
      <div className="flex items-start justify-between gap-ds-3">
        <div className="min-w-0">
          <p className="font-display text-[15px] font-extrabold text-ink">Let {first} pay for their own classes</p>
          <p className="font-body text-[13px] text-ink-muted">
            {state.selfPayEnabled
              ? `${first} pays with their own card and no longer needs your approval. This is in effect now.`
              : `${first} cannot pay for classes; every request comes to you.`}
          </p>
        </div>
        <Switch
          on={state.selfPayEnabled}
          busy={busy === 'selfpay'}
          label={`Self-pay for ${first}`}
          onToggle={() =>
            patch(
              { selfPayEnabled: !state.selfPayEnabled },
              'selfpay',
              state.selfPayEnabled
                ? undefined
                : 'Self-pay is on now. We have emailed you about it. If that was not you, change your password and it switches back off.'
            )
          }
        />
      </div>
      <p className="font-body text-[13px] text-ink-muted">
        Turning self-pay on takes effect immediately. A security email goes to you either way, and
        changing your password turns it back off for every child on your account.
      </p>
      {note ? <p role="status" className="font-body text-[13px] font-extrabold text-ink">{note}</p> : null}
      {error ? <p role="alert" className="font-body text-[13px] font-extrabold text-danger">{error}</p> : null}
    </div>
  );
}
