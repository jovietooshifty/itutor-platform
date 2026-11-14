'use client';

/**
 * A tutor, as a student sees them, new UI — Figma `31:3796` (D1 Tutor
 * profile), file rwytRx6xmRHf4AMzpxAznd.
 *
 * PRESENTATION ONLY. app/student/tutors/[tutorId]/page.tsx keeps every piece
 * of logic it had — loading, the username→uuid redirect, the dev-account
 * hiding, the paid-classes flag — and hands this component what to draw.
 * "Book a lesson" opens the shared stepped sheet,
 * components/booking/OneToOneBookingSheet (the old modal stays for the old UI).
 *
 * From the frame: photo + name + subjects + tag, a three-cell stat strip
 * (rate · sessions · rating), About with Read more, Teaches chips, Reviews,
 * and a pinned bar with the rate and "Book a lesson" (StudentTutorBookBar,
 * passed to the shell as its bottomBar).
 *
 * Changes from the frame, each for a data reason:
 * - The middle stat is completed sessions, not "15+ years": no field records
 *   teaching experience.
 * - The heart (save tutor) is omitted: there is no saved-tutors backend.
 * - "Classes by …" is added (no frame, PROVISIONAL): the old profile led with
 *   the tutor's classes, and dropping them would hide the main thing a tutor
 *   sells. Same /api/groups?tutor_id read as the parent tutor page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, SealCheck, Star } from '@phosphor-icons/react';
import { ClassRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';
import { scheduleLine } from '@/components/parent/v2/ParentClassDetailV2';

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 2 });

export type TutorV2Data = {
  id: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string | null;
  subjects: Array<{ id: string; name: string; price: number }>;
  averageRating: number | null;
  totalReviews: number;
  completedSessions: number;
};

export type TutorV2Review = { id: string; stars: number; comment: string | null; who: string; when: string };

type ClassItem = { id: string; name: string; subject: string | null; price: number | null; schedule: string | null };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function StudentTutorProfileV2({
  tutor,
  reviews,
  rateLabel,
  showBook,
}: {
  tutor: TutorV2Data;
  reviews: TutorV2Review[];
  /** "TT$100" / "Free" / null when the tutor has no rate. */
  rateLabel: string | null;
  showBook: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const first = tutor.name.split(' ')[0] || tutor.name;
  const isNew = tutor.totalReviews === 0;
  const longBio = (tutor.bio ?? '').length > 220;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups?tutor_id=${encodeURIComponent(tutor.id)}&limit=20`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setClasses(
          (j.groups ?? []).map((g: any) => ({
            id: g.id,
            name: g.name,
            subject: g.subject ?? null,
            price: g.price_monthly ?? null,
            schedule: scheduleLine({ sessions: g.sessions ?? [], schedule_display: g.schedule_display ?? null }),
          }))
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tutor.id]);

  const back = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/student/find-tutors');
  };

  const stats = [
    { big: rateLabel ?? '—', small: rateLabel && rateLabel !== 'Free' ? 'per hour' : rateLabel ? '1:1 lessons' : 'no rate yet' },
    { big: String(tutor.completedSessions), small: tutor.completedSessions === 1 ? 'session' : 'sessions' },
    isNew
      ? { big: 'New', small: 'no reviews' }
      : { big: (tutor.averageRating ?? 0).toFixed(1), small: `${tutor.totalReviews} review${tutor.totalReviews === 1 ? '' : 's'}`, star: true },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <button
        type="button"
        onClick={back}
        className="ds-press -ml-ds-1 inline-flex min-h-[44px] items-center gap-[6px] self-start border-0 bg-transparent px-ds-1 font-body text-[15px] font-extrabold text-ink cursor-pointer"
      >
        <ArrowLeft size={20} weight="bold" aria-hidden /> Explore
      </button>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-ds-8">
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-ds-4">
            {tutor.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tutor.avatarUrl} alt="" className="size-[104px] shrink-0 rounded-[14px] object-cover" />
            ) : (
              <span className="flex size-[104px] shrink-0 items-center justify-center rounded-[14px] bg-brand font-display text-[34px] font-black text-ink">
                {initials(tutor.name)}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <h1 className="m-0 font-display text-[24px] font-extrabold leading-[26.4px] tracking-[-0.24px] text-ink">{tutor.name}</h1>
              {tutor.subjects.length ? (
                <span className="font-body text-[16px] text-ink-muted">{tutor.subjects.map((s) => s.name).join(' · ')}</span>
              ) : null}
              <span className="flex flex-wrap gap-ds-1h">
                {tutor.verified ? (
                  <span className="inline-flex items-center gap-1 rounded-[4px] bg-ink px-2 py-[3px] font-body text-[12px] font-extrabold tracking-[0.72px] text-brand">
                    <SealCheck size={13} weight="fill" aria-hidden /> VERIFIED
                  </span>
                ) : null}
                {isNew ? (
                  <span className="rounded-[4px] bw-hair border-brand-legacy px-2 py-[3px] font-body text-[12px] font-extrabold tracking-[0.72px] text-brand-edge">
                    NEW
                  </span>
                ) : null}
              </span>
            </div>
          </div>

          <div className="flex rounded-ds-sm bw-bold border-ink bg-surface-card">
            {stats.map((s, i) => (
              <div key={i} className={cn('flex min-w-0 flex-1 flex-col items-center gap-[2px] px-[6px] py-ds-3', i === 1 && 'border-x border-line-soft')}>
                <span className="inline-flex items-center gap-1 font-display text-[18px] font-extrabold tracking-[-0.18px] text-ink">
                  {'star' in s && s.star ? <Star size={15} weight="fill" className="text-accent-orange" aria-hidden /> : null}
                  {s.big}
                </span>
                <span className="font-body text-[13px] font-extrabold text-ink-muted">{s.small}</span>
              </div>
            ))}
          </div>

          {tutor.bio ? (
            <section className="flex flex-col gap-ds-2">
              <h2 className="m-0 font-display text-[20px] font-extrabold leading-[23px] tracking-[-0.2px] text-ink">About</h2>
              <p className={cn('m-0 whitespace-pre-line font-body text-[16px] leading-[24px] text-ink', !expanded && longBio && 'line-clamp-3')}>
                {tutor.bio}
              </p>
              {longBio ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="min-h-[44px] self-start border-0 bg-transparent p-0 font-body text-[16px] font-extrabold text-brand-edge cursor-pointer"
                >
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </section>
          ) : null}

          {tutor.subjects.length ? (
            <section className="flex flex-col gap-ds-2">
              <h2 className="m-0 font-display text-[20px] font-extrabold leading-[23px] tracking-[-0.2px] text-ink">Teaches</h2>
              <div className="flex flex-wrap gap-ds-2">
                {tutor.subjects.map((s) => (
                  <span key={s.id} className="inline-flex h-10 items-center rounded-[20px] bw-hair border-border bg-surface-card px-[14px] font-body text-[15px] font-bold text-ink">
                    {s.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-[18px]">
          {classes.length > 0 ? (
            <section className="flex flex-col gap-ds-2">
              <h2 className="m-0 font-display text-[20px] font-extrabold leading-[23px] tracking-[-0.2px] text-ink">Classes by {first}</h2>
              {classes.map((c) => {
                const label = c.subject || c.name;
                return (
                  <Link key={c.id} href={`/student/explore/${c.id}`} className="block no-underline">
                    <ClassRow
                      code={subjectCode(label)}
                      color={subjectColor(label)}
                      title={c.name}
                      meta={c.schedule ?? undefined}
                      price={c.price ? `TT$${TT.format(c.price)}` : 'Free'}
                      unit={c.price ? '/month' : ''}
                    />
                  </Link>
                );
              })}
            </section>
          ) : null}

          <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-4">
            <h2 className="m-0 font-display text-[20px] font-extrabold leading-[23px] tracking-[-0.2px] text-ink">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="m-0 font-body text-[16px] text-ink-muted">
                {showBook ? 'No reviews yet. Yours could be the first.' : 'No reviews yet.'}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
                {reviews.map((r) => (
                  <li key={r.id} className="flex flex-col gap-ds-1 py-ds-3 first:pt-0 last:pb-0">
                    <span className="flex items-center gap-ds-2">
                      <span className="inline-flex" aria-label={`${r.stars} out of 5`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} size={14} weight="fill" className={i < r.stars ? 'text-accent-orange' : 'text-border'} aria-hidden />
                        ))}
                      </span>
                      <span className="font-body text-[14px] font-extrabold text-ink">{r.who}</span>
                      <span className="font-body text-[13px] text-ink-muted">{r.when}</span>
                    </span>
                    {r.comment ? <p className="m-0 font-body text-[15px] leading-[21px] text-ink">{r.comment}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Frame 31:3855 — the pinned rate + "Book a lesson" bar. */
export function StudentTutorBookBar({
  rateLabel,
  onBook,
  disabled,
  note,
}: {
  rateLabel: string | null;
  onBook: () => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-ds-3 bw-t-hair border-border bg-surface-card px-ds-4 pb-ds-4 pt-ds-3 md:px-ds-5">
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="font-display text-[20px] font-extrabold tracking-[-0.2px] text-ink">
          {rateLabel ?? 'No rate yet'}
          {rateLabel && rateLabel !== 'Free' ? <span className="ml-1 text-[13px] text-ink-muted">/hr</span> : null}
        </span>
        <span className="truncate font-body text-[13px] text-ink-muted">{note ?? 'Online, 1-on-1'}</span>
      </div>
      <button
        type="button"
        onClick={onBook}
        disabled={disabled}
        className="h-[50px] shrink-0 rounded-ds-sm border-0 bg-[#13804a] transition-[background-color,transform,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent] enabled:hover:bg-[#0f6e3f] enabled:active:translate-y-[2px] enabled:active:shadow-[0_2px_0_#0d4f2d] px-[18px] font-body text-[16px] font-extrabold text-white shadow-[0_4px_0_#0d4f2d] cursor-pointer disabled:opacity-50 disabled:shadow-none"
      >
        Book a lesson
      </button>
    </div>
  );
}
