'use client';

/**
 * A tutor, as a parent sees them, new UI. Reached from Explore's 1:1 tutors
 * list and from a class page.
 *
 * PROVISIONAL VISUALS: no Figma frame. Built from system parts.
 *
 * WHERE THE DATA COMES FROM. The old page read only /api/parent/tutors, which
 * lists tutors who ALREADY teach one of your children — so every tutor a parent
 * opened from Explore came up "doesn't teach any of your children". This tries
 * that scoped endpoint first (it carries "teaches", availability and the
 * private reviews summary), and otherwise falls back to what Explore itself
 * shows anyone: the tutor's public profile row, their public reviews and their
 * listed classes (/api/groups, which applies the marketplace gates).
 *
 * Changes from the old page:
 * - The blurred cover banner is gone; the tutor is introduced by photo and name.
 * - "Back to approvals" is a plain Back that returns wherever the parent was.
 * - The yellow "Not yet verified" banner is now a row in the facts list. The
 *   fact is still stated (a blank would read as approval); it no longer shouts.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button, ClassRow, SummaryRow, Tag } from '@/components/ui';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { subjectCode, subjectColor } from './subjectTile';
import { scheduleLine } from './ParentClassDetailV2';

type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  bio: string | null;
  /** From /api/parent/tutors: which of YOUR children this tutor teaches. */
  teaches: string[];
};
type Review = { id: string; stars: number; comment: string | null; who: string; when: string };
type ClassItem = { id: string; name: string; subject: string | null; price: number | null; schedule: string | null };

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 2 });

export default function ParentTutorProfileV2() {
  const { tutorId } = useParams<{ tutorId: string }>();
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });
  const [availability, setAvailability] = useState<Array<{ day: string; windows: string[] }>>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [listRes, detailRes, publicReviews, groupsRes] = await Promise.all([
          fetch('/api/parent/tutors', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/parent/tutors/${tutorId}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/public/tutors/${tutorId}/reviews?limit=5`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/groups?tutor_id=${tutorId}&limit=20`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        const scoped = (listRes?.tutors ?? []).find((t: { id: string }) => t.id === tutorId);
        if (scoped) {
          setTutor({
            id: scoped.id,
            name: scoped.name,
            avatar: scoped.avatar,
            verified: Boolean(scoped.verified),
            bio: scoped.bio,
            teaches: scoped.teaches ?? [],
          });
        } else {
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, display_name, avatar_url, bio, tutor_verification_status, role')
            .eq('id', tutorId)
            .maybeSingle();
          if (data && data.role === 'tutor') {
            setTutor({
              id: data.id,
              name: data.display_name || data.full_name || 'Tutor',
              avatar: data.avatar_url,
              verified: data.tutor_verification_status === 'VERIFIED',
              bio: data.bio,
              teaches: [],
            });
          }
        }

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
  }, [tutorId]);

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
  const subjects = [...new Set(classes.map((c) => c.subject).filter(Boolean))] as string[];

  return (
    <DetailScreen backLabel="Back" fallbackHref="/parent/classes">
      <div className="flex items-center gap-ds-3">
        <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-ds-card bg-surface-sunken font-display text-[28px] font-extrabold text-ink">
          {tutor.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tutor.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            tutor.name.charAt(0).toUpperCase()
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-ds-1">
          <h1 className="font-display text-[28px] font-extrabold leading-[32px] text-ink">{tutor.name}</h1>
          <div className="flex flex-wrap gap-ds-2">
            {tutor.verified ? <Tag tone="brand">Verified</Tag> : null}
            {rating.avg != null && rating.count > 0 ? (
              <Tag tone="outline">
                ★ {rating.avg.toFixed(1)} · {rating.count} {rating.count === 1 ? 'review' : 'reviews'}
              </Tag>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
        <SummaryRow
          label="Identity"
          value={tutor.verified ? 'Confirmed by iTutor' : 'Not confirmed yet'}
        />
        {tutor.teaches.length > 0 ? <SummaryRow label="Teaches your child" value={tutor.teaches.join(', ')} /> : null}
        {subjects.length > 0 ? <SummaryRow label="Subjects" value={subjects.slice(0, 4).join(', ')} /> : null}
        {classes.length > 0 ? (
          <SummaryRow label="Classes" value={`${classes.length} open`} />
        ) : null}
      </div>
      {!tutor.verified ? (
        <p className="-mt-ds-2 font-body text-[13px] text-ink-muted">
          iTutor has not yet checked {first}’s identity documents. Ask them anything first in Messages.
        </p>
      ) : null}

      {tutor.bio ? (
        <section className="flex flex-col gap-ds-2">
          <h2 className="font-display text-[18px] font-extrabold text-ink">About {first}</h2>
          <p className="whitespace-pre-line font-body text-[15px] leading-[22px] text-ink">{tutor.bio}</p>
        </section>
      ) : null}

      {classes.length > 0 ? (
        <section className="flex flex-col gap-ds-2">
          <h2 className="font-display text-[18px] font-extrabold text-ink">Classes by {first}</h2>
          {classes.map((c) => {
            const label = c.subject || c.name;
            return (
              <a key={c.id} href={`/parent/classes/${c.id}`} className="block no-underline">
                <ClassRow
                  code={subjectCode(label)}
                  color={subjectColor(label)}
                  title={c.name}
                  meta={c.schedule ?? undefined}
                  price={c.price ? `TT$${TT.format(c.price)}` : 'Free'}
                  unit={c.price ? '/month' : ''}
                />
              </a>
            );
          })}
        </section>
      ) : null}

      {availability.length > 0 ? (
        <section className="flex flex-col gap-ds-2">
          <h2 className="font-display text-[18px] font-extrabold text-ink">1:1 availability</h2>
          <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
            {availability.map((a) => (
              <SummaryRow key={a.day} label={a.day} value={a.windows.join(', ')} />
            ))}
          </div>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section className="flex flex-col gap-ds-2">
          <h2 className="font-display text-[18px] font-extrabold text-ink">Reviews</h2>
          {reviews.map((r) => (
            <div key={r.id} className="flex flex-col gap-ds-1 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
              <div className="flex items-baseline justify-between gap-ds-2">
                <span className="font-display text-[15px] font-extrabold text-ink" aria-label={`${r.stars} out of 5`}>
                  {'★'.repeat(Math.round(r.stars))}
                  <span className="text-line-soft">{'★'.repeat(5 - Math.round(r.stars))}</span>
                </span>
                <span className="font-body text-[13px] text-ink-muted">{r.who} · {r.when}</span>
              </div>
              {r.comment ? <p className="font-body text-[14px] text-ink">{r.comment}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      <div className="sticky bottom-0 -mx-ds-4 bw-t-hair border-line-soft bg-surface-page px-ds-4 pb-ds-4 pt-ds-3">
        <Button block size="lg" variant="dark" onClick={() => (window.location.href = `/parent/messages?tutor=${encodeURIComponent(tutor.id)}`)}>
          Message {first}
        </Button>
      </div>
    </DetailScreen>
  );
}
