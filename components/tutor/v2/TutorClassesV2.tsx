'use client';

/**
 * TutorClassesV2 — the new Classes tab (canvas m08 phone, d02 desktop).
 *
 * Phone (m08): "My classes / Sessions" segment, one card per class with its
 * state tag under it, "Create a class" at the foot.
 * Desktop (d02): "Create a class" top right, status filter pills (All / Live /
 * Draft / Paused) and a table: class, next session, seats, price, status,
 * Manage.
 *
 * Kept from the old My Classes page because they are real and in use:
 * - a photo/bio nudge (no longer a lock: classes are listed without a profile check);
 * - the Class Match Week half, as a third segment while a campaign is live
 *   (and `?tab=class-match-week`, which emails and the countdown link to);
 * - PauseAllClasses — the break control and the persistent "on a break"
 *   banner. The canvas draws neither; placing it under the list is
 *   PROVISIONAL.
 * Dropped from the list: the per-card ⋯ menu (visibility switch, delete). Both
 * still live on the class page's settings, where the canvas puts them.
 *
 * Plain fetch, not React Query: tutor routes have no QueryClientProvider.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Segmented, Tag } from '@/components/ui';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { useTeacherCampaignEntry } from '@/lib/hooks/useTeacherCampaignEntry';
import PauseAllClasses from '@/components/tutor/PauseAllClasses';
import TeacherCampaignPanel from '@/components/classMatchWeek/teacher/TeacherCampaignPanel';
import { cn } from '@/lib/utils';
import { STATE_TAG, money, shortDate, type ClassItem } from './classState';
import { ClassCover } from '@/components/parent/v2/ClassCover';
import { Sheet } from '@/components/parent/v2/Sheet';
import { ShareNetwork } from '@phosphor-icons/react';
import { ShareCard, shareBase } from './TutorClassManageV2';
import { formatLevel } from '@/lib/utils/formatLevel';

type Half = 'classes' | 'class-match-week';
type Filter = 'all' | 'live' | 'draft' | 'paused';

const FILTERS: { id: Filter; label: string; match: (c: ClassItem) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'live', label: 'Live', match: (c) => c.state === 'live' || c.state === 'full' || c.state === 'fix' },
  { id: 'draft', label: 'Draft', match: (c) => c.state === 'draft' },
  { id: 'paused', label: 'Paused', match: (c) => c.state === 'paused' },
];

/**
 * My classes / Match Week switch. Owner 2026-11-16: the Sessions half is gone
 * (the class page's Sessions tab covers it), so with no campaign there is
 * nothing to switch between and the segment hides.
 */
export function ClassesSegment({ value, campaign, onCampaign }: { value: Half; campaign: boolean; onCampaign?: () => void }) {
  const router = useRouter();
  const options: { id: Half; label: string }[] = [
    { id: 'classes', label: 'My classes' },
  ];
  if (campaign) options.push({ id: 'class-match-week', label: 'Match Week' });
  if (options.length < 2) return null;
  return (
    <Segmented<Half>
      label="Classes"
      options={options}
      value={value}
      className="lg:max-w-[480px]"
      onChange={(id) => {
        if (id === value) return;
        if (id === 'classes') router.push('/tutor/classes');
        else if (onCampaign) onCampaign();
        else router.push('/tutor/classes?tab=class-match-week');
      }}
    />
  );
}

