'use client';

/**
 * Student Home, new UI — Figma `2:444` (Home) and `31:8667` (K4, first-time
 * home), file `rwytRx6xmRHf4AMzpxAznd`.
 *
 * DATA
 *   /api/student/home        the next class (group occurrence or 1:1, whichever
 *                            is sooner), the three quests, the Finder flag.
 *   /api/student/attendance  the streak and "N sessions · N hours studied".
 *                            The same shared helper as the attendance panel,
 *                            so the two can never disagree.
 *   profile                  name, form, subjects_of_study.
 *
 * STREAK AND QUESTS ARE DERIVED (approved 2026-11-07, no new tables).
 *   Streak  = consecutive weeks (Mon–Sun, Trinidad time) with at least one
 *             class attended, on time or late. The current week only breaks
 *             the run once it is over: a streak does not reset on Monday
 *             morning because Thursday's class has not happened yet.
 *   Quests  = has the student set subjects / joined a class / booked a 1:1.
 *
 * WHAT IS NOT IN THE FRAME, AND WHERE IT WENT (approved 2026-11-07):
 *   credits            the header pill (StudentV2Shell), every width.
 *   Class Match Week   banner + reserved-taster card, lg and up only.
 *   My best matches    link, lg and up only, when the Finder is on.
 *   Reliability panel  dropped from Home.
 *
 * WIDE SCREENS — PROVISIONAL, there is no desktop frame. Two columns from lg:
 * the class and quests (the things to DO) on the left, the streak, subjects
 * and campaign on the right. On a phone the frame's order is kept with
 * `display: contents` + `order`, so one DOM serves both.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CaretRight,
  Fire,
  GraduationCap,
  Plus,
  Sparkle,
  VideoCamera,
} from '@phosphor-icons/react';
import { Button, Countdown, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';
import EditSubjectsModal from '@/components/student/EditSubjectsModal';
import CampaignDashboardBanner from '@/components/classMatchWeek/CampaignDashboardBanner';
import CampaignJoinCard from '@/components/classMatchWeek/CampaignJoinCard';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';

const TZ = 'America/Port_of_Spain';
/** Trinidad is UTC-4 all year (no DST), so a fixed offset gives its calendar. */
const AST_OFFSET_MS = 4 * 3_600_000;
const STREAK_BOXES = 8;

type NextClass = {
  kind: 'group' | '1:1';
  href: string;
  title: string;
  subject: string | null;
  tutorName: string | null;
  tutorAvatarUrl: string | null;
  start: string;
  end: string | null;
};

type HomePayload = {
  next: NextClass | null;
  quests: { subjects: boolean; joinedClass: boolean; bookedTutor: boolean };
  finder: boolean;
};

type AttendanceRow = {
  start: string;
  end: string | null;
  status: 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded';
};

const DOT: Record<ReturnType<typeof subjectColor>, string> = {
  green: 'bg-brand-legacy',
  yellow: 'bg-accent-yellow',
  orange: 'bg-accent-orange',
  sage: 'bg-on-ink-subtle',
};

/** Monday of the AST week containing `ms`, as yyyy-mm-dd. */
function weekKey(ms: number): string {
  const d = new Date(ms - AST_OFFSET_MS);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function prevWeek(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function computeStreak(rows: AttendanceRow[], now = Date.now()) {
  const attended = rows.filter((r) => r.status === 'attended' || r.status === 'late');
  const weeks = new Set(attended.map((r) => weekKey(new Date(r.start).getTime())));
  const thisWeek = weekKey(now);
  const thisWeekDone = weeks.has(thisWeek);
  let streak = 0;
  for (let k = thisWeekDone ? thisWeek : prevWeek(thisWeek); weeks.has(k); k = prevWeek(k)) {
    streak++;
  }
  const minutes = attended.reduce((sum, r) => {
    if (!r.end) return sum;
    const m = (new Date(r.end).getTime() - new Date(r.start).getTime()) / 60_000;
    return m > 0 ? sum + m : sum;
  }, 0);
  return { streak, thisWeekDone, sessions: attended.length, hours: Math.round(minutes / 6) / 10 };
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function weekday(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: TZ }).format(new Date(iso));
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  }).format(d);
  return `${day.replace(',', '')} · ${time}`;
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ---------------------------------------------------------------------------

