'use client';

/**
 * A tutor, as a parent sees them, new UI. Reached from Explore's 1:1 tutors
 * list, from a class page and from Messages.
 *
 * FIGMA: "Tutor – persad" (160:5389), with "Verified by iTutor sheet"
 * (160:6638) and "How iTutor verifies" (160:6737). Built from system parts:
 * header block, a NavRow for the verification row, a SummaryRow card for the
 * 1:1 price, then About, Classes and Reviews.
 *
 * WHERE THE DATA COMES FROM
 * - Identity, verification, bio: the tutor's public profile row. The scoped
 *   /api/parent/tutors adds "teaches your child" when one of your children
 *   is already taught by them.
 * - SUBJECTS AND 1:1 PRICE: `tutor_subjects`, exactly what Explore's 1:1 tutor
 *   list reads. The page used to derive subjects from the tutor's CLASSES, so
 *   a tutor listed as "CSEC English A, Mathematics +2" came up as "History"
 *   (the subject of the one class shown), and a tutor with no classes had no
 *   subjects and no price at all.
 * - Classes: /api/groups?tutor_id=, which applies the marketplace gates (see
 *   the note where `classes` is set about why this can be fewer than Explore).
 * - Reviews and 1:1 hours: /api/parent/tutors/[id], else the public reviews.
 *
 * VERIFICATION IS STATED AS IT IS. The Figma sheet lists "Government ID
 * checked" and "2 references confirmed". iTutor does neither: verification is
 * a reviewer checking the tutor's CXC results slip (tutor_verified_subjects).
 * The sheet says what was checked and, plainly, what was not — implying
 * vetting the platform has not done would be worse than saying nothing.
 *
 * BOOK A 1:1 — the parent books for their child directly: ParentBookOneToOneSheet
 * picks child, subject, length and slot, then POST /api/parent/bookings/direct-book
 * (the student booking logic with the child as student, the parent as payer)
 * hands off to /payments/checkout. PROVISIONAL visuals: no frame.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Check, ShieldCheck, X } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase/client';
import { Button, ClassRow, NavRow, StepList, SummaryRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { Sheet } from './Sheet';
import { ParentBookOneToOneSheet } from './ParentBookOneToOneSheet';
import { subjectCode, subjectColor } from './subjectTile';
import { scheduleLine } from './ParentClassDetailV2';

type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  /** 'VERIFIED' | 'PROCESSING' | 'UNVERIFIED' | … as stored. */
  verification: string | null;
  verifiedAt: string | null;
  bio: string | null;
  /** 1:1 bookings switched off by the tutor. */
  pausedOneToOne: boolean;
  /** From /api/parent/tutors: which of YOUR children this tutor teaches. */
  teaches: string[];
  /**
   * One of your children is taught by this tutor. That relationship is what
   * lets a parent open a thread (/api/parent/tutors: "a parent cannot open a
   * thread with an arbitrary tutor") — without it there is no Message button.
   */
  related: boolean;
};
type Subject = { id: string; label: string; rate: number | null };
type VerifiedSubject = { id: string; label: string; exam: string; grade: string | null };
type Review = { id: string; stars: number; comment: string | null; who: string; when: string };
type ClassItem = { id: string; name: string; subject: string | null; price: number | null; schedule: string | null };

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 2 });
const ttd = (n: number) => `TT$${TT.format(n)}`;
const TZ = 'America/Port_of_Spain';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || '?';
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-[17px] font-extrabold leading-[22px] text-ink">{children}</h2>;
}

/** The 30/34px square shield tile from 160:5410 / 160:6708. Grey when not verified. */
function ShieldTile({ on, size }: { on: boolean; size: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-ds-sm',
        on ? 'bg-brand text-ink' : 'bg-surface-sunken text-ink-muted'
      )}
    >
      <ShieldCheck size={16} weight="bold" />
    </span>
  );
}

function CheckLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-ds-3">
      <span
        aria-hidden
        className={cn(
          'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-ds-sm',
          ok ? 'bg-brand text-ink' : 'bg-surface-sunken text-ink-muted'
        )}
      >
        {ok ? <Check size={14} weight="bold" /> : <X size={14} weight="bold" />}
      </span>
      <span className="font-body text-[13.5px] leading-[20px] text-ink-muted">{children}</span>
    </div>
  );
}

export default function ParentTutorProfileV2() {
  const { tutorId } = useParams<{ tutorId: string }>();
  const router = useRouter();
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [verifiedSubjects, setVerifiedSubjects] = useState<VerifiedSubject[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });
  const [availability, setAvailability] = useState<Array<{ day: string; windows: string[] }>>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [childNames, setChildNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<'verified' | 'how' | 'book' | null>(null);

  const loadProfile = useCallback(async (): Promise<Record<string, any> | null> => {
    // Tiered: tutor_verified_at / pause_1on1 are newer columns, and one
    // missing column fails the whole select.
    const tiers = [
      'id, full_name, display_name, avatar_url, bio, tutor_verification_status, tutor_verified_at, pause_1on1, role',
      'id, full_name, display_name, avatar_url, bio, tutor_verification_status, role',
    ];
    for (const cols of tiers) {
      const { data, error } = await supabase.from('profiles').select(cols).eq('id', tutorId).maybeSingle();
      if (!error) return (data as Record<string, any> | null) ?? null;
    }
    return null;
  }, [tutorId]);

  const loadSubjects = useCallback(async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('tutor_subjects')
      .select('subject_id, price_per_hour_ttd, subjects:subject_id(id, name, label)')
      .eq('tutor_id', tutorId);
    return error ? [] : ((data as any[]) ?? []);
  }, [tutorId]);

  useEffect(() => {
    const json = (url: string) =>
      fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    (async () => {
      try {
        const [profile, listRes, detailRes, publicReviews, groupsRes, subjectRows, verifiedRes, summaryRes] =
          await Promise.all([
            loadProfile().catch(() => null),
            json('/api/parent/tutors'),
            json(`/api/parent/tutors/${tutorId}`),
            json(`/api/public/tutors/${tutorId}/reviews?limit=5`),
            json(`/api/groups?tutor_id=${tutorId}&limit=50`),
            loadSubjects().catch(() => []),
            json(`/api/public/tutors/${tutorId}/verified-subjects`),
            json('/api/parent/children/summary'),
          ]);

        const scoped = (listRes?.tutors ?? []).find((t: { id: string }) => t.id === tutorId);
        if (profile && profile.role === 'tutor') {
          setTutor({
            id: profile.id,
            name: profile.display_name || profile.full_name || 'Tutor',
            avatar: profile.avatar_url ?? null,
            verification: profile.tutor_verification_status ?? null,
            verifiedAt: profile.tutor_verified_at ?? null,
            bio: profile.bio ?? null,
            pausedOneToOne: profile.pause_1on1 === true,
            teaches: scoped?.teaches ?? [],
            related: Boolean(scoped),
          });
        } else if (scoped) {
          setTutor({
            id: scoped.id,
            name: scoped.name,
            avatar: scoped.avatar,
            verification: scoped.verified ? 'VERIFIED' : null,
            verifiedAt: null,
            bio: scoped.bio,
            pausedOneToOne: false,
            teaches: scoped.teaches ?? [],
            related: true,
          });
        }

        setSubjects(
          subjectRows
            .map((r): Subject | null => {
              const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
              if (!s) return null;
              const rate = r.price_per_hour_ttd == null ? null : Number(r.price_per_hour_ttd);
              return {
                id: String(s.id),
                // `label` first, as Explore's tutor card does ("CSEC English A").
                label: String(s.label || s.name || ''),
                rate: Number.isFinite(rate) ? rate : null,
              };
            })
            .filter((s): s is Subject => Boolean(s && s.label))
            .sort((a, b) => a.label.localeCompare(b.label))
        );

        setVerifiedSubjects(
          ((verifiedRes?.subjects ?? []) as any[]).map((v) => ({
            id: String(v.id),
            label: String(v.subjects?.name || 'Subject'),
            exam: String(v.exam_type || ''),
            grade: v.grade != null ? String(v.grade) : null,
          }))
        );

        setChildNames(((summaryRes?.children ?? []) as Array<{ name: string }>).map((c) => c.name));

        if (detailRes) {
          setAvailability(detailRes.availability ?? []);
          setReviews(detailRes.reviews ?? []);
          setRating({ avg: detailRes.averageRating ?? null, count: detailRes.ratingCount ?? 0 });
        } else if (publicReviews) {
          setRating({ avg: publicReviews.averageRating ?? null, count: publicReviews.ratingCount ?? 0 });
          setReviews(
            (publicReviews.reviews ?? []).map((r: any) => ({
              id: r.id,
              stars: r.stars,
              comment: r.comment,
              who: (r.student?.full_name || 'A student').split(' ')[0],
              when: new Date(r.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
            }))
          );
        }

        // The marketplace's LISTED classes. /api/groups drops any class whose
        // schedule resolves to nothing (the "no schedule = not listed" rule),
        // so this can be shorter than Explore's Classes tab, which reads
        // `groups` straight from the table and does not apply that gate.
        setClasses(
          (groupsRes?.groups ?? []).map((g: any) => ({
            id: g.id,
            name: g.name,
            subject: g.subject,
            price: g.price_monthly ?? null,
            schedule: scheduleLine({ sessions: g.sessions ?? [], schedule_display: g.schedule_display ?? null }),
          }))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [tutorId, loadProfile, loadSubjects]);

  if (loading) {
    return (
      <DetailScreen backLabel="Back" fallbackHref="/parent/classes">
        <DetailSkeleton rows={3} />
      </DetailScreen>
    );
  }

  if (!tutor) {
    return (
      <DetailScreen backLabel="Back" fallbackHref="/parent/classes" title="Tutor not found">
        <EmptyCard title="This profile is not available" body="The tutor may have paused their profile." />
      </DetailScreen>
    );
  }

  const first = tutor.name.split(' ')[0];
  const verified = tutor.verification === 'VERIFIED';
  const checking = tutor.verification === 'PROCESSING' || tutor.verification === 'PENDING';
  const statusTitle = verified ? 'Verified by iTutor' : checking ? 'Check in progress' : 'Not confirmed yet';
  const rates = subjects.map((s) => s.rate).filter((n): n is number => typeof n === 'number' && n > 0);
  const lowRate = rates.length ? Math.min(...rates) : null;
  const highRate = rates.length ? Math.max(...rates) : null;
  const rateLabel =
    lowRate == null ? null : lowRate === highRate ? `${ttd(lowRate)} per hour` : `From ${ttd(lowRate)} per hour`;
  const canBook = rateLabel != null && !tutor.pausedOneToOne;
  const headerLine = subjects.length
    ? subjects
        .slice(0, 2)
        .map((s) => s.label)
        .join(', ') + (subjects.length > 2 ? ` +${subjects.length - 2}` : '')
    : null;
  const verifiedOn = tutor.verifiedAt
    ? new Date(tutor.verifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })
    : null;
  const childLabel = childNames.length === 1 ? childNames[0].split(' ')[0] : 'Your child';
  const messageHref = `/parent/messages?tutor=${encodeURIComponent(tutor.id)}`;

  return (
    <DetailScreen backLabel="Back" fallbackHref="/parent/classes">
      {/* Header — 160:5400: 72px ink tile with brand initials, name, one line. */}
      <div className="flex items-center gap-ds-3">
        <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-ds-card bg-ink font-display text-[22px] font-extrabold text-brand">
          {tutor.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tutor.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsOf(tutor.name)
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-ds-1">
          <h1 className="font-display text-[22px] font-extrabold leading-[23px] tracking-[-0.28px] text-ink">{tutor.name}</h1>
          {headerLine ? <p className="font-body text-[13px] text-ink-muted">{headerLine}</p> : null}
          {rating.avg != null && rating.count > 0 ? (
            <p className="font-body text-[13px] text-ink-muted">
              ★ {rating.avg.toFixed(1)} · {rating.count} {rating.count === 1 ? 'review' : 'reviews'}
            </p>
          ) : null}
        </div>
      </div>

      {/* Verification row — 160:5408. Unverified keeps the honest wording. */}
      <NavRow
        onClick={() => setSheet('verified')}
        tile={<ShieldTile on={verified} size={30} />}
        title={statusTitle}
        meta={verified ? 'Tap to see what was checked' : `iTutor has not confirmed ${first}’s results yet`}
      />

      {/* Facts — 160:5423. The 1:1 row is always there: a tutor with no hourly
          price says so rather than leaving a gap. */}
      <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
        <SummaryRow label="1:1 lessons" value={tutor.pausedOneToOne ? 'Paused by tutor' : rateLabel ?? 'No hourly price set'} />
        <SummaryRow label="Subjects" value={subjects.length ? subjects.map((s) => s.label).join(', ') : 'None listed yet'} />
        {tutor.teaches.length > 0 ? <SummaryRow label="Teaches your child" value={tutor.teaches.join(', ')} /> : null}
      </div>

      {tutor.bio ? (
        <section className="flex flex-col gap-ds-2">
          <SectionTitle>About {tutor.name}</SectionTitle>
          <p className="whitespace-pre-line font-body text-[14px] leading-[20.3px] text-ink">{tutor.bio}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-ds-2">
        <SectionTitle>Classes by {tutor.name}</SectionTitle>
        {classes.length === 0 ? (
          <EmptyCard
            title="No open classes right now"
            body={
              rateLabel
                ? `${first} teaches 1:1 lessons. Group classes appear here when ${first} opens one.`
                : `Group classes appear here when ${first} opens one.`
            }
          />
        ) : (
          classes.map((c) => {
            const label = c.subject || c.name;
            return (
              <a key={c.id} href={`/parent/classes/${c.id}`} className="block no-underline">
                <ClassRow
                  code={subjectCode(label)}
                  color={subjectColor(label)}
                  title={c.name}
                  meta={c.schedule ?? undefined}
                  price={c.price ? ttd(c.price) : 'Free'}
                  unit={c.price ? '/month' : ''}
                />
              </a>
            );
          })
        )}
      </section>

      {availability.length > 0 ? (
        <section className="flex flex-col gap-ds-2">
          <SectionTitle>1:1 hours</SectionTitle>
          <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
            {availability.map((a) => (
              <SummaryRow key={a.day} label={a.day} value={a.windows.join(', ')} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-ds-2">
        <SectionTitle>Reviews</SectionTitle>
        {reviews.length === 0 ? (
          <EmptyCard
            title={rating.count > 0 ? 'No written reviews yet' : 'No reviews yet'}
            body={
              rating.count > 0
                ? `${rating.count} ${rating.count === 1 ? 'student has' : 'students have'} rated ${first} without writing a review.`
                : 'Common for a newer tutor. It does not mean anything is wrong.'
            }
          />
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="flex flex-col gap-ds-1 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
              <div className="flex items-baseline justify-between gap-ds-2">
                <span className="font-display text-[15px] font-extrabold text-ink" aria-label={`${r.stars} out of 5`}>
                  {'★'.repeat(Math.round(r.stars))}
                  <span className="text-line-soft">{'★'.repeat(Math.max(0, 5 - Math.round(r.stars)))}</span>
                </span>
                <span className="font-body text-[13px] text-ink-muted">
                  {r.who} · {r.when}
                </span>
              </div>
              {r.comment ? <p className="font-body text-[14px] text-ink">{r.comment}</p> : null}
            </div>
          ))
        )}
      </section>

      {canBook || tutor.related ? (
      <div className="sticky bottom-0 -mx-ds-4 flex flex-col gap-ds-2 bw-t-hair border-line-soft bg-surface-page px-ds-4 pb-ds-4 pt-ds-3 md:static md:mx-0 md:flex-row md:border-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
        {canBook ? (
          <Button block size="lg" variant="primary" onClick={() => setSheet('book')}>
            Book a 1:1
          </Button>
        ) : null}
        {tutor.related ? (
          <Button block size="lg" variant={canBook ? 'outline' : 'dark'} onClick={() => router.push(messageHref)}>
            Message {first}
          </Button>
        ) : null}
      </div>
      ) : null}

      {/* Verified by iTutor — 160:6638. Content is what iTutor actually checks. */}
      <Sheet
        open={sheet === 'verified'}
        onClose={() => setSheet(null)}
        label={statusTitle}
        title={
          <span className="flex items-center gap-ds-3">
            <ShieldTile on={verified} size={34} />
            {statusTitle}
          </span>
        }
        footer={
          <>
            <Button variant="outline" block size="lg" onClick={() => setSheet('how')}>
              How does iTutor verify?
            </Button>
            <Button variant="dark" block size="lg" onClick={() => setSheet(null)}>
              Close
            </Button>
          </>
        }
      >
        <p className="font-body text-[11px] font-extrabold uppercase tracking-[0.99px] text-ink-muted">
          {tutor.name}
          {verified && verifiedOn ? ` · Verified on ${verifiedOn}` : ''}
        </p>
        {verified ? (
          <>
            <CheckLine ok>Exam results checked by an iTutor reviewer</CheckLine>
            {verifiedSubjects.map((v) => (
              <CheckLine ok key={v.id}>
                {[v.exam, v.label].filter(Boolean).join(' ')}
                {v.grade ? ` · Grade ${v.grade}` : ''}
              </CheckLine>
            ))}
            <CheckLine ok={false}>No ID, reference or background check. iTutor does not run those.</CheckLine>
          </>
        ) : (
          <p className="font-body text-[14px] text-ink">
            {checking
              ? `${first} has sent in their results and an iTutor reviewer has not finished checking them.`
              : `iTutor has not checked ${first}’s results yet.`}{' '}
            They can still teach on iTutor, so this is worth knowing before you approve a booking.
            {tutor.related ? ` You can ask ${first} anything first in Messages.` : ''}
          </p>
        )}
      </Sheet>

      {/* How iTutor verifies — 160:6737, as the next step of the same sheet. */}
      <Sheet
        open={sheet === 'how'}
        onClose={() => setSheet(null)}
        title="How iTutor verifies"
        footer={
          <Button variant="primary" block size="lg" onClick={() => setSheet('verified')}>
            Back to {first}
          </Button>
        }
      >
        <StepList
          steps={[
            { title: 'Results slip', detail: 'The tutor uploads their CSEC or CAPE results slip.' },
            {
              title: 'Reviewer check',
              detail: 'An iTutor reviewer checks the slip and confirms each subject and grade on it.',
            },
            {
              title: 'Verified badge',
              detail: 'Only then does the tutor show as Verified by iTutor, with the confirmed subjects listed.',
            },
          ]}
        />
        <p className="font-body text-[13px] text-ink-muted">
          iTutor does not check ID documents, contact references or run background checks.
        </p>
      </Sheet>

      {/* Book a 1:1 — the parent books for their child directly
          (ParentBookOneToOneSheet, POST /api/parent/bookings/direct-book). */}
      <ParentBookOneToOneSheet
        open={sheet === 'book'}
        onClose={() => setSheet(null)}
        tutorId={tutor.id}
        tutorFirstName={first}
        subjects={subjects}
      />
    </DetailScreen>
  );
}