export default function TutorClassesV2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: profileLoading } = useProfile();
  const completion = useTutorCompletion(profile);
  const campaign = useTeacherCampaignEntry(profile);
  const [half, setHalf] = useState<Half>(searchParams.get('tab') === 'class-match-week' ? 'class-match-week' : 'classes');
  const [filter, setFilter] = useState<Filter>('all');

  const [classes, setClasses] = useState<ClassItem[] | null>(null);
  const [isError, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/tutor/class-list', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Could not load classes');
      setClasses(json.data.classes as ClassItem[]);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Keep-active rules (21 Nov 2026 sprint): which classes are in a warning,
  // and the archived ones the tutor can bring back. A failure here only hides
  // these extras; the class list itself does not depend on it.
  const [activity, setActivity] = useState<ClassActivity | null>(null);
  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/class-activity', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok && json?.success) setActivity(json.data as ClassActivity);
    } catch {
      /* extras only */
    }
  }, []);
  useEffect(() => {
    loadActivity();
  }, [loadActivity]);
  const warningFor = useMemo(() => new Map((activity?.warnings ?? []).map((w) => [w.groupId, w])), [activity]);
  const wantArchived = searchParams.get('archived') === '1';

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, (classes ?? []).filter(f.match).length])) as Record<Filter, number>,
    [classes]
  );
  const shown = useMemo(() => (classes ?? []).filter(FILTERS.find((f) => f.id === filter)!.match), [classes, filter]);

  const header = (
    <div className="flex items-center justify-between gap-ds-3">
      <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Classes</h1>
      <Button variant="primary" size="md" className="hidden lg:inline-flex" onClick={() => router.push('/tutor/classes/new')}>
        Create a class
      </Button>
    </div>
  );

  if (profileLoading || completion.loading) {
    return (
      <div aria-busy className="flex flex-col gap-ds-3">
        <div className="h-9 w-40 animate-pulse rounded-ds-sm bg-surface-sunken" />
        <div className="h-12 animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-20 animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-20 animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  // The old lock (`completion.listed`) hid this whole page until the tutor had a
  // photo, a bio, 1:1 availability AND a 1:1 hourly rate. Two of those are about
  // 1:1 lessons, and /api/groups shows classes with no profile check at all, so
  // the lock was wrong for classes: it stayed up even after a class went live.
  // Now: never block; nudge only for what families actually see next to a
  // class, the photo and the bio, and send them to the new-UI profile editor.
  const profileNudge =
    !completion.avatar || !completion.bio ? (
      <Card
        title={!completion.avatar && !completion.bio ? 'Add a photo and a short bio' : !completion.avatar ? 'Add a profile photo' : 'Add a short bio'}
        body="Families see these next to your classes. Teachers with a photo and bio get more sign-ups."
      >
        <Button variant="outline" size="md" onClick={() => router.push('/tutor/profile/edit')}>
          Edit profile
        </Button>
      </Card>
    ) : null;

  return (
    <div className="flex flex-col gap-ds-4">
      {header}
      {profileNudge}
      <ClassesSegment
        value={half}
        campaign={Boolean(campaign.campaign)}
        onCampaign={() => {
          setHalf('class-match-week');
          router.replace('/tutor/classes?tab=class-match-week');
        }}
      />

      {half === 'class-match-week' ? (
        <TeacherCampaignPanel profile={profile} />
      ) : isError ? (
        <Card title="Your classes didn't load" body="Check your connection and try again.">
          <Button variant="outline" size="md" onClick={() => load()}>
            Try again
          </Button>
        </Card>
      ) : classes === null ? (
        <div aria-busy className="flex flex-col gap-ds-3">
          <div className="h-20 animate-pulse rounded-ds-card bg-surface-sunken" />
          <div className="h-20 animate-pulse rounded-ds-card bg-surface-sunken" />
        </div>
      ) : classes.length === 0 ? (
        <Card title="No classes yet" body="Create your first class. You can save it as a draft and publish when you're ready.">
          <Button variant="primary" size="md" onClick={() => router.push('/tutor/classes/new')}>
            Create a class
          </Button>
        </Card>
      ) : (
        <>
          {/* The old My Classes card format (banner, chips, title, stat strip,
              action), redrawn in the design system and carrying the new
              list's facts: next session, seats, price and state. Owner,
              2026-11-16. Same grid at every width; one column on a phone. */}
          <div role="tablist" aria-label="Filter classes" className="flex flex-wrap gap-ds-2">
            {FILTERS.map((f) => {
              const on = f.id === filter;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'ds-press inline-flex items-center gap-[6px] rounded-full bw-hair px-ds-3 py-[6px] font-body text-[13px] font-extrabold cursor-pointer',
                    on ? 'border-ink bg-ink text-on-ink' : 'border-border bg-surface-card text-ink'
                  )}
                >
                  {f.label}
                  <span className={cn('tabular-nums', on ? 'text-brand' : 'text-ink-muted')}>{counts[f.id]}</span>
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <p className="m-0 py-ds-4 text-[14px] text-ink-muted">No {filter} classes.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-ds-3 lg:gap-ds-4">
              {shown.map((c) => (
                <ClassTile key={c.id} c={c} warning={warningFor.get(c.id)} />
              ))}
            </div>
          )}
          <Button variant="primary" size="lg" block className="lg:hidden" onClick={() => router.push('/tutor/classes/new')}>
            Create a class
          </Button>
        </>
      )}

      {half === 'classes' && activity && activity.archived.length > 0 ? (
        <ArchivedSection
          items={activity.archived}
          open={wantArchived}
          onReactivated={() => {
            load();
            loadActivity();
          }}
        />
      ) : null}

      {half === 'classes' && classes && classes.length > 0 ? (
        <section aria-label="Take a break" className="mt-ds-2">
          <PauseAllClasses />
        </section>
      ) : null}
    </div>
  );
}

