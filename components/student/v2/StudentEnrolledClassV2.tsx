'use client';

/**
 * Enrolled class page, new UI — /student/classes/[groupId].
 * Figma (file rwytRx6xmRHf4AMzpxAznd): Sessions 2:1290, Members 2:1434, and the
 * states C1 before it starts 31:2602, C2 live 31:2715, C3 joining late 31:2820,
 * C4 ended 31:2948, C5 didn't run 31:3046, C6 stream post 31:3153, C7 leave
 * 31:3246, C8b feedback requested 31:3512.
 *
 * DATA — the same endpoints the old page reads, nothing new:
 *   GET /api/groups/[id]                class, tutor, membership, venue, link
 *   GET /api/groups/[id]/sessions       series + occurrences (with status)
 *   session_attendance_log              this student's own rows (RLS)
 *   GET /api/groups/[id]/stream         tutor posts
 *   GET /api/groups/[id]/members        roster
 *   useClassLink                        the polled class link (fallback)
 *
 * JOIN. The old page's Join was a plain link, so a tap was never recorded and
 * "Logged when you tap Join" on My Classes had nothing behind it from here. Join
 * now goes through POST …/occurrences/[id]/join-link, which records the click
 * (on time / late) and returns the series link; if that fails the polled class
 * link is used so a student is never stuck outside a live class.
 *
 * Join opens 10 minutes before the start (C1 "Join opens at 6:20 PM"). Joining
 * more than 5 minutes after the start asks first (C3): it marks them late.
 *
 * PROVISIONAL (no frame): the hero shows the class banner above the card when
 * the tutor has one; the ⋯ menu (message tutor, WhatsApp/Classroom, rate,
 * leave); the Past list and blocked-state cards (suspended / removed / lapsed,
 * same wording as the old page).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowSquareOut,
  BookOpen,
  ChatCircle,
  CheckCircle,
  Clock,
  DotsThree,
  DownloadSimple,
  Info,
  LinkSimple,
  Lock,
  MapPin,
  PushPin,
  SignOut,
  Star,
  VideoCamera,
  WhatsappLogo,
  GoogleLogo,
} from '@phosphor-icons/react';
import { Button, Tag, type SubjectColor } from '@/components/ui';
import { DsPortal } from '@/components/ui/DsPortal';
import { Sheet } from '@/components/parent/v2/Sheet';
import { ClassCover } from '@/components/parent/v2/ClassCover';
import { subjectColor } from '@/components/parent/v2/subjectTile';
import { isDefaultThumbnail } from '@/lib/defaultThumbnails';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useClassLink } from '@/lib/hooks/useClassLink';
import { supabase } from '@/lib/supabase/client';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';
import { CATEGORIES, ClassRatingFlow, ClassRatingsSection, Stars, type ExistingClassReview } from '@/components/ratings/v2/ClassRating';

const TZ = 'America/Port_of_Spain';
const JOIN_EARLY_MS = 10 * 60_000;
const LATE_AFTER_MS = 5 * 60_000;
const RECENT_MS = 12 * 3_600_000;
const SOON_MS = 24 * 3_600_000;

const FILL: Record<SubjectColor, string> = {
  green: 'bg-brand-edge',
  yellow: 'bg-accent-yellow',
  orange: 'bg-accent-orange',
  sage: 'bg-on-ink-muted',
};

type MemberState = 'active' | 'suspended' | 'banned' | 'lapsed';
type Venue = {
  name: string;
  region: { name: string } | null;
  address_line: string | null;
  access_instructions: string | null;
  arrival_notes: string | null;
  address_hidden?: boolean;
} | null;
type Group = {
  id: string;
  name: string;
  subject: string | null;
  tutorId: string;
  tutorName: string;
  tutorAvatar: string | null;
  cover: string | null;
  whatsapp: string | null;
  classroom: string | null;
  classFormat: 'online' | 'physical' | 'hybrid';
  venue: Venue;
  seat: 'online' | 'physical' | null;
};
type Occ = {
  id: string;
  sessionId: string;
  start: number;
  end: number;
  minutes: number;
  cancelled: boolean;
  attendance: 'attended' | 'late' | 'missed' | null;
};
type Post = {
  id: string;
  title: string;
  body: string;
  at: string | null;
  pinned: boolean;
  attachment: { name: string; url: string } | null;
  link: string | null;
};
type Member = { id: string; name: string; joined: string | null; self: boolean };

const fmt = (ms: number, o: Intl.DateTimeFormatOptions, locale = 'en-GB') =>
  new Intl.DateTimeFormat(locale, { ...o, timeZone: TZ }).format(new Date(ms));
const time = (ms: number) => fmt(ms, { hour: 'numeric', minute: '2-digit' }, 'en-US');
const weekday = (ms: number) => fmt(ms, { weekday: 'long' });
const dayShort = (ms: number) => `${fmt(ms, { weekday: 'short' })} ${fmt(ms, { day: 'numeric', month: 'short' })}`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

function until(ms: number, now: number) {
  const m = Math.max(1, Math.round((ms - now) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function ago(iso: string | null, now: number) {
  if (!iso) return '';
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return fmt(new Date(iso).getTime(), { day: 'numeric', month: 'short' });
}

const URL_LINE = /^https?:\/\/\S+$/;

// ---------------------------------------------------------------------------

export default function StudentEnrolledClassV2({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [group, setGroup] = useState<Group | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [memberState, setMemberState] = useState<MemberState>('active');
  const [rawStatus, setRawStatus] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [suspendedUntil, setSuspendedUntil] = useState<number | null>(null);
  const [lapsedUntil, setLapsedUntil] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [initialLink, setInitialLink] = useState<string | null>(null);
  const [occs, setOccs] = useState<Occ[] | null>(null);
  const [tab, setTab] = useState<'sessions' | 'stream' | 'members'>('sessions');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  // This student's rating of this class: 'open' = may rate now, 'rated' =
  // already did (editable), 'hidden' = not yet (no session joined) or n/a.
  const [myRating, setMyRating] = useState<{ state: 'loading' | 'open' | 'rated' | 'hidden'; existing: ExistingClassReview | null }>({
    state: 'loading',
    existing: null,
  });
  const [rateOpen, setRateOpen] = useState(false);

  const loadMyRating = useCallback(async () => {
    try {
      const res = await fetch('/api/student/ratings', { cache: 'no-store' });
      const d = res.ok ? await res.json() : null;
      const data = d?.data ?? d;
      const rated = (data?.rated?.classes ?? []).find((c: any) => c.groupId === groupId);
      if (rated) {
        setMyRating({
          state: 'rated',
          existing: { id: rated.id, patience: rated.patience, explanation: rated.explanation, classMaterial: rated.classMaterial, rating: rated.rating, comment: rated.comment },
        });
        return;
      }
      const todo = (data?.toRate?.classes ?? []).find((c: any) => c.groupId === groupId);
      setMyRating({ state: todo && !todo.needsFirstSession ? 'open' : 'hidden', existing: null });
    } catch {
      setMyRating({ state: 'hidden', existing: null });
    }
  }, [groupId]);

  useEffect(() => {
    if (profile?.role === 'student') void loadMyRating();
  }, [profile?.role, loadMyRating]);

  const onRated = (message: string) => {
    setRateOpen(false);
    setToast({ title: message, body: "It shows on your tutor's profile and this class." });
    void loadMyRating();
  };

  const classLink = useClassLink(groupId, initialLink, !!group && memberState === 'active');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { cache: 'no-store' });
      if (!res.ok) return setStatus('missing');
      const payload = await res.json();
      const g = payload?.group ?? payload?.data?.group;
      if (!g) return setStatus('missing');

      // Membership, exactly as the old page reads it (see its comments).
      const m = g.current_user_membership;
      const s: string = m?.status ?? 'removed';
      setRawStatus(m?.status ?? null);
      const susp = m?.suspended_until ? new Date(m.suspended_until).getTime() : null;
      const suspActive = susp !== null && susp > Date.now();
      const lapse = g.viewer_membership?.lapsed_secure_spot ?? null;
      const lapsed = !!lapse && (s === 'removed' || !m);
      setLapsedUntil(lapsed ? lapse.release_date ?? null : null);
      setMonthly(typeof g.price_monthly === 'number' ? g.price_monthly : Number(g.price_monthly) || null);
      setMemberState(
        (s === 'suspended' || s === 'suspended_payment') && suspActive
          ? 'suspended'
          : lapsed
            ? 'lapsed'
            : s === 'approved' || s === 'active' || s === 'invited'
              ? 'active'
              : 'banned'
      );
      setReason(m?.action_reason ?? null);
      setSuspendedUntil(suspActive ? susp : null);
      setInitialLink(g.meeting_link ?? null);

      const t = Array.isArray(g.tutor) ? g.tutor[0] : g.tutor;
      const cover = [g.cover_image, g.header_image].find((x: unknown) => typeof x === 'string' && x && !isDefaultThumbnail(x)) ?? null;
      setGroup({
        id: g.id,
        name: g.name,
        subject: g.subject ?? null,
        tutorId: g.tutor_id,
        tutorName: t?.display_name || t?.full_name || 'Your tutor',
        tutorAvatar: t?.avatar_url ?? null,
        cover,
        whatsapp: g.whatsapp_link ?? g.whatsapp_url ?? null,
        classroom: g.google_classroom_link ?? null,
        classFormat: g.class_format === 'physical' || g.class_format === 'hybrid' ? g.class_format : 'online',
        venue: g.venue ?? null,
        seat: g.viewer_membership?.seat_type ?? null,
      });
      setStatus('ready');
    } catch {
      setStatus('missing');
    }
  }, [groupId]);

  const loadSessions = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions`, { cache: 'no-store' });
      const d = await res.json();
      const raw: any[] = d.sessions ?? d.data ?? [];
      const list: Occ[] = raw.flatMap((s: any) =>
        (s.occurrences ?? []).map((o: any) => {
          const start = new Date(o.scheduled_start_at).getTime();
          const minutes = s.duration_minutes ?? 60;
          const end = o.scheduled_end_at ? new Date(o.scheduled_end_at).getTime() : start + minutes * 60_000;
          return {
            id: o.id,
            sessionId: s.id,
            start,
            end,
            minutes: Math.round((end - start) / 60_000) || minutes,
            cancelled: o.status === 'cancelled' || !!o.cancelled_at,
            attendance: null,
          } as Occ;
        })
      );
      list.sort((a, b) => a.start - b.start);
      const pastIds = list.filter((o) => o.end < Date.now() && !o.cancelled).map((o) => o.id);
      if (pastIds.length) {
        const { data } = await supabase
          .from('session_attendance_log')
          .select('occurrence_id, status')
          .eq('student_id', userId)
          .in('occurrence_id', pastIds);
        const map = new Map<string, Occ['attendance']>();
        for (const a of (data ?? []) as Array<{ occurrence_id: string; status: string }>) {
          map.set(a.occurrence_id, a.status === 'attended' ? 'attended' : a.status === 'late' ? 'late' : a.status === 'absent' ? 'missed' : null);
        }
        for (const o of list) if (map.has(o.id)) o.attendance = map.get(o.id) ?? null;
      }
      setOccs(list);
    } catch {
      setOccs([]);
    }
  }, [groupId]);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) {
      router.push('/login');
      return;
    }
    if (profile.role !== 'student') {
      router.replace(nonStudentRedirect(profile));
      return;
    }
    void loadGroup();
    void loadSessions(profile.id);
    fetch(`/api/groups/${groupId}/members`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const raw: any[] = d.members ?? d.data ?? [];
        setMembers(
          raw.map((m: any) => {
            const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
            return {
              id: m.id,
              name: p?.display_name || p?.full_name || 'Student',
              joined: m.joined_at ?? null,
              self: m.user_id === profile.id,
            };
          })
        );
      })
      .catch(() => setMembers([]));
  }, [profile, profileLoading, groupId, router, loadGroup, loadSessions]);

  if (status === 'loading' || profileLoading) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        <div className="h-[44px] w-40 animate-pulse rounded-ds-sm bg-surface-sunken" />
        <div className="h-[260px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[48px] animate-pulse rounded-ds-sm bg-surface-sunken" />
      </div>
    );
  }
  if (status === 'missing' || !group) {
    return (
      <section className="flex flex-col items-start gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
        <h1 className="m-0 font-display text-[22px] font-extrabold text-ink">Class not found</h1>
        <p className="m-0 text-[15px] text-ink-muted">It may have been removed, or the link is wrong.</p>
        <Link href="/student/classes" className="ds-link text-[15px] font-extrabold text-brand-edge">
          My Classes
        </Link>
      </section>
    );
  }

  const blocked = memberState !== 'active';
  const inPerson = group.seat === 'physical' || (group.seat === null && group.classFormat === 'physical');

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center justify-between gap-ds-3">
        <Link href="/student/classes" className="ds-link inline-flex min-h-[44px] items-center gap-ds-2 text-[16px] font-extrabold text-ink">
          <ArrowLeft size={20} weight="bold" aria-hidden />
          My Classes
        </Link>
        <span className="flex items-center gap-ds-1">
        {/* Phones: the rating lives behind this star (the card is lg only). */}
        {!blocked && (myRating.state === 'open' || myRating.state === 'rated') ? (
          <button
            type="button"
            onClick={() => setRateOpen(true)}
            aria-label={myRating.state === 'open' ? `Rate ${group.tutorName.split(' ')[0]}` : 'Your rating'}
            className="ds-press relative flex size-11 items-center justify-center rounded-ds-sm border-0 bg-transparent text-ink cursor-pointer lg:hidden"
          >
            <Star size={24} weight={myRating.state === 'rated' ? 'fill' : 'bold'} className={myRating.state === 'rated' ? 'text-accent-orange' : undefined} aria-hidden />
            {myRating.state === 'open' ? <span className="absolute right-[8px] top-[8px] size-2.5 rounded-ds-full bg-accent-orange" aria-hidden /> : null}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="More options"
          className="ds-press flex size-11 items-center justify-center rounded-ds-sm border-0 bg-transparent text-ink cursor-pointer"
        >
          <DotsThree size={26} weight="bold" aria-hidden />
        </button>
        </span>
      </div>

      <div className="flex flex-col gap-ds-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-ds-6">
        <div className="flex min-w-0 flex-col gap-ds-4">
          {group.cover ? <ClassCover image={group.cover} subject={group.subject || group.name} className="aspect-[4/1] rounded-ds-card" /> : null}
          <Hero
            group={group}
            occs={occs}
            now={now}
            blocked={blocked}
            inPerson={inPerson}
            members={members}
            fallbackLink={classLink.link}
            onToast={setToast}
          />
          {!blocked && (myRating.state === 'open' || myRating.state === 'rated') ? (
            <RatingCard groupId={groupId} group={group} existing={myRating.existing} onDone={onRated} />
          ) : null}
          {!blocked ? <ClassRatingsSection source={{ kind: 'group', id: groupId }} className="hidden lg:flex" /> : null}
          {blocked ? (
            <BlockedCard
              state={memberState}
              rawStatus={rawStatus}
              reason={reason}
              suspendedUntil={suspendedUntil}
              lapsedUntil={lapsedUntil}
              monthly={monthly}
              group={group}
            />
          ) : null}
        </div>

        {!blocked ? (
          <div className="flex min-w-0 flex-col gap-ds-4">
            <div className="grid grid-cols-3 gap-ds-2" role="tablist" aria-label="Class sections">
              {(['sessions', 'stream', 'members'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'h-12 rounded-ds-sm bw-bold font-body text-[15px] font-extrabold capitalize cursor-pointer',
                    tab === t ? 'border-ink bg-ink text-on-ink' : 'ds-press border-border-strong bg-surface-card text-ink'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === 'sessions' ? <SessionsPanel occs={occs} now={now} inPerson={inPerson} venue={group.venue} /> : null}
            {tab === 'stream' ? <StreamPanel groupId={groupId} group={group} now={now} /> : null}
            {tab === 'members' ? <MembersPanel members={members} /> : null}
          </div>
        ) : null}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={group.name}>
        <div className="flex flex-col">
          <MenuRow href="/student/messages" icon={<ChatCircle size={20} weight="bold" aria-hidden />} label={`Message ${group.tutorName.split(' ')[0]}`} />
          {!blocked && group.whatsapp ? (
            <MenuRow href={group.whatsapp} external icon={<WhatsappLogo size={20} weight="bold" aria-hidden />} label="Class WhatsApp group" />
          ) : null}
          {!blocked && group.classroom ? (
            <MenuRow href={group.classroom} external icon={<GoogleLogo size={20} weight="bold" aria-hidden />} label="Google Classroom" />
          ) : null}
          <MenuRow href="/student/ratings" icon={<Star size={20} weight="bold" aria-hidden />} label="Rate this class" />
          {memberState === 'active' || memberState === 'suspended' ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setLeaveOpen(true);
              }}
              className="ds-press flex min-h-[56px] w-full items-center gap-ds-3 bw-t-hair border-line-soft border-x-0 border-b-0 bg-transparent px-0 text-left font-body text-[16px] font-extrabold text-danger cursor-pointer"
            >
              <SignOut size={20} weight="bold" aria-hidden />
              Leave class
            </button>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={rateOpen}
        onClose={() => setRateOpen(false)}
        title={myRating.existing ? 'Edit your rating' : `Rate ${group.tutorName.split(' ')[0]}`}
      >
        <p className="m-0 text-[14px] text-ink-muted">{group.name}</p>
        {rateOpen ? (
          <ClassRatingFlow
            groupId={groupId}
            tutorFirstName={group.tutorName.split(' ')[0]}
            existing={myRating.existing}
            onDone={onRated}
            onCancel={() => setRateOpen(false)}
          />
        ) : null}
      </Sheet>

      <LeaveSheet open={leaveOpen} onClose={() => setLeaveOpen(false)} groupId={groupId} group={group} />

      {toast ? (
        <DsPortal>
          <div role="status" className="fixed inset-x-0 top-ds-3 z-[60] flex justify-center px-ds-4">
            <div className="flex w-full max-w-[420px] items-start gap-ds-3 rounded-ds-card bg-ink p-ds-3 text-on-ink shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm bg-brand text-ink">
                <CheckCircle size={20} weight="bold" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[16px] font-extrabold">{toast.title}</span>
                <span className="block text-[14px] text-on-ink-muted">{toast.body}</span>
              </span>
            </div>
          </div>
        </DsPortal>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero (C1–C5)

function Hero({
  group,
  occs,
  now,
  blocked,
  inPerson,
  members,
  fallbackLink,
  onToast,
}: {
  group: Group;
  occs: Occ[] | null;
  now: number;
  blocked: boolean;
  inPerson: boolean;
  members: Member[] | null;
  fallbackLink: string | null;
  onToast: (t: { title: string; body: string }) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lateOpen, setLateOpen] = useState(false);
  const [asking, setAsking] = useState(false);

  const live = occs?.find((o) => !o.cancelled && now >= o.start - JOIN_EARLY_MS && now <= o.end) ?? null;
  const next = occs?.find((o) => !o.cancelled && o.start > now && o.id !== live?.id) ?? null;
  const last = occs ? [...occs].reverse().find((o) => o.end < now) ?? null : null;
  const recent = last && now - last.end < RECENT_MS ? last : null;

  type Mode = 'loading' | 'live' | 'soon' | 'ended' | 'didntrun' | 'today' | 'later' | 'none';
  const mode: Mode = occs === null
    ? 'loading'
    : live
      ? now >= live.start ? 'live' : 'soon'
      : recent
        ? recent.cancelled ? 'didntrun' : 'ended'
        : next
          ? next.start - now < SOON_MS ? 'today' : 'later'
          : 'none';

  const join = async (occ: Occ) => {
    setLateOpen(false);
    setJoinError(null);
    setJoining(true);
    // Open the tab inside the tap, before any await: phones block a window
    // opened after a network round-trip.
    const win = window.open('', '_blank');
    try {
      const res = await fetch(`/api/groups/${group.id}/sessions/${occ.sessionId}/occurrences/${occ.id}/join-link`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      const url: string | null = (res.ok && typeof d?.join_url === 'string' && d.join_url) || fallbackLink;
      if (!url) {
        win?.close();
        setJoinError("Your tutor hasn't shared the class link yet. It appears here as soon as they do.");
        return;
      }
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      if (fallbackLink && win) win.location.href = fallbackLink;
      else {
        win?.close();
        setJoinError('Could not open the class. Check your connection and try again.');
      }
    } finally {
      setJoining(false);
    }
  };

  const tapJoin = () => {
    if (!live) return;
    if (now > live.start + LATE_AFTER_MS) setLateOpen(true);
    else void join(live);
  };

  const askFeedback = async () => {
    setAsking(true);
    try {
      const res = await fetch('/api/feedback/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId: group.tutorId }),
      });
      const j = await res.json().catch(() => ({}));
      onToast(
        res.ok
          ? { title: 'Feedback requested', body: "You'll get a notification when they reply." }
          : { title: 'Already asked this month', body: j.message ?? 'That could not be requested right now.' }
      );
    } finally {
      setAsking(false);
    }
  };

  // The green hero sits on the DS's dark green (brand-edge), so its text and
  // translucent fills flip to the on-ink set. Yellow/orange/sage stay as they were.
  const deep = subjectColor(group.subject || group.name) === 'green';
  const fg = deep ? 'text-on-ink' : 'text-ink';
  const fgSoft = deep ? 'text-on-ink-muted' : 'text-ink/80';
  const wash = deep ? 'bg-white/10' : 'bg-ink/10';

  const strip = (dark: boolean, children: React.ReactNode) => (
    <div
      className={cn(
        'flex min-h-[44px] flex-wrap items-center gap-x-ds-2 gap-y-ds-1 rounded-ds-sm px-ds-3 py-ds-2 text-[15px] font-extrabold',
        dark ? 'bg-ink text-on-ink' : cn(wash, fg)
      )}
    >
      {children}
    </div>
  );
  const locked = (label: string, icon = true) => (
    <div className={cn('flex h-12 w-full items-center justify-center gap-ds-2 rounded-ds-btn bw-bold font-body text-[16px] font-extrabold', deep ? 'border-white/15 bg-white/10 text-on-ink-muted' : 'border-ink/10 bg-surface-card/60 text-ink-muted')}>
      {icon ? <Lock size={18} weight="bold" aria-hidden /> : null}
      {label}
    </div>
  );
  const darkBtn = (label: string, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <Button variant="dark" size="lg" block="always" className="text-[16px]" disabled={disabled} onClick={onClick}>
      {icon}
      {label}
    </Button>
  );

  const directions =
    inPerson && group.venue?.address_line
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${group.venue.name}, ${group.venue.address_line}`)}`
      : null;
  const inPersonAction = (
    <div className="flex flex-col gap-ds-2">
      <div className={cn('flex min-h-[48px] items-center gap-ds-2 rounded-ds-sm px-ds-3 text-[15px] font-extrabold', wash, fg)}>
        <MapPin size={18} weight="bold" aria-hidden />
        {group.venue ? `In person at ${group.venue.name}` : 'In person'}
      </div>
      {directions ? (
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="ds-press inline-flex h-12 items-center justify-center gap-ds-2 rounded-ds-btn bw-bold border-ink bg-ink font-body text-[16px] font-extrabold text-on-ink no-underline"
        >
          <ArrowSquareOut size={18} weight="bold" aria-hidden /> Directions
        </a>
      ) : null}
    </div>
  );

  const roster = members ?? [];
  const att = recent?.attendance;

  return (
    <section className={cn('flex flex-col gap-ds-4 rounded-ds-card p-ds-card', FILL[subjectColor(group.subject || group.name)])}>
      <div className="flex items-start gap-ds-3">
        <div className="min-w-0 flex-1">
          <p className={cn('m-0 text-[12px] font-extrabold uppercase tracking-[0.12em]', fg)}>
            {(group.subject || 'Class').toUpperCase()} · Group
          </p>
          <h1 className={cn('m-0 mt-ds-1 font-display text-[clamp(26px,6vw,32px)] font-extrabold leading-[1.08]', fg)}>{group.name}</h1>
          <p className={cn('m-0 mt-ds-1 text-[15px] font-bold', fgSoft)}>with {group.tutorName}</p>
        </div>
        {group.tutorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.tutorAvatar} alt="" className="size-16 shrink-0 rounded-ds-sm bw-bold border-ink object-cover" />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-ds-sm bw-bold border-ink bg-surface-card font-display text-[20px] font-black text-ink">
            {initials(group.tutorName)}
          </span>
        )}
      </div>

      {blocked ? null : mode === 'loading' ? (
        <div className="h-[104px] animate-pulse rounded-ds-sm bg-ink/10" />
      ) : mode === 'live' && live ? (
        <>
          {strip(true, (
            <>
              <Tag tone="warning">Live now</Tag>
              <span>Started {time(live.start)} · {live.minutes} min</span>
            </>
          ))}
          {inPerson ? inPersonAction : darkBtn(joining ? 'Opening…' : 'Join now', tapJoin, <VideoCamera size={20} weight="bold" aria-hidden />, joining)}
        </>
      ) : mode === 'soon' && live ? (
        <>
          {strip(false, (
            <>
              <Clock size={18} weight="bold" aria-hidden />
              <span>Starts in {until(live.start, now)} · {fmt(live.start, { weekday: 'short' })} {time(live.start)}</span>
            </>
          ))}
          {inPerson ? inPersonAction : darkBtn(joining ? 'Opening…' : 'Join class', tapJoin, <VideoCamera size={20} weight="bold" aria-hidden />, joining)}
        </>
      ) : mode === 'ended' && recent ? (
        <>
          {strip(true, (
            <>
              {att === 'attended' ? <Tag tone="brand">On time</Tag> : att === 'late' ? <Tag tone="warning">Late</Tag> : att === 'missed' ? <Tag tone="danger">Missed</Tag> : null}
              <span>Class ended {time(recent.end)}</span>
            </>
          ))}
          {darkBtn(asking ? 'Asking…' : 'Ask for feedback', () => void askFeedback(), <ChatCircle size={20} weight="bold" aria-hidden />, asking)}
        </>
      ) : mode === 'didntrun' && recent ? (
        <>
          {strip(true, (
            <>
              <Tag tone="outline">Didn&apos;t run</Tag>
              <span>{dayShort(recent.start)} was cancelled</span>
            </>
          ))}
          {locked(next ? `Next class ${dayShort(next.start)} · ${time(next.start)}` : 'No next class yet', false)}
        </>
      ) : mode === 'today' && next ? (
        <>
          {strip(false, (
            <>
              <Clock size={18} weight="bold" aria-hidden />
              <span>Starts in {until(next.start, now)} · {fmt(next.start, { weekday: 'short' })} {time(next.start)}</span>
            </>
          ))}
          {inPerson ? inPersonAction : locked(`Join opens at ${time(next.start - JOIN_EARLY_MS)}`)}
        </>
      ) : mode === 'later' && next ? (
        <>
          <div className="flex items-center gap-ds-3">
            {roster.length ? (
              <span className="flex" aria-hidden>
                {roster.slice(0, 3).map((m, i) => (
                  <span
                    key={m.id}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-ds-xs bw-bold border-ink font-display text-[12px] font-black',
                      i > 0 && '-ml-[6px]',
                      i % 3 === 0 ? 'bg-ink text-brand' : i % 3 === 1 ? 'bg-surface-card text-ink' : 'bg-brand text-ink'
                    )}
                  >
                    {initials(m.name)}
                  </span>
                ))}
              </span>
            ) : null}
            <span className={cn('text-[15px] font-extrabold', fg)}>
              {roster.length ? `${roster.length} ${roster.length === 1 ? 'student' : 'students'} · ` : ''}
              {fmt(next.start, { weekday: 'short' })} {time(next.start)}
            </span>
          </div>
          {inPerson ? inPersonAction : locked(`Join opens ${fmt(next.start, { weekday: 'short' })} ${time(next.start - JOIN_EARLY_MS)}`)}
        </>
      ) : (
        <p className={cn('m-0 rounded-ds-sm px-ds-3 py-ds-3 text-[15px] font-bold', wash, fg)}>
          No class scheduled yet. Your tutor will add the next one.
        </p>
      )}

      {joinError ? (
        <p role="alert" className="m-0 rounded-ds-sm bg-surface-card px-ds-3 py-ds-2 text-[14px] font-bold text-ink">
          {joinError}
        </p>
      ) : null}

      {/* C3 — joining late */}
      <Sheet
        open={lateOpen}
        onClose={() => setLateOpen(false)}
        title={live ? `Class started ${Math.max(1, Math.round((now - live.start) / 60_000))} min ago` : 'Class started'}
        footer={
          <>
            <Button variant="dark" size="lg" disabled={joining} onClick={() => live && void join(live)}>
              <VideoCamera size={20} weight="bold" aria-hidden /> Join now
            </Button>
            <Button variant="outline" size="lg" onClick={() => setLateOpen(false)}>
              Not now
            </Button>
          </>
        }
      >
        <p className="m-0 text-[15px] text-ink-muted">Joining now marks you as late for this session.</p>
      </Sheet>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sessions (2:1290, C4, C5)

function DateTile({ ms, tone }: { ms: number; tone: 'next' | 'plain' | 'muted' }) {
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 flex-col items-center justify-center gap-[2px] rounded-ds-sm',
        tone === 'next' && 'bg-ink text-brand',
        tone === 'plain' && 'bw-bold border-border-strong bg-surface-card text-ink',
        tone === 'muted' && 'bg-surface-sunken text-ink-muted'
      )}
    >
      <span className="font-display text-[19px] font-black leading-[19px] tabular-nums">{fmt(ms, { day: 'numeric' })}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.8px]">{fmt(ms, { month: 'short' })}</span>
    </span>
  );
}

