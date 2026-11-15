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
 * - the "finish your profile" lock (`useTutorCompletion().listed`);
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
import { Button, Card, Segmented, SubjectTile, Tag } from '@/components/ui';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { useTeacherCampaignEntry } from '@/lib/hooks/useTeacherCampaignEntry';
import PauseAllClasses from '@/components/tutor/PauseAllClasses';
import TeacherCampaignPanel from '@/components/classMatchWeek/teacher/TeacherCampaignPanel';
import { cn } from '@/lib/utils';
import { STATE_TAG, classSubline, money, shortDate, type ClassItem } from './classState';

type Half = 'classes' | 'sessions' | 'class-match-week';
type Filter = 'all' | 'live' | 'draft' | 'paused';

const FILTERS: { id: Filter; label: string; match: (c: ClassItem) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'live', label: 'Live', match: (c) => c.state === 'live' || c.state === 'full' || c.state === 'fix' },
  { id: 'draft', label: 'Draft', match: (c) => c.state === 'draft' },
  { id: 'paused', label: 'Paused', match: (c) => c.state === 'paused' },
];

/** The segment shared by Classes and Sessions (m08 draws it on both). */
export function ClassesSegment({ value, campaign, onCampaign }: { value: Half; campaign: boolean; onCampaign?: () => void }) {
  const router = useRouter();
  const options: { id: Half; label: string }[] = [
    { id: 'classes', label: 'My classes' },
    { id: 'sessions', label: 'Sessions' },
  ];
  if (campaign) options.push({ id: 'class-match-week', label: 'Match Week' });
  return (
    <Segmented<Half>
      label="Classes"
      options={options}
      value={value}
      className="lg:max-w-[480px]"
      onChange={(id) => {
        if (id === value) return;
        if (id === 'sessions') router.push('/tutor/sessions');
        else if (id === 'classes') router.push('/tutor/classes');
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

  if (!completion.listed) {
    return (
      <div className="flex flex-col gap-ds-4">
        <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Classes</h1>
        <Card
          title="Finish your profile to start teaching"
          body="Families only see teachers with a complete profile, so classes open up once yours is done. It takes a few minutes."
        >
          <Button variant="primary" size="md" onClick={() => router.push('/tutor/get-listed')}>
            Complete profile
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-4">
      {header}
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
          {/* Phone (m08): cards, state tag under each. */}
          <div className="flex flex-col gap-ds-3 lg:hidden">
            {classes.map((c) => (
              <PhoneClass key={c.id} c={c} />
            ))}
            <Button variant="primary" size="lg" block className="mt-ds-2" onClick={() => router.push('/tutor/classes/new')}>
              Create a class
            </Button>
          </div>

          {/* Desktop (d02): filter pills + table. */}
          <Card className="hidden lg:flex">
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
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
                    <th className="bw-b-hair border-line-soft py-ds-2 pr-ds-3 font-extrabold">Class</th>
                    <th className="bw-b-hair border-line-soft py-ds-2 pr-ds-3 font-extrabold">Next session</th>
                    <th className="bw-b-hair border-line-soft py-ds-2 pr-ds-3 font-extrabold">Seats</th>
                    <th className="bw-b-hair border-line-soft py-ds-2 pr-ds-3 font-extrabold">Price</th>
                    <th className="bw-b-hair border-line-soft py-ds-2 pr-ds-3 font-extrabold">Status</th>
                    <th className="bw-b-hair border-line-soft py-ds-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <DeskRow key={c.id} c={c} />
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {half === 'classes' && classes && classes.length > 0 ? (
        <section aria-label="Take a break" className="mt-ds-2">
          <PauseAllClasses />
        </section>
      ) : null}
    </div>
  );
}

function PhoneClass({ c }: { c: ClassItem }) {
  const label = c.subject || c.name;
  const tag = STATE_TAG[c.state];
  return (
    <div className="flex flex-col gap-ds-2">
      <Link href={`/tutor/classes/${c.id}`} className="ds-press block text-ink no-underline">
        <Card className="flex-row items-center gap-ds-3">
          <SubjectTile code={subjectCode(label)} color={subjectColor(label)} size={48} className="text-[15px] font-black" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold leading-5">{c.name}</span>
            <span className="block text-[13px] leading-[18px] text-ink-muted">{classSubline(c)}</span>
          </span>
          {c.price > 0 ? (
            <span className="shrink-0 text-right font-display text-[15px] font-extrabold tabular-nums">
              {money(c.price)}
              {c.priceUnit ? <small className="block text-[11px] font-bold text-ink-muted">/{c.priceUnit}</small> : null}
            </span>
          ) : (
            <span className="shrink-0 text-[13px] font-bold text-ink-muted">Free</span>
          )}
        </Card>
      </Link>
      <span className="pl-ds-1">
        <Tag tone={tag.tone}>{tag.label}</Tag>
      </span>
    </div>
  );
}

function DeskRow({ c }: { c: ClassItem }) {
  const router = useRouter();
  const tag = STATE_TAG[c.state];
  const cell = 'bw-b-hair border-line-soft py-ds-3 pr-ds-3 align-middle';
  let next: ReactNode;
  if (c.state === 'draft') next = <span className="text-ink-muted">—</span>;
  else if (c.state === 'paused') next = c.pause?.end ? `Paused until ${shortDate(c.pause.end)}` : 'Paused';
  else if (c.nextStart) next = shortDate(c.nextStart);
  else next = <span className="font-bold text-danger">None scheduled</span>;

  const meta =
    c.state === 'draft'
      ? 'Not published'
      : [c.schedule, c.visibility === 'private' ? 'Private' : null].filter(Boolean).join(' · ') || null;

  return (
    <tr>
      <td className={cell}>
        <Link href={`/tutor/classes/${c.id}`} className="font-extrabold text-ink no-underline hover:underline">
          {c.name}
        </Link>
        {meta ? <div className="text-[13px] text-ink-muted">{meta}</div> : null}
      </td>
      <td className={cn(cell, 'whitespace-nowrap')}>{next}</td>
      <td className={cn(cell, 'whitespace-nowrap tabular-nums')}>
        {c.state === 'draft' ? <span className="text-ink-muted">—</span> : c.seats ? `${c.students} of ${c.seats}` : c.students}
      </td>
      <td className={cn(cell, 'whitespace-nowrap font-bold tabular-nums')}>
        {c.price > 0 ? `${money(c.price)}${c.priceUnit === 'month' ? '/mo' : c.priceUnit === 'session' ? '/session' : ''}` : 'Free'}
      </td>
      <td className={cn(cell, 'whitespace-nowrap')}>
        <Tag tone={tag.tone}>{tag.short}</Tag>
      </td>
      <td className="bw-b-hair border-line-soft py-ds-3 text-right align-middle">
        <Button variant="outline" size="sm" onClick={() => router.push(`/tutor/classes/${c.id}`)}>
          {c.state === 'draft' ? 'Edit class' : 'Manage'}
        </Button>
      </td>
    </tr>
  );
}