function NextClassCard({ next, subjects }: { next: NextClass | null; subjects: string[] }) {
  const router = useRouter();
  const now = useNow();

  // K4 — nothing booked yet.
  if (!next) {
    return (
      <section className="flex flex-col gap-ds-card rounded-ds-card bg-ink p-[18px] text-on-ink">
        <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-brand">
          Start here
        </span>
        <h2 className="m-0 font-display text-[24px] font-extrabold leading-[25px] text-on-ink">
          Find your first class
        </h2>
        <p className="m-0 text-[15px] leading-[21px] text-on-ink-muted">
          {subjects.length > 0
            ? `Group classes and 1:1 tutors for ${subjects.slice(0, 2).join(' and ')}.`
            : 'Group classes and 1:1 tutors for your subjects.'}
        </p>
        <Button size="lg" block="always" onClick={() => router.push('/student/find-tutors')}>
          Explore classes
        </Button>
      </section>
    );
  }

  const startMs = new Date(next.start).getTime();
  const left = Math.max(0, startMs - now);
  const live = left === 0;
  const code = subjectCode(next.subject || next.title);

  return (
    <section className="flex flex-col gap-ds-card rounded-ds-card bg-ink p-[18px] text-on-ink">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-brand">
          {live ? 'Live now' : 'Next class'}
        </span>
        <Tag tone="orange">{code}</Tag>
      </div>
      <div className="flex min-w-0 items-center gap-ds-3">
        {next.tutorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={next.tutorAvatarUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-ds-sm object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <h2 className="m-0 truncate font-display text-[24px] font-extrabold leading-[25px] text-on-ink">
            {next.title}
          </h2>
          <p className="m-0 mt-ds-1 truncate text-[15px] text-on-ink-muted">
            {[next.tutorName, whenLabel(next.start)].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <Countdown
        days={Math.floor(left / 86_400_000)}
        hours={Math.floor((left % 86_400_000) / 3_600_000)}
        minutes={Math.floor((left % 3_600_000) / 60_000)}
      />
      <Button size="lg" block="always" onClick={() => router.push(next.href)}>
        {live ? 'Join class' : 'Open class'}
      </Button>
    </section>
  );
}

function StreakCard({
  rows,
  next,
  loaded,
}: {
  rows: AttendanceRow[];
  next: NextClass | null;
  loaded: boolean;
}) {
  const { streak, thisWeekDone, sessions, hours } = useMemo(() => computeStreak(rows), [rows]);

  const line =
    streak === 0
      ? next
        ? `Join ${weekday(next.start)}'s class to start one.`
        : 'Attend a class this week to start one.'
      : thisWeekDone
        ? 'This week counts. See you next week.'
        : 'Attend a class this week to keep it going.';

  return (
    <section className="flex flex-col gap-ds-card rounded-ds-card bg-surface-card bw-hair border-border p-[17px]">
      <div className="flex items-center gap-ds-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-ds-sm bg-accent-orange text-ink">
          <Fire size={24} weight="bold" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[20px] font-extrabold leading-[22px] text-ink">
            {`${streak}-week streak`}
          </h2>
          <p className="m-0 mt-[2px] text-[14px] text-ink-muted">{loaded ? line : ' '}</p>
        </div>
      </div>
      <div className="flex gap-ds-1h" aria-hidden>
        {Array.from({ length: STREAK_BOXES }, (_, i) => {
          const filled = i < streak;
          const target = !filled && !thisWeekDone && i === streak;
          return (
            <span
              key={i}
              className={cn(
                'h-[30px] min-w-0 flex-1 rounded-ds-xs bw-bold',
                filled
                  ? 'border-ink bg-brand'
                  : target
                    ? 'border-ink'
                    : 'bw-dashed border-border-strong'
              )}
            />
          );
        })}
      </div>
      {/* K4 drops this line until there is something to count. */}
      {sessions > 0 ? (
        <p className="m-0 text-[14px] text-ink-muted tabular-nums">
          {`${plural(sessions, 'session')} · ${plural(hours, 'hour')} studied`}
        </p>
      ) : null}
    </section>
  );
}

function QuestRow({
  icon,
  label,
  done,
  first,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  done: boolean;
  first?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={done ? undefined : onClick}
      disabled={done}
      className={cn(
        'ds-press flex min-h-[60px] w-full items-center gap-ds-3 border-0 bg-transparent px-0 py-ds-2 text-left',
        !first && 'bw-t-hair border-surface-sunken',
        done ? 'cursor-default' : 'cursor-pointer'
      )}
    >
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-ds-sm bw-bold',
          done ? 'bw-dashed border-border-strong text-ink-muted' : 'border-ink text-ink'
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 text-[16px] font-bold',
          done ? 'text-ink-muted' : 'text-ink'
        )}
      >
        {label}
      </span>
      {done ? (
        <Tag tone="warning">Done</Tag>
      ) : (
        <CaretRight size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
      )}
    </button>
  );
}

function QuestsCard({
  quests,
  onSubjects,
}: {
  quests: HomePayload['quests'];
  onSubjects: () => void;
}) {
  const router = useRouter();
  const list = [quests.subjects, quests.joinedClass, quests.bookedTutor];
  const done = list.filter(Boolean).length;
  return (
    <section className="flex flex-col gap-[10px] rounded-ds-card bg-surface-card bw-hair border-border px-[17px] pb-[5px] pt-[17px]">
      <div className="flex items-baseline justify-between font-display font-extrabold text-ink">
        <h2 className="m-0 text-[20px]">Quests</h2>
        <span className="text-[15px] tabular-nums" aria-label={`${done} of 3 done`}>
          {`${done} / 3`}
        </span>
      </div>
      <div className="flex gap-ds-1" aria-hidden>
        {list.map((d, i) => (
          <span
            key={i}
            className={cn('h-2 flex-1 rounded-[2px]', d ? 'bg-accent-yellow' : 'bg-line-soft')}
          />
        ))}
      </div>
      <div className="flex flex-col">
        <QuestRow
          first
          icon={<BookOpen size={20} aria-hidden />}
          label="Add your subjects"
          done={quests.subjects}
          onClick={onSubjects}
        />
        <QuestRow
          icon={<VideoCamera size={20} aria-hidden />}
          label="Join your first class"
          done={quests.joinedClass}
          onClick={() => router.push('/student/find-tutors')}
        />
        <QuestRow
          icon={<GraduationCap size={20} aria-hidden />}
          label="Book a 1:1 tutor"
          done={quests.bookedTutor}
          onClick={() => router.push('/student/find-tutors?tab=tutors')}
        />
      </div>
    </section>
  );
}

function SubjectsBlock({ subjects, onEdit }: { subjects: string[]; onEdit: () => void }) {
  return (
    <section className="flex flex-col gap-[10px]">
      <div className="flex items-center justify-between">
        <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">Subjects</h2>
        <button
          type="button"
          onClick={onEdit}
          className="ds-link min-h-[44px] border-0 bg-transparent px-0 text-[15px] font-extrabold text-brand-edge cursor-pointer"
        >
          Edit
        </button>
      </div>
      <div className="flex flex-wrap gap-ds-2">
        {subjects.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-ds-2 rounded-ds-xs bg-surface-card bw-hair border-border px-[15px] py-ds-3 text-[15px] font-bold text-ink"
          >
            <span className={cn('size-[10px] rounded-[2px]', DOT[subjectColor(s)])} aria-hidden />
            {s}
          </span>
        ))}
        <button
          type="button"
          onClick={onEdit}
          className="ds-press inline-flex items-center gap-ds-1h rounded-ds-xs bw-hair bw-dashed border-ink-muted bg-transparent px-[15px] py-ds-3 text-[15px] font-bold text-ink cursor-pointer"
        >
          <Plus size={16} weight="bold" aria-hidden />
          Add
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

export default function StudentHomeV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [home, setHome] = useState<HomePayload | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attLoaded, setAttLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [editSubjects, setEditSubjects] = useState(false);

  // The same gates as the old dashboard: wrong role out, an unfinished
  // self-paying signup back to complete-role.
  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.push('/login');
      return;
    }
    if (profile.role !== 'student') {
      router.push(nonStudentRedirect(profile));
      return;
    }
    if (profile.billing_mode !== 'parent_required' && !profile.form_level) {
      router.push('/signup/complete-role');
    }
  }, [profile, loading, router]);

  const load = useCallback(async () => {
    setError(false);
    const [h, a] = await Promise.allSettled([
      fetch('/api/student/home', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<HomePayload>;
      }),
      fetch('/api/student/attendance', { cache: 'no-store' }).then((r) =>
        r.ok ? r.json() : { attendance: [] }
      ),
    ]);
    if (h.status === 'fulfilled') setHome(h.value);
    else setError(true);
    // The streak is a nicety: if attendance fails, it reads 0 rather than
    // taking the page down with it.
    setAttendance(a.status === 'fulfilled' ? (a.value.attendance ?? []) : []);
    setAttLoaded(true);
  }, []);

  useEffect(() => {
    if (profile?.role === 'student') void load();
  }, [profile?.role, load]);

  const subjects: string[] = profile?.subjects_of_study ?? [];
  const firstName =
    profile?.display_name?.split(' ')[0] || profile?.full_name?.split(' ')[0] || 'there';
  // Quests read the profile live, so adding subjects ticks the first one off
  // before the endpoint is asked again.
  const quests = home
    ? { ...home.quests, subjects: home.quests.subjects || subjects.length > 0 }
    : null;

  return (
    <div className="flex flex-col gap-ds-5 pb-ds-2">
      <div className="flex items-center justify-between gap-ds-3">
        <h1 className="ds-page-title m-0 min-w-0 truncate font-display font-extrabold text-ink">
          {`Hey ${firstName}`}
        </h1>
        {profile?.form_level ? (
          <span className="shrink-0 rounded-[6px] bw-hair border-ink px-[11px] py-[7px] text-[13px] font-bold text-ink">
            {profile.form_level}
          </span>
        ) : null}
      </div>

      {error ? (
        <section className="flex flex-col items-start gap-ds-3 rounded-ds-card bg-danger-soft bw-hair border-danger p-ds-4">
          <p className="m-0 text-[15px] font-bold text-ink">We couldn&apos;t load your classes.</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </section>
      ) : null}

      {/* Phone: one column in the frame's order (next, streak, quests,
          subjects). lg: the two wrappers become columns. */}
      <div className="flex flex-col gap-ds-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-ds-5">
          <div className="order-1 lg:order-none">
            {home ? (
              <NextClassCard next={home.next} subjects={subjects} />
            ) : (
              <div className="h-[292px] animate-pulse rounded-ds-card bg-ink/90" aria-hidden />
            )}
          </div>
          <div className="order-3 lg:order-none">
            {quests ? (
              <QuestsCard quests={quests} onSubjects={() => setEditSubjects(true)} />
            ) : (
              <div className="h-[260px] animate-pulse rounded-ds-card bg-surface-sunken" aria-hidden />
            )}
          </div>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-ds-5">
          <div className="order-2 lg:order-none">
            <StreakCard rows={attendance} next={home?.next ?? null} loaded={attLoaded && !!home} />
          </div>
          <div className="order-4 lg:order-none">
            <SubjectsBlock subjects={subjects} onEdit={() => setEditSubjects(true)} />
          </div>
          {/* lg and up only (approved 2026-11-07). PROVISIONAL: no frame. */}
          {home?.finder ? (
            <button
              type="button"
              onClick={() => router.push('/student/matches')}
              className="ds-press order-5 hidden w-full items-center gap-ds-3 rounded-ds-card bg-surface-card bw-hair border-border p-ds-4 text-left cursor-pointer lg:order-none lg:flex"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-ds-sm bg-accent-yellow text-ink">
                <Sparkle size={22} weight="bold" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold text-ink">My best matches</span>
                <span className="block text-[14px] text-ink-muted">
                  Tutors picked for your subjects
                </span>
              </span>
              <CaretRight size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
            </button>
          ) : null}
          <div className="order-6 hidden flex-col gap-ds-3 lg:order-none lg:flex">
            {/* Both render nothing when no campaign is live (kill switch). */}
            <CampaignJoinCard />
            <CampaignDashboardBanner />
          </div>
        </div>
      </div>

      {profile ? (
        // Old-UI modal, kept until Settings is rebuilt (flow 6).
        <EditSubjectsModal
          isOpen={editSubjects}
          onClose={() => setEditSubjects(false)}
          currentSubjects={subjects}
          userId={profile.id}
          onSuccess={() => window.location.reload()}
        />
      ) : null}
    </div>
  );
}