function OccRow({ o, tone, tag, first }: { o: Occ; tone: 'next' | 'plain' | 'muted'; tag: React.ReactNode; first: boolean }) {
  return (
    <li className={cn('flex min-h-[72px] items-center gap-ds-3 py-ds-3', !first && 'bw-t-hair border-line-soft')}>
      <DateTile ms={o.start} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[17px] font-extrabold', o.cancelled ? 'text-ink-muted' : 'text-ink')}>{weekday(o.start)}</span>
        <span className="block text-[14px] text-ink-muted">
          {time(o.start)} · {o.minutes} min
        </span>
      </span>
      {tag}
    </li>
  );
}

function SessionsPanel({ occs, now, inPerson, venue }: { occs: Occ[] | null; now: number; inPerson: boolean; venue: Venue }) {
  const [showAllPast, setShowAllPast] = useState(false);
  if (occs === null) return <div className="h-[220px] animate-pulse rounded-ds-card bg-surface-sunken" />;

  const upcoming = occs.filter((o) => o.end >= now || (o.cancelled && o.start > now - 7 * SOON_MS));
  const nextId = upcoming.find((o) => !o.cancelled && o.end >= now)?.id;
  const past = occs.filter((o) => o.end < now && !o.cancelled).reverse();
  const counted = past.filter((o) => o.attendance);
  const anyCancelled = upcoming.some((o) => o.cancelled);
  const tally = {
    onTime: counted.filter((o) => o.attendance === 'attended').length,
    late: counted.filter((o) => o.attendance === 'late').length,
    missed: counted.filter((o) => o.attendance === 'missed').length,
  };

  return (
    <div className="flex flex-col gap-ds-4">
      {inPerson && venue ? (
        <section className="flex items-start gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm bg-ink text-brand">
            <MapPin size={18} weight="bold" aria-hidden />
          </span>
          <span className="min-w-0 text-[14px] text-ink-muted">
            <span className="block text-[16px] font-extrabold text-ink">{venue.name}</span>
            {venue.region ? <span className="block">{venue.region.name}</span> : null}
            {venue.address_line ? <span className="mt-ds-1 block text-ink">{venue.address_line}</span> : null}
            {venue.access_instructions ? <span className="mt-ds-1 block">{venue.access_instructions}</span> : null}
            {venue.arrival_notes ? <span className="mt-ds-1 block">{venue.arrival_notes}</span> : null}
            {venue.address_hidden ? <span className="mt-ds-1 block italic">The exact address is shared once you have joined.</span> : null}
          </span>
        </section>
      ) : null}

      {upcoming.length === 0 && past.length === 0 ? (
        <section className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-[15px] text-ink-muted">
          No sessions scheduled yet.
        </section>
      ) : null}

      {upcoming.length ? (
        <ul className="m-0 flex list-none flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-1">
          {upcoming.map((o, i) => (
            <OccRow
              key={o.id}
              o={o}
              first={i === 0}
              tone={o.cancelled ? 'muted' : o.id === nextId ? 'next' : 'plain'}
              tag={
                o.cancelled ? (
                  <Tag tone="outline" className="border-border-strong text-ink-muted">Didn&apos;t run</Tag>
                ) : o.id === nextId ? (
                  <Tag tone="warning">{now >= o.start ? 'Live' : 'Next'}</Tag>
                ) : null
              }
            />
          ))}
        </ul>
      ) : null}

      {anyCancelled ? (
        <p className="m-0 flex items-center gap-ds-2 rounded-ds-sm bg-brand/15 px-ds-3 py-ds-3 text-[14px] text-ink">
          <Info size={18} weight="bold" className="shrink-0" aria-hidden />
          Classes that don&apos;t run never count against you.
        </p>
      ) : null}

      {past.length ? (
        <>
          <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
            <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">Your attendance</h2>
            <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-ds-sm bw-bold border-ink">
              {[
                { n: tally.onTime, label: 'On time', cls: 'text-brand-edge' },
                { n: tally.late, label: 'Late', cls: 'text-[#8a6d00]' },
                { n: tally.missed, label: 'Missed', cls: 'text-danger' },
              ].map((c) => (
                <div key={c.label} className="flex flex-col items-center gap-ds-1 py-ds-3">
                  <span className={cn('font-display text-[28px] font-black leading-none tabular-nums', c.cls)}>{c.n}</span>
                  <span className="text-[13px] font-bold text-ink">{c.label}</span>
                </div>
              ))}
            </div>
            <p className="m-0 text-[13px] text-ink-muted">Logged when you tap Join.</p>
          </section>

          <section className="flex flex-col gap-ds-1">
            <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Past sessions</h2>
            <ul className="m-0 flex list-none flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-1">
              {(showAllPast ? past : past.slice(0, 5)).map((o, i) => (
                <OccRow
                  key={o.id}
                  o={o}
                  first={i === 0}
                  tone="plain"
                  tag={
                    o.attendance === 'attended' ? (
                      <Tag tone="brand">On time</Tag>
                    ) : o.attendance === 'late' ? (
                      <Tag tone="warning">Late</Tag>
                    ) : o.attendance === 'missed' ? (
                      <Tag tone="danger">Missed</Tag>
                    ) : null
                  }
                />
              ))}
            </ul>
            {past.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllPast((v) => !v)}
                className="ds-link min-h-[44px] self-start border-0 bg-transparent p-0 text-[15px] font-extrabold text-brand-edge cursor-pointer"
              >
                {showAllPast ? 'Show fewer' : `Show all ${past.length}`}
              </button>
            ) : null}
          </section>
        </>
      ) : null}

      {!inPerson ? (
        <p className="m-0 text-[13px] text-ink-muted">The same class link is used every week. Join opens 10 minutes before the start.</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stream (C6)

function StreamPanel({ groupId, group, now }: { groupId: string; group: Group; now: number }) {
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/stream`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const raw: any[] = d.posts ?? d.data ?? [];
        setPosts(
          raw.map((p: any) => {
            const att = (p.attachments ?? [])[0];
            const body: string = p.message_body ?? p.body ?? p.content ?? '';
            const lines = body.split('\n').filter(Boolean);
            const urlLine = lines.find((l) => URL_LINE.test(l.trim()));
            const link = p.link_url ?? p.url ?? (urlLine ? urlLine.trim() : null);
            const text = lines.filter((l) => !URL_LINE.test(l.trim()));
            const explicit = p.title ?? p.heading ?? null;
            const name = att?.file_name ?? p.attachment_name ?? null;
            const url = att?.file_url ?? p.attachment_url ?? null;
            return {
              id: p.id,
              title: explicit ?? '',
              body: text.join('\n'),
              at: p.created_at ?? null,
              pinned: p.pinned_at !== null && p.pinned_at !== undefined,
              attachment: name && url ? { name, url } : null,
              link,
            };
          })
        );
      })
      .catch(() => setPosts([]));
  }, [groupId]);

  const sorted = useMemo(() => [...(posts ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned)), [posts]);

  if (posts === null) return <div className="h-[200px] animate-pulse rounded-ds-card bg-surface-sunken" />;

  return (
    <div className="flex flex-col gap-ds-3">
      {sorted.length === 0 ? (
        <section className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-[15px] text-ink-muted">
          No posts yet. {group.tutorName.split(' ')[0]} posts reminders and homework here.
        </section>
      ) : (
        sorted.map((p) => {
          const fresh = p.at ? now - new Date(p.at).getTime() < 48 * 3_600_000 : false;
          return (
            <article key={p.id} className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
              <header className="flex items-center gap-ds-3">
                {group.tutorAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.tutorAvatar} alt="" className="size-10 shrink-0 rounded-ds-sm object-cover" />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-ds-sm bg-ink font-display text-[14px] font-black text-brand">
                    {initials(group.tutorName)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-extrabold text-ink">{group.tutorName}</span>
                  <span className="block text-[13px] text-ink-muted">Tutor · {ago(p.at, now)}</span>
                </span>
                {p.pinned ? (
                  <Tag tone="outline" className="gap-ds-1">
                    <PushPin size={11} weight="fill" aria-hidden /> Pinned
                  </Tag>
                ) : fresh ? (
                  <Tag tone="orange">New</Tag>
                ) : null}
              </header>
              {p.title ? <h3 className="m-0 text-[17px] font-extrabold text-ink">{p.title}</h3> : null}
              {p.body ? <p className="m-0 whitespace-pre-line text-[16px] leading-[23px] text-ink">{p.body}</p> : null}
              {p.attachment ? (
                <a
                  href={p.attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ds-press flex min-h-[56px] items-center gap-ds-3 rounded-ds-sm bw-hair border-border-strong px-ds-3 no-underline"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm bg-accent-yellow text-ink">
                    <BookOpen size={18} weight="bold" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink">{p.attachment.name}</span>
                  <DownloadSimple size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
                </a>
              ) : null}
              {p.link ? (
                <a
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ds-press flex min-h-[56px] items-center gap-ds-3 rounded-ds-sm bw-hair border-border-strong px-ds-3 no-underline"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-sm bg-brand text-ink">
                    <LinkSimple size={18} weight="bold" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{p.link.replace(/^https?:\/\//, '')}</span>
                  <ArrowSquareOut size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
                </a>
              ) : null}
            </article>
          );
        })
      )}
      <p className="m-0 text-[13px] text-ink-muted">The stream is read-only. Use Message tutor (⋯) to reply.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members (2:1434)

function MembersPanel({ members }: { members: Member[] | null }) {
  if (members === null) return <div className="h-[200px] animate-pulse rounded-ds-card bg-surface-sunken" />;
  if (members.length === 0) {
    return <section className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-[15px] text-ink-muted">No other members yet.</section>;
  }
  const sorted = [...members].sort((a, b) => Number(b.self) - Number(a.self));
  return (
    <ul className="m-0 flex list-none flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-1">
      {sorted.map((m, i) => (
        <li key={m.id} className={cn('flex min-h-[64px] items-center gap-ds-3 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-ds-sm font-display text-[13px] font-black',
              i % 3 === 0 ? 'bg-ink text-brand' : i % 3 === 1 ? 'bw-bold border-ink bg-surface-card text-ink' : 'bg-brand text-ink'
            )}
          >
            {initials(m.name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[16px] font-extrabold text-ink">
            {m.name}
            {m.self ? <span className="ml-ds-1 text-[13px] font-extrabold text-brand-edge">(you)</span> : null}
          </span>
          {m.joined ? (
            <span className="shrink-0 text-[13px] text-ink-muted">{fmt(new Date(m.joined).getTime(), { month: 'short', year: 'numeric' })}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// ⋯ menu row, blocked states, leave (C7)

function MenuRow({ href, icon, label, external }: { href: string; icon: React.ReactNode; label: string; external?: boolean }) {
  const cls = 'ds-press flex min-h-[56px] items-center gap-ds-3 bw-t-hair border-line-soft text-[16px] font-extrabold text-ink no-underline first:border-t-0';
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {icon}
      <span className="flex-1">{label}</span>
      <ArrowSquareOut size={18} weight="bold" aria-hidden />
    </a>
  ) : (
    <Link href={href} className={cls}>
      {icon}
      <span className="flex-1">{label}</span>
    </Link>
  );
}

function BlockedCard({
  state,
  rawStatus,
  reason,
  suspendedUntil,
  lapsedUntil,
  monthly,
  group,
}: {
  state: MemberState;
  rawStatus: string | null;
  reason: string | null;
  suspendedUntil: number | null;
  lapsedUntil: string | null;
  monthly: number | null;
  group: Group;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Same endpoint the old page's resubscribe uses: there is no separate rejoin.
  const resubscribe = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/groups/${group.id}/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const d = await res.json().catch(() => ({}));
      if (d.checkout_url) {
        window.location.href = d.checkout_url;
        return;
      }
      setErr(d.parent_approval_required ? 'Sent to your parent — rejoining this class is theirs to approve.' : d.error || 'Could not start your subscription. Please try again.');
    } catch {
      setErr('Could not start your subscription — check your connection.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'lapsed') {
    return (
      <section className="flex flex-col gap-ds-3 rounded-ds-card bw-bold border-ink bg-surface-card p-ds-card">
        <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">Your paid month has ended</h2>
        <p className="m-0 text-[15px] leading-[21px] text-ink-muted">
          You secured your spot in {group.name} and paid for your first month
          {lapsedUntil ? `, which ran until ${fmt(new Date(lapsedUntil).getTime(), { day: 'numeric', month: 'long' })}` : ''}. Nothing was
          charged after that, so your place was released. Subscribe to pick the class back up.
        </p>
        {err ? <p className="m-0 text-[14px] font-bold text-danger">{err}</p> : null}
        <Button size="lg" block="always" disabled={busy} onClick={() => void resubscribe()}>
          {busy ? 'Starting…' : monthly && monthly > 0 ? `Subscribe — TT$${monthly} a month` : 'Subscribe to continue'}
        </Button>
        <p className="m-0 text-[13px] text-ink-muted">Cancel any time. Your tutor keeps your seat as long as you&apos;re subscribed.</p>
      </section>
    );
  }
  if (state === 'suspended') {
    return (
      <section className="flex flex-col gap-ds-2 rounded-ds-card bw-bold border-ink bg-accent-yellow p-ds-card">
        <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">You&apos;re suspended from this class</h2>
        <p className="m-0 text-[15px] leading-[21px] text-ink">
          {group.tutorName} has paused your access. You can still see the class but can&apos;t join sessions or see new posts.
        </p>
        {suspendedUntil ? (
          <p className="m-0 text-[15px] font-extrabold text-ink">
            Access returns {fmt(suspendedUntil, { weekday: 'short', day: 'numeric', month: 'short' })} at {time(suspendedUntil)}
          </p>
        ) : null}
        {reason ? <p className="m-0 text-[15px] text-ink">Reason: “{reason}”</p> : null}
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-ds-3 rounded-ds-card bw-bold border-danger bg-surface-card p-ds-card">
      <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">
        {rawStatus === 'banned' ? "You've been banned from this class" : 'You no longer have access to this class'}
      </h2>
      <p className="m-0 text-[15px] leading-[21px] text-ink-muted">
        {rawStatus === 'banned'
          ? `${group.tutorName} has permanently removed you from ${group.name}. You can't rejoin or request access.`
          : `You have been removed from ${group.name}. If a refund is due, it will be processed by the admin.`}
      </p>
      {reason ? <p className="m-0 text-[15px] text-ink">Reason: “{reason}”</p> : null}
      <p className="m-0 text-[13px] text-ink-muted">If you think this was a mistake, contact iTutor support.</p>
      <div className="flex flex-wrap gap-ds-2">
        <a
          href="mailto:support@myitutor.com?subject=Class access"
          className="ds-press inline-flex h-11 items-center rounded-ds-btn bw-bold border-ink bg-surface-card px-ds-4 text-[15px] font-extrabold text-ink no-underline"
        >
          Contact support
        </a>
        <Link
          href="/student/find-tutors"
          className="ds-press inline-flex h-11 items-center rounded-ds-btn bw-bold border-ink bg-surface-card px-ds-4 text-[15px] font-extrabold text-ink no-underline"
        >
          Find another class
        </Link>
      </div>
    </section>
  );
}

