'use client';

/**
 * ParentExploreV2 — the Explore frames: "Explore: group classes" and
 * "Explore: 1:1 tutors".
 *
 * WHY THIS IS A SEPARATE FILE AND NOT AN EDIT TO ExploreMarketplace.
 * The catalogue, its filters and its gating are 1,698 lines that also serve
 * the LIVE student marketplace, and that file carries `@ts-nocheck` on line
 * one — so nothing written inside it is type-checked. Restyling in place
 * would have put every new line beyond the compiler's reach, in a file whose
 * other consumer is in production.
 *
 * So the data stays where it is and only the presentation moves. Explore
 * renders this component instead of its own markup when the viewer is a
 * parent and the new UI is on, and passes in the lists it has ALREADY
 * filtered. There is still exactly one catalogue, one filter pipeline and one
 * set of visibility rules — which is what SCREEN_MAP logic row 3 requires —
 * and every line below is type-checked.
 *
 * The props are structural subsets of the marketplace's own `GroupLesson` and
 * `Tutor` types rather than imports of them: importing from a `@ts-nocheck`
 * module would re-export `any` and quietly switch the checking off again.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsIcon } from '@/components/ui/icons';
import { Tag } from '@/components/ui/Tag';
import '@/components/ui/ds-tokens.css';

export type ExploreTab = 'lessons' | 'tutors';

/** What a class card needs. A structural subset of the marketplace's GroupLesson. */
export interface ExploreLesson {
  id: string;
  title: string;
  tutor: string;
  tutorAvatar: string | null;
  subject: string;
  monthlyPrice: number;
  /** Compact recurring line ("Mon & Tue · 6:00 PM"), or '' when there is none. */
  day: string;
  time: string;
  coverImage?: string | null;
  /** Tailwind gradient pair, used when a class has no cover image. */
  color?: string;
}

/** What a tutor card needs. A structural subset of the marketplace's Tutor. */
export interface ExploreTutor {
  id: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
  school?: string | null;
  institution_name?: string | null;
  subjects: Array<{ name: string; curriculum: string; price_per_hour_ttd: number }>;
  average_rating: number | null;
  total_reviews: number;
}

export interface ParentExploreV2Props {
  tab: ExploreTab;
  onTabChange: (tab: ExploreTab) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  chips: string[];
  activeChip: string;
  onChipChange: (chip: string) => void;
  lessons: ExploreLesson[];
  tutors: ExploreTutor[];
  /** Ids the viewer's children are already in — drives the ENROLLED tag. */
  enrolledIds: Set<string>;
  loadingLessons: boolean;
  loadingTutors: boolean;
  classHref: (id: string) => string;
  enrolledClassHref: (id: string) => string;
  tutorHref: (id: string) => string;
  filtersApplied: boolean;
  onOpenFilters: () => void;
}

/* ── money and text ──────────────────────────────────────────────────── */

function ttd(amount: number): string {
  // No decimals: every price in these frames is whole dollars, and the
  // marketplace stores them that way.
  return 'TT$' + Math.round(amount).toLocaleString('en-TT');
}

function tutorName(t: ExploreTutor): string {
  return t.display_name?.trim() || t.full_name;
}

/**
 * "CAPE & CSEC Economics" — the frame's second line. Curricula are joined
 * because a tutor commonly teaches one subject at two levels, and the subject
 * is what the parent is scanning for.
 */
function subjectSummary(t: ExploreTutor): string {
  if (!t.subjects.length) return '';
  const curricula = Array.from(new Set(t.subjects.map((s) => s.curriculum).filter(Boolean)));

  // The stored subject name ALREADY begins with its curriculum — "CSEC
  // Biology", "SEA Maths". Printing the curriculum list in front of it
  // unchanged produces "CSEC CSEC Biology", and for a tutor teaching one
  // subject at two levels, "CAPE & CSEC CAPE Biology, CSEC Biology". Strip the
  // prefix so the two halves compose the way the frame reads them: the levels
  // once, then the subject. "CAPE Biology" + "CSEC Biology" collapses to one
  // "Biology", giving "CAPE & CSEC Biology".
  const names = Array.from(
    new Set(
      t.subjects
        .map((s) => {
          const name = (s.name || '').trim();
          const prefix = (s.curriculum || '').trim();
          if (!prefix) return name;
          const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s:–-]*', 'i');
          return name.replace(re, '').trim() || name;
        })
        .filter(Boolean)
    )
  );

  const lead = names.slice(0, 2).join(', ');
  const extra = names.length > 2 ? ` +${names.length - 2}` : '';
  return [curricula.join(' & '), lead + extra].filter(Boolean).join(' ');
}

function lowestRate(t: ExploreTutor): number | null {
  const rates = t.subjects.map((s) => s.price_per_hour_ttd).filter((n) => typeof n === 'number');
  return rates.length ? Math.min(...rates) : null;
}

/**
 * The frame's third line on a tutor card reads "15+ years teaching".
 *
 * THERE IS NO SUCH FIELD. Nothing in `profiles`, the tutor settings form or
 * the marketplace query records years of experience; the only place it exists
 * is inside the free-text bio. Rather than invent a number on a page parents
 * use to choose who teaches their child, this line carries the strongest real
 * signal available, in that order of preference. When a tutor has none of it
 * the line is dropped rather than filled with a placeholder.
 */
