'use client';

/**
 * Student My Classes, new UI — Figma `2:1088`, file rwytRx6xmRHf4AMzpxAznd.
 *
 * DATA (every block has its own endpoint; none of them is new except the
 * first):
 *   /api/student/upcoming      class cards with each class's next time, and
 *                              "Coming up" (group occurrences and confirmed
 *                              1:1s merged).
 *   /api/bookings/my-requests  1:1 requests still waiting on a tutor. They
 *                              join "Coming up" as AWAITING TUTOR rows: the
 *                              old page had a separate section for them, the
 *                              frame has none, and the student-screen map
 *                              folds My Bookings into this tab.
 *   /api/student/attendance    the On time / Late / Missed counts and strip.
 *                              The shared §6 helper, so these numbers match
 *                              the parent's and the tutor's.
 *   /api/student/my-tutors     "Your tutor" cards; Ask for feedback posts to
 *                              /api/feedback/requests, and a used quota is
 *                              explained in the server's own sentence, never
 *                              a bare disabled button (§9.2).
 *
 * Wide screens — PROVISIONAL, no desktop frame: classes and Coming up on the
 * left, attendance and tutors on the right.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CaretRight,
  ChatCircle,
  Check,
  Clock,
  Plus,
  Prohibit,
  X,
} from '@phosphor-icons/react';
import { Button, SubjectTile, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';

const TZ = 'America/Port_of_Spain';
const AST_OFFSET_MS = 4 * 3_600_000;
const STRIP_LENGTH = 9;

type ClassCardData = {
  id: string;
  name: string;
  subject: string | null;
  tutorName: string | null;
  next: { start: string; end: string | null } | null;
};
type UpcomingRow = {
  key: string;
  kind: 'group' | '1:1';
  title: string;
  subject: string | null;
  start: string;
  end: string | null;
  href: string;
};
type PendingRequest = { id: string; tutorName: string; when: string; minutes: number; closed: boolean };
type AttendanceRow = {
  key: string;
  start: string;
  status: 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded';
};
type AttendanceSummary = { attended: number; late: number; absent: number; cancelled: number; excluded: number };
type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  via: string | null;
  quota: { used: boolean; reason: string | null };
};

const fmt = (iso: string, o: Intl.DateTimeFormatOptions, locale = 'en-GB') =>
  new Intl.DateTimeFormat(locale, { ...o, timeZone: TZ }).format(new Date(iso));
const timeOf = (iso: string) => fmt(iso, { hour: 'numeric', minute: '2-digit' }, 'en-US');

function relDays(iso: string) {
  const day = (ms: number) => Math.floor((ms - AST_OFFSET_MS) / 86_400_000);
  const diff = day(new Date(iso).getTime()) - day(Date.now());
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

function minutesBetween(a: string, b: string | null) {
  if (!b) return null;
  const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
  return m > 0 ? m : null;
}

function DateTile({ iso }: { iso: string }) {
  return (
    <span className="flex size-12 shrink-0 flex-col items-center justify-center gap-[2px] rounded-ds-sm bg-ink text-brand">
      <span className="font-display text-[19px] font-black leading-[19px] tabular-nums">{fmt(iso, { day: 'numeric' })}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.8px]">{fmt(iso, { month: 'short' })}</span>
    </span>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('flex flex-col rounded-ds-card bg-surface-card bw-hair border-border p-[17px]', className)}>
      {children}
    </section>
  );
}

function ClassCard({ c }: { c: ClassCardData }) {
  const label = c.subject || c.name;
  return (
    <Link
      href={`/student/classes/${c.id}`}
      className="ds-press flex items-center gap-ds-card rounded-ds-card bg-surface-card bw-hair border-border p-[15px]"
    >
      <SubjectTile code={subjectCode(label)} color={subjectColor(label)} size={64} className="text-[18px] font-black" />
      <span className="flex min-w-0 flex-1 flex-col gap-ds-1h">
        <span className="text-[17px] font-extrabold leading-[20px] text-ink">{c.name}</span>
        <span className="flex flex-wrap gap-ds-1h">
          {c.next ? (
            <>
              <Tag tone="warning" className="text-[13px] normal-case tracking-normal">
                {relDays(c.next.start)}
              </Tag>
              <span className="rounded-ds-xs bw-hair border-border-strong px-[9px] py-ds-1 text-[13px] font-bold text-ink">
                {`${fmt(c.next.start, { weekday: 'short' })} · ${timeOf(c.next.start)}`}
              </span>
            </>
          ) : (
            <span className="text-[13px] text-ink-muted">No class scheduled yet</span>
          )}
        </span>
      </span>
      <CaretRight size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
    </Link>
  );
}

function ComingUp({
  rows,
  pending,
  hasOneToOne,
  loaded,
}: {
  rows: UpcomingRow[];
  pending: PendingRequest[];
  hasOneToOne: boolean;
  loaded: boolean;
}) {
  const rowCls = 'ds-press flex min-h-[68px] items-center gap-ds-card py-[10px]';
  const sep = 'bw-t-hair border-surface-sunken';
  return (
    <Panel className="gap-ds-1h pb-[7px]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">Coming up</h2>
        <Link href="/student/bookings" className="ds-link flex min-h-[44px] items-center text-[15px] font-extrabold text-brand-edge">
          Past lessons
        </Link>
      </div>
      {!loaded ? (
        <div className="h-[68px] animate-pulse rounded-ds-sm bg-surface-sunken" aria-hidden />
      ) : null}
      {rows.map((r, i) => {
        const mins = minutesBetween(r.start, r.end);
        const what = r.kind === 'group' ? `${r.subject || r.title} · group` : `${r.title} · 1:1`;
        return (
          <Link key={r.key} href={r.href} className={cn(rowCls, i > 0 && sep)}>
            <DateTile iso={r.start} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-extrabold text-ink">{what}</span>
              <span className="block text-[14px] text-ink-muted">
                {[fmt(r.start, { weekday: 'short' }), timeOf(r.start), mins ? `${mins} min` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {i === 0 ? <Tag tone="warning">NEXT</Tag> : null}
          </Link>
        );
      })}
      {pending
        .filter((p) => !p.closed)
        .map((p, i) => (
          <Link
            key={p.id}
            href={`/student/bookings/${p.id}`}
            className={cn(rowCls, (rows.length > 0 || i > 0) && sep)}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-ds-sm bw-bold bw-dashed border-ink-faint text-ink">
              <Clock size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-extrabold text-ink">{`1:1 with ${p.tutorName}`}</span>
              <span className="block text-[14px] text-ink-muted">{`${p.when} · ${p.minutes} min`}</span>
            </span>
            <Tag tone="outline">AWAITING TUTOR</Tag>
          </Link>
        ))}
      {loaded && !hasOneToOne ? (
        <Link
          href="/student/find-tutors?tab=tutors"
          className={cn(rowCls, 'min-h-[69px]', (rows.length > 0 || pending.length > 0) && sep)}
        >
          <span className="flex size-[52px] shrink-0 items-center justify-center rounded-ds-sm bw-bold bw-dashed border-ink-faint text-ink">
            <Plus size={20} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold text-ink">No 1:1 lessons booked</span>
            <span className="block text-[14px] text-ink-muted">Book a tutor</span>
          </span>
          <CaretRight size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
        </Link>
      ) : null}
    </Panel>
  );
}

const STRIP_STYLE: Record<AttendanceRow['status'], { cls: string; icon: React.ReactNode; label: string }> = {
  attended: { cls: 'bg-brand text-ink', icon: <Check size={14} weight="bold" />, label: 'On time' },
  late: { cls: 'bg-accent-yellow text-ink', icon: <Clock size={14} weight="bold" />, label: 'Late' },
  absent: { cls: 'bg-danger text-on-ink', icon: <X size={14} weight="bold" />, label: 'Missed' },
  cancelled: { cls: 'bg-surface-sunken text-ink-muted', icon: <Prohibit size={14} />, label: "Didn't run" },
  excluded: { cls: 'bg-surface-sunken text-ink-muted', icon: <Prohibit size={14} />, label: "Didn't count" },
};

function Attendance({ rows, summary }: { rows: AttendanceRow[]; summary: AttendanceSummary | null }) {
  // Oldest on the left, as a timeline reads.
  const strip = rows.slice(0, STRIP_LENGTH).reverse();
  const didntRun = (summary?.cancelled ?? 0) + (summary?.excluded ?? 0);
  const stats: Array<[string, number, string]> = [
    ['On time', summary?.attended ?? 0, 'text-brand-edge'],
    // #8a5f00: the frame's dark amber. accent-yellow is unreadable as text.
    ['Late', summary?.late ?? 0, 'text-[#8a5f00]'],
    ['Missed', summary?.absent ?? 0, 'text-danger'],
  ];
  return (
    <Panel className="gap-ds-card">
      <div className="flex items-baseline justify-between gap-ds-3">
        <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">Attendance</h2>
        <span className="text-[13px] font-bold text-ink-muted">Logged when you tap Join</span>
      </div>
      <div className="flex rounded-ds-sm bw-bold border-ink p-[2px]">
        {stats.map(([label, n, color], i) => (
          <div
            key={label}
            className={cn('flex flex-1 flex-col items-center gap-[2px] px-ds-1 py-ds-3', i === 1 && 'border-x border-solid border-border')}
          >
            <span className={cn('font-display text-[30px] font-black leading-[30px] tabular-nums', color)}>{n}</span>
            <span className="text-[13px] font-bold text-ink-muted">{label}</span>
          </div>
        ))}
      </div>
      {strip.length > 0 ? (
        <div className="flex flex-col gap-ds-1h">
          <div className="flex gap-[5px]">
            {strip.map((r) => {
              const s = STRIP_STYLE[r.status];
              return (
                <span
                  key={r.key}
                  title={`${fmt(r.start, { day: 'numeric', month: 'short' })} · ${s.label}`}
                  className={cn('flex h-[30px] min-w-0 flex-1 items-center justify-center rounded-ds-xs', s.cls)}
                >
                  {s.icon}
                </span>
              );
            })}
          </div>
          <div className="flex justify-between text-[12px] font-bold text-ink-muted">
            <span>{fmt(strip[0].start, { day: 'numeric', month: 'short' })}</span>
            <span>{fmt(strip[strip.length - 1].start, { day: 'numeric', month: 'short' })}</span>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-ink-muted">Your attendance shows here after your first class.</p>
      )}
      {didntRun > 0 ? (
        <p className="m-0 text-[14px] text-ink-muted">
          {didntRun === 1 ? "1 class didn't run, so it doesn't count." : `${didntRun} classes didn't run, so they don't count.`}
        </p>
      ) : null}
    </Panel>
  );
}

function TutorCard({ t, onRequest, busy }: { t: Tutor; onRequest: () => void; busy: boolean }) {
  return (
    <Panel className="gap-ds-card">
      <div className="flex items-center gap-ds-3">
        <span className="flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-ds-sm bg-surface-sunken font-display text-[18px] font-extrabold text-ink">
          {t.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.avatar} alt="" className="size-full object-cover" />
          ) : (
            t.name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-extrabold text-ink">{t.name}</span>
          <span className="block truncate text-[14px] text-ink-muted">{t.via ? `Your ${t.via} tutor` : 'Your tutor'}</span>
        </span>
      </div>
      <div className="flex gap-[10px]">
        <Button size="lg" className="flex-1 px-ds-1h" disabled={t.quota.used || busy} onClick={onRequest}>
          {t.quota.used ? 'Used this month' : 'Ask for feedback'}
        </Button>
        <Link
          href="/student/messages"
          className="ds-press mb-[3px] inline-flex h-12 flex-1 items-center justify-center gap-ds-2 rounded-ds-btn bw-bold border-ink bg-surface-card px-ds-1h text-[15px] font-extrabold text-ink shadow-edge-ink"
        >
          <ChatCircle size={18} aria-hidden />
          Message
        </Link>
      </div>
      {t.quota.used && t.quota.reason ? <p className="m-0 text-[13px] leading-[18px] text-ink-muted">{t.quota.reason}</p> : null}
    </Panel>
  );
}

export default function StudentClassesV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>([]);
  const [hasOneToOne, setHasOneToOne] = useState(true);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [busyTutor, setBusyTutor] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'student') router.push(nonStudentRedirect(profile));
  }, [profile, loading, router]);

  const loadTutors = useCallback(async () => {
    const r = await fetch('/api/student/my-tutors', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setTutors((await r.json()).tutors ?? []);
  }, []);

  const load = useCallback(async () => {
    setError(false);
    const get = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    const [u, p, a] = await Promise.allSettled([
      get('/api/student/upcoming'),
      get('/api/bookings/my-requests'),
      get('/api/student/attendance'),
      loadTutors(),
    ]);
    if (u.status === 'fulfilled') {
      setClasses(u.value.classes ?? []);
      setUpcoming(u.value.upcoming ?? []);
      setHasOneToOne(Boolean(u.value.hasOneToOne));
    } else setError(true);
    if (p.status === 'fulfilled') setPending(p.value.pending ?? []);
    if (a.status === 'fulfilled') {
      setAttendance(a.value.attendance ?? []);
      setSummary(a.value.summary ?? null);
    }
    setLoaded(true);
  }, [loadTutors]);

  useEffect(() => {
    if (profile?.role === 'student') void load();
  }, [profile?.role, load]);

  const requestFeedback = async (tutorId: string) => {
    setBusyTutor(tutorId);
    try {
      const res = await fetch('/api/feedback/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId }),
      });
      const json = await res.json().catch(() => ({}));
      // No timeframe, deliberately (§8.1). A 409 is normally the shared quota.
      setNote(res.ok ? 'Requested. Your tutor will answer when they can.' : json.message ?? 'That could not be requested right now.');
      await loadTutors();
    } finally {
      setBusyTutor(null);
      window.setTimeout(() => setNote(null), 6000);
    }
  };

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center justify-between gap-ds-3">
        <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">My Classes</h1>
        <Link
          href="/student/find-tutors"
          className="ds-press mb-[3px] inline-flex h-12 shrink-0 items-center gap-ds-1h rounded-ds-btn bw-bold border-ink bg-surface-card px-ds-4 text-[15px] font-extrabold text-ink shadow-edge-ink"
        >
          <Plus size={16} weight="bold" aria-hidden />
          Find more
        </Link>
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-ds-3 rounded-ds-card bg-danger-soft bw-hair border-danger p-ds-4">
          <p className="m-0 text-[15px] font-bold text-ink">We couldn&apos;t load your classes.</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : null}

      {note ? (
        <p className="m-0 rounded-ds-card bg-surface-card bw-hair border-brand px-ds-4 py-ds-3 text-[14px] text-ink" role="status">
          {note}
        </p>
      ) : null}

      <div className="flex flex-col gap-ds-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-ds-4">
          {!loaded ? (
            <div className="h-[96px] animate-pulse rounded-ds-card bg-surface-sunken" aria-hidden />
          ) : classes.length === 0 ? (
            <Panel className="items-start gap-ds-2">
              <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">No classes yet</h2>
              <p className="m-0 text-[14px] text-ink-muted">Join a group class and it shows up here, with its next time.</p>
              <Link href="/student/find-tutors" className="ds-link text-[15px] font-extrabold text-brand-edge">
                Explore classes
              </Link>
            </Panel>
          ) : (
            classes.map((c) => <ClassCard key={c.id} c={c} />)
          )}
          <ComingUp rows={upcoming} pending={pending} hasOneToOne={hasOneToOne} loaded={loaded} />
        </div>
        <div className="flex min-w-0 flex-col gap-ds-4">
          {loaded ? <Attendance rows={attendance} summary={summary} /> : null}
          {tutors.map((t) => (
            <TutorCard key={t.id} t={t} busy={busyTutor === t.id} onRequest={() => void requestFeedback(t.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