function LeaveSheet({ open, onClose, groupId, group }: { open: boolean; onClose: () => void; groupId: string; group: Group }) {
  const router = useRouter();
  const { profile } = useProfile();
  const [sub, setSub] = useState<{ has: boolean; periodEnd: string | null } | null>(null);
  const [choice, setChoice] = useState<'stop' | 'now' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !profile?.id) return;
    setChoice(null);
    setErr(null);
    setSub(null);
    supabase
      .from('group_enrollments')
      .select('id, current_period_end')
      .eq('group_id', groupId)
      .eq('student_id', profile.id)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .in('status', ['ACTIVE', 'GRACE'])
      .maybeSingle()
      .then(({ data }) => setSub({ has: !!data, periodEnd: (data as { current_period_end?: string } | null)?.current_period_end ?? null }));
  }, [open, profile?.id, groupId]);

  // Same call as the old page: immediate=false stops payments and keeps
  // access to the end of the period; immediate=true leaves now.
  const act = async () => {
    if (!profile || !choice) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${profile.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediate: choice === 'now' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Something went wrong');
      router.push('/student/classes');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };

  const until = sub?.periodEnd ? fmt(new Date(sub.periodEnd).getTime(), { day: 'numeric', month: 'short' }) : null;
  const option = (key: 'stop' | 'now', title: string, detail: string, danger: boolean) => (
    <button
      type="button"
      role="radio"
      aria-checked={choice === key}
      onClick={() => setChoice(key)}
      className={cn(
        'ds-press flex w-full flex-col items-start gap-ds-1 rounded-ds-card bg-surface-card p-ds-3 text-left cursor-pointer',
        choice === key ? 'bw-bold border-ink shadow-edge-ink' : danger ? 'bw-hair border-danger' : 'bw-hair border-border-strong'
      )}
    >
      <span className={cn('text-[16px] font-extrabold', danger ? 'text-danger' : 'text-ink')}>{title}</span>
      <span className="text-[14px] text-ink-muted">{detail}</span>
    </button>
  );

  const subject = group.subject || group.name;
  return (
    <Sheet
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      title={`Leave ${subject}?`}
      footer={
        choice ? (
          <>
            <Button variant="danger" size="lg" disabled={busy} onClick={() => void act()}>
              {busy ? 'Working…' : choice === 'stop' ? 'Stop payments' : 'Leave class now'}
            </Button>
            <Button size="lg" disabled={busy} onClick={onClose}>
              Keep my class
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={onClose}>
            Keep my class
          </Button>
        )
      }
    >
      {sub === null ? (
        <div className="h-[140px] animate-pulse rounded-ds-card bg-surface-sunken" />
      ) : (
        <div role="radiogroup" aria-label="How do you want to leave?" className="flex flex-col gap-ds-2">
          {sub.has
            ? option('stop', 'Stop payments', `Keep access${until ? ` until ${until}` : ' to the end of this month'}, then you're out`, false)
            : null}
          {option('now', 'Leave class now', sub.has ? "Access ends today. This month isn't refunded." : 'Access ends today.', true)}
        </div>
      )}
      {err ? <p role="alert" className="m-0 text-[14px] font-bold text-danger">{err}</p> : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Rate the tutor — wide screens (the phone gets the star button + sheet).

function RatingCard({
  groupId,
  group,
  existing,
  onDone,
}: {
  groupId: string;
  group: Group;
  existing: ExistingClassReview | null;
  onDone: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const first = group.tutorName.split(' ')[0];

  if (existing && !editing) {
    return (
      <section className="hidden flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card lg:flex">
        <div className="flex items-center justify-between gap-ds-3">
          <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">Your rating of {first}</h2>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {CATEGORIES.map((c, i) => (
            <li key={c.key} className={cn('flex items-center justify-between gap-ds-3 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
              <span className="text-[15px] font-extrabold text-ink">{c.label}</span>
              <Stars value={existing[c.key] ?? existing.rating} size={16} />
            </li>
          ))}
        </ul>
        {existing.comment ? <p className="m-0 whitespace-pre-line rounded-ds-sm bg-surface-sunken p-ds-3 text-[15px] text-ink">{existing.comment}</p> : null}
      </section>
    );
  }

  return (
    <section className="hidden flex-col gap-ds-3 rounded-ds-card bw-bold border-ink bg-surface-card p-ds-card lg:flex">
      <div className="flex items-start gap-ds-3">
        {group.tutorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.tutorAvatar} alt="" className="size-12 shrink-0 rounded-ds-sm object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-ds-sm bg-ink font-display text-[16px] font-black text-brand">
            {initials(group.tutorName)}
          </span>
        )}
        <span className="min-w-0">
          <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">{existing ? 'Edit your rating' : `How is ${first} doing?`}</h2>
          <p className="m-0 text-[14px] text-ink-muted">Three quick ratings, then a few words if you like. Other students see it.</p>
        </span>
      </div>
      <ClassRatingFlow
        groupId={groupId}
        tutorFirstName={first}
        existing={existing}
        onDone={(m) => {
          setEditing(false);
          onDone(m);
        }}
        onCancel={existing ? () => setEditing(false) : undefined}
      />
    </section>
  );
}