function credibilityLine(t: ExploreTutor): string | null {
  if (t.total_reviews > 0 && t.average_rating !== null) {
    const reviews = t.total_reviews === 1 ? '1 review' : `${t.total_reviews} reviews`;
    return `${t.average_rating.toFixed(1)} · ${reviews}`;
  }
  return t.institution_name?.trim() || t.school?.trim() || null;
}

function scheduleLine(lesson: ExploreLesson): string | null {
  const line = [lesson.day, lesson.time].filter(Boolean).join(' · ').trim();
  return line || null;
}

/* ── pieces ──────────────────────────────────────────────────────────── */

function SegmentedTabs({ tab, onTabChange }: Pick<ParentExploreV2Props, 'tab' | 'onTabChange'>) {
  const options: Array<{ id: ExploreTab; label: string; icon: 'users' | 'classes' }> = [
    { id: 'lessons', label: 'Group classes', icon: 'users' },
    { id: 'tutors', label: '1:1 tutors', icon: 'classes' },
  ];
  return (
    <div
      role="tablist"
      aria-label="Explore"
      className="flex gap-ds-1 rounded-ds-card bw-hair border-border bg-surface-card p-[4px]"
    >
      {options.map((o) => {
        const active = tab === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(o.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-ds-2 rounded-ds-btn px-ds-3 py-ds-2',
              'font-body text-[14px] font-extrabold cursor-pointer',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
              active ? 'bg-ink text-on-ink' : 'bg-transparent text-ink-muted'
            )}
          >
            <DsIcon name={o.icon} size={18} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SearchRow({
  searchQuery,
  onSearchChange,
  filtersApplied,
  onOpenFilters,
}: Pick<ParentExploreV2Props, 'searchQuery' | 'onSearchChange' | 'filtersApplied' | 'onOpenFilters'>) {
  return (
    <div className="flex gap-ds-2">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-ds-3 top-1/2 -translate-y-1/2 text-ink-muted">
          <DsIcon name="search" size={18} />
        </span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Subject or tutor"
          aria-label="Search by subject or tutor"
          className={cn(
            'h-[44px] w-full rounded-ds-card bw-hair border-border bg-surface-card',
            'pl-[38px] pr-ds-3 font-body text-[14px] text-ink placeholder:text-ink-muted',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
          )}
        />
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        className={cn(
          'flex h-[44px] shrink-0 items-center gap-ds-2 rounded-ds-card bw-hair bg-surface-card',
          'px-ds-3 font-body text-[14px] font-extrabold text-ink cursor-pointer',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
          filtersApplied ? 'border-ink' : 'border-border'
        )}
      >
        <DsIcon name="filters" size={18} />
        Filters
        {filtersApplied ? <span className="h-[6px] w-[6px] rounded-ds-full bg-brand" aria-hidden /> : null}
      </button>
    </div>
  );
}

function ChipRow({ chips, activeChip, onChipChange }: Pick<ParentExploreV2Props, 'chips' | 'activeChip' | 'onChipChange'>) {
  return (
    // Horizontally scrollable, and the scrollbar is hidden rather than styled:
    // the frame shows the row bleeding off the right edge as the affordance.
    <div className="-mx-ds-4 overflow-x-auto px-ds-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-ds-2">
        {chips.map((c) => {
          const active = activeChip === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => onChipChange(c)}
              className={cn(
                'rounded-ds-full bw-hair px-ds-3 py-[7px] font-body text-[13px] font-extrabold cursor-pointer',
                'whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
                active ? 'bg-ink border-ink text-on-ink' : 'bg-surface-card border-border text-ink'
              )}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CountRow({ left, right }: { left: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <p className="font-body text-[13px] text-ink-muted">{left}</p>
      {right ? <p className="font-body text-[13px] text-ink-muted">{right}</p> : null}
    </div>
  );
}

function LessonCard({
  lesson,
  enrolled,
  href,
}: {
  lesson: ExploreLesson;
  enrolled: boolean;
  href: string;
}) {
  const schedule = scheduleLine(lesson);
  return (
    <Link
      href={href}
      className={cn(
        'block overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
      )}
    >
      {lesson.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- class covers are
        // user uploads on an allow-listed Supabase domain; next/image buys
        // nothing here and would need a per-class size hint.
        <img src={lesson.coverImage} alt="" className="h-[112px] w-full object-cover" />
      ) : (
        <div className={cn('h-[112px] w-full bg-gradient-to-br', lesson.color || 'from-brand to-brand-deep')} />
      )}

      <div className="flex flex-col gap-ds-2 p-ds-card">
        <div className="flex items-start justify-between gap-ds-3">
          <h3 className="font-display text-[16px] font-extrabold leading-[20px] text-ink">{lesson.title}</h3>
          {enrolled ? (
            <Tag tone="brand">Enrolled</Tag>
          ) : (
            <p className="shrink-0 whitespace-nowrap font-body text-[15px] font-extrabold text-ink">
              {ttd(lesson.monthlyPrice)}
              <span className="font-normal text-ink-muted"> /mo</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-ds-2">
          {lesson.tutorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- see above
            <img src={lesson.tutorAvatar} alt="" className="h-[20px] w-[20px] rounded-ds-full object-cover" />
          ) : (
            <span className="flex h-[20px] w-[20px] items-center justify-center rounded-ds-full bg-surface-sunken font-body text-[10px] font-extrabold text-ink-muted">
              {lesson.tutor.slice(0, 1).toUpperCase()}
            </span>
          )}
          <p className="truncate font-body text-[13px] text-ink-muted">
            {lesson.tutor}
            {schedule ? <span> · {schedule}</span> : null}
          </p>
        </div>
      </div>
    </Link>
  );
}

function TutorCard({ tutor, href }: { tutor: ExploreTutor; href: string }) {
  const rate = lowestRate(tutor);
  const subjects = subjectSummary(tutor);
  const credibility = credibilityLine(tutor);
  const isNew = tutor.total_reviews === 0;
  const name = tutorName(tutor);

  return (
    <Link
      href={href}
      className={cn(
        'flex gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
      )}
    >
      {tutor.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- see LessonCard
        <img src={tutor.avatar_url} alt="" className="h-[56px] w-[56px] shrink-0 rounded-ds-sm object-cover" />
      ) : (
        <span className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-ds-sm bg-surface-sunken font-display text-[18px] font-extrabold text-ink-muted">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="flex items-start justify-between gap-ds-3">
          <h3 className="font-display text-[16px] font-extrabold leading-[20px] text-ink">{name}</h3>
          {rate !== null ? (
            <p className="shrink-0 whitespace-nowrap font-body text-[15px] font-extrabold text-ink">
              {ttd(rate)}
              <span className="font-normal text-ink-muted"> /hr</span>
            </p>
          ) : null}
        </div>

        {subjects ? <p className="truncate font-body text-[13px] text-ink-muted">{subjects}</p> : null}
        {credibility ? <p className="truncate font-body text-[13px] text-ink-muted">{credibility}</p> : null}

        {isNew ? (
          <span className="mt-ds-1 self-start">
            <Tag tone="brand">New</Tag>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function Skeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-ds-card bg-surface-sunken" style={{ height }} />;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-center">
      <p className="font-display text-[16px] font-extrabold text-ink">{title}</p>
      <p className="mt-ds-1 font-body text-[13px] text-ink-muted">{body}</p>
    </div>
  );
}

/* ── the screen ──────────────────────────────────────────────────────── */

export function ParentExploreV2(props: ParentExploreV2Props) {
  const {
    tab, onTabChange, searchQuery, onSearchChange, chips, activeChip, onChipChange,
    lessons, tutors, enrolledIds, loadingLessons, loadingTutors,
    classHref, enrolledClassHref, tutorHref, filtersApplied, onOpenFilters,
  } = props;

  const showingLessons = tab === 'lessons';
  const loading = showingLessons ? loadingLessons : loadingTutors;
  const enrolledCount = lessons.reduce((n, l) => n + (enrolledIds.has(l.id) ? 1 : 0), 0);

  return (
    <div className="flex flex-col gap-ds-4">
      <h1 className="font-display text-[30px] font-extrabold leading-[34px] text-ink">Explore</h1>

      <SegmentedTabs tab={tab} onTabChange={onTabChange} />

      <SearchRow
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        filtersApplied={filtersApplied}
        onOpenFilters={onOpenFilters}
      />

      <ChipRow chips={chips} activeChip={activeChip} onChipChange={onChipChange} />

      {loading ? (
        <div className="flex flex-col gap-ds-3">
          <Skeleton height={showingLessons ? 210 : 96} />
          <Skeleton height={showingLessons ? 210 : 96} />
          <Skeleton height={showingLessons ? 210 : 96} />
        </div>
      ) : showingLessons ? (
        <>
          <CountRow
            left={lessons.length === 1 ? '1 class' : `${lessons.length} classes`}
            right={enrolledCount > 0 ? `${enrolledCount} enrolled` : null}
          />
          {lessons.length === 0 ? (
            <EmptyState
              title="No classes match"
              body="Try a different subject, or clear the filters."
            />
          ) : (
            <div className="flex flex-col gap-ds-3">
              {lessons.map((l) => {
                const enrolled = enrolledIds.has(l.id);
                return (
                  <LessonCard
                    key={l.id}
                    lesson={l}
                    enrolled={enrolled}
                    href={enrolled ? enrolledClassHref(l.id) : classHref(l.id)}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <CountRow left={tutors.length === 1 ? '1 tutor' : `${tutors.length} tutors`} />
          {tutors.length === 0 ? (
            <EmptyState
              title="No tutors match"
              body="Try a different subject, or clear the filters."
            />
          ) : (
            <div className="flex flex-col gap-ds-3">
              {tutors.map((t) => (
                <TutorCard key={t.id} tutor={t} href={tutorHref(t.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ParentExploreV2;