type ActivityWarning = { groupId: string; rule: 'no_students' | 'inactive'; archiveOn: string; reminded: boolean };
type ArchivedClass = {
  id: string;
  name: string;
  subject: string | null;
  coverImage: string | null;
  archivedAt: string;
  reason: string;
  visibility: string;
};
type ClassActivity = { warnings: ActivityWarning[]; archived: ArchivedClass[] };

const ARCHIVE_WHY: Record<string, string> = {
  auto_no_students: 'No students joined',
  auto_inactive: 'No activity for 90 days',
  auto_inactive_90_days: 'No activity for 90 days',
  manual: 'You archived it',
};

/**
 * Classes → Archived. Nothing in an archived class is deleted; Reactivate
 * puts it back as it was (on the marketplace again if it is public) with a
 * fresh 30 days. Collapsed by default unless the "archived" email/notification
 * link (?archived=1) brought the tutor here.
 */
function ArchivedSection({ items, open, onReactivated }: { items: ArchivedClass[]; open: boolean; onReactivated: () => void }) {
  const [expanded, setExpanded] = useState(open);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (open) document.getElementById('archived-classes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [open]);

  const reactivate = async (c: ArchivedClass) => {
    setBusy(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${c.id}/restore`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not reactivate this class.');
      setDone(c.name);
      onReactivated();
    } catch (e: any) {
      setError(e?.message || 'Could not reactivate this class.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="archived-classes" aria-label="Archived classes" className="mt-ds-2 flex scroll-mt-ds-4 flex-col gap-ds-3">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-ds-3 border-0 bg-transparent p-0 text-left cursor-pointer"
      >
        <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">
          Archived <span className="tabular-nums text-ink-muted">{items.length}</span>
        </h2>
        <span className="text-[14px] font-extrabold text-ink-muted">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {done ? (
        <p role="status" className="m-0 text-[14px] font-extrabold text-brand-edge">
          {done} is back, with a fresh 30 days.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[14px] font-extrabold text-danger">
          {error}
        </p>
      ) : null}
      {expanded ? (
        <>
          <p className="m-0 text-[14px] leading-5 text-ink-muted">
            Nothing in an archived class is deleted: settings, sessions, posts and members&rsquo; history are all kept.
            Reactivate puts it back exactly as it was{items.some((i) => i.visibility === 'public') ? ', on the marketplace if it is public' : ''}.
          </p>
          <ul className="m-0 flex list-none flex-col gap-ds-2 p-0">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold text-ink">{c.name}</div>
                  <div className="text-[13px] text-ink-muted">
                    {[c.subject, `Archived ${shortDate(c.archivedAt)}`, ARCHIVE_WHY[c.reason]].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Button variant="dark" size="sm" disabled={busy !== null} onClick={() => reactivate(c)}>
                  {busy === c.id ? 'Reactivating…' : 'Reactivate'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function ClassTile({ c, warning }: { c: ClassItem; warning?: ActivityWarning }) {
  const router = useRouter();
  const tag = STATE_TAG[c.state];
  const draft = c.state === 'draft';

  let next: ReactNode;
  if (draft) next = '—';
  else if (c.state === 'paused') next = c.pause?.end ? `Until ${shortDate(c.pause.end)}` : 'Paused';
  else if (c.nextStart) next = shortDate(c.nextStart);
  else next = <span className="text-danger">None</span>;

  const seats = draft ? '—' : c.seats ? `${c.students}/${c.seats}` : String(c.students);
  const price = c.price > 0 ? `${money(c.price)}${c.priceUnit === 'month' ? '/mo' : c.priceUnit === 'session' ? '/session' : ''}` : 'Free';
  const isOneOnOne = c.seats === 1;
  const [shareOpen, setShareOpen] = useState(false);
  const shareUrl = `${shareBase()}/student/explore/${c.id}`;
  const shareMessage = `Hi! I'm teaching ${c.name} on iTutor.${c.schedule ? ` We meet ${c.schedule.replace(' · ', ' at ')}.` : ''} You can see the details and join here: ${shareUrl}`;

  return (
    <article className="flex flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card">
      {/* Banner: the tutor's upload, or the subject-colour cover. */}
      <Link href={`/tutor/classes/${c.id}`} className="relative block no-underline" aria-label={c.name}>
        <ClassCover image={c.coverImage} subject={c.subject || c.name} className="h-32" />
        <span className="absolute right-ds-2 top-ds-2">
          <Tag tone={tag.tone}>{tag.short}</Tag>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-ds-3 p-ds-card">
        <div className="flex flex-wrap items-center gap-ds-1">
          {c.subject ? <Tag tone="outline">{c.subject}</Tag> : null}
          {c.level ? <Tag tone="outline">{formatLevel(c.level)}</Tag> : null}
          <Tag tone="outline">{isOneOnOne ? '1:1' : 'Group'}</Tag>
          {c.visibility === 'private' && !draft ? <Tag tone="outline">Private</Tag> : null}
        </div>

        <div className="min-w-0">
          <h3 className="m-0 truncate font-display text-[17px] font-extrabold leading-tight text-ink">{c.name}</h3>
          <p className="m-0 mt-[2px] line-clamp-2 text-[13px] leading-[18px] text-ink-muted">
            {draft ? 'Not published yet' : c.schedule ?? 'No schedule set'}
          </p>
        </div>

        {/* Stat strip, as on the old card. */}
        {warning ? (
          <Link
            href={`/tutor/classes/${c.id}?keepActive=1`}
            className="rounded-ds-sm bw-hair border-ink bg-accent-yellow/30 px-ds-3 py-ds-2 text-[13px] font-extrabold leading-[18px] text-ink no-underline"
          >
            {warning.rule === 'no_students' ? 'No students yet' : 'No recent activity'} · archives {shortDate(warning.archiveOn)}. Keep it active →
          </Link>
        ) : null}

        <dl className="m-0 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-ds-sm bw-hair border-border text-center">
          {[
            ['Next', next],
            ['Seats', seats],
            ['Price', price],
          ].map(([label, value]) => (
            <div key={label as string} className="min-w-0 px-ds-1 py-ds-2">
              <dt className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">{label}</dt>
              <dd className="m-0 truncate text-[14px] font-extrabold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-auto flex gap-ds-2">
          <Button variant="dark" size="md" block className="flex-1" onClick={() => router.push(`/tutor/classes/${c.id}`)}>
            {draft ? 'Edit class' : 'Manage class'}
          </Button>
          {/* A draft has no public page to share yet. */}
          {!draft ? (
            <Button variant="outline" size="md" aria-label={`Share ${c.name}`} onClick={() => setShareOpen(true)}>
              <ShareNetwork size={18} weight="bold" aria-hidden /> Share
            </Button>
          ) : null}
        </div>
      </div>
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title={`Share ${c.name}`}>
        <p className="m-0 text-[14px] leading-5 text-ink-muted">
          Send families the class link. Nobody is enrolled or charged until they join and pay themselves.
        </p>
        <ShareCard message={shareMessage} url={shareUrl} bare />
      </Sheet>
    </article>
  );
}
