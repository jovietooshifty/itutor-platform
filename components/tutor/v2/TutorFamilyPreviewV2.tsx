'use client';

/**
 * "View as a family" — /tutor/profile/preview.
 *
 * Draws the tutor's own profile with the SAME component families get today
 * (StudentTutorProfileV2, the new-UI tutor page at /student/tutors/[id]), fed
 * the same reads that page makes. It used to open /tutors/[username], an older
 * public page that families on the new UI never see. /student/tutors itself is
 * student-only, so a tutor cannot simply be sent there.
 *
 * Preview only: no booking bar, and the tutor's class cards open their own
 * class page instead of the student join page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import {
  StudentTutorProfileV2,
  type TutorV2Data,
  type TutorV2Review,
} from '@/components/student/v2/StudentTutorProfileV2';
import TutorV2Shell from './TutorV2Shell';

export default function TutorFamilyPreviewV2() {
  const { profile, loading } = useProfile();
  const [data, setData] = useState<{ tutor: TutorV2Data; reviews: TutorV2Review[]; rate: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading || !profile?.id) return;
    const id = profile.id;
    let live = true;
    (async () => {
      try {
        const [{ data: me }, { data: ts }, { data: subjects }, flags, summary, { count }] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, username, display_name, avatar_url, bio, tutor_verification_status')
            .eq('id', id)
            .single(),
          supabase.from('tutor_subjects').select('subject_id, price_per_hour_ttd').eq('tutor_id', id),
          supabase.from('subjects').select('id, name, label'),
          fetch('/api/feature-flags', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
          fetch(`/api/public/tutors/${id}/reviews?limit=5&offset=0`, { cache: 'no-store' })
            .then((r) => r.json())
            .catch(() => ({})),
          supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('tutor_id', id).eq('status', 'COMPLETED_ASSUMED'),
        ]);
        if (!live || !me) {
          if (live) setFailed(true);
          return;
        }
        const byId = new Map((subjects ?? []).map((s: { id: string; name: string; label: string | null }) => [s.id, s]));
        const list = (ts ?? [])
          .map((t: { subject_id: string; price_per_hour_ttd: number | null }) => {
            const s = byId.get(t.subject_id);
            return s ? { id: s.id, name: s.label || s.name, price: Number(t.price_per_hour_ttd ?? 0) } : null;
          })
          .filter((s): s is { id: string; name: string; price: number } => s !== null);
        const priced = list.filter((s) => s.price > 0);
        const minPrice = priced.length ? Math.min(...priced.map((s) => s.price)) : 0;
        // Same rule as the family page: free while paid classes are off.
        const paid = flags?.paidClassesEnabled !== false;
        const rate = !paid ? 'Free' : minPrice > 0 ? `TT$${minPrice}` : null;
        const avg = summary?.averageRating == null ? null : Number(summary.averageRating);
        setData({
          tutor: {
            id: me.id,
            name: getDisplayName(me),
            avatarUrl: me.avatar_url,
            verified: me.tutor_verification_status === 'VERIFIED',
            bio: me.bio,
            subjects: list,
            averageRating: Number.isFinite(avg) ? avg : null,
            totalReviews: typeof summary?.ratingCount === 'number' ? summary.ratingCount : 0,
            completedSessions: count ?? 0,
          },
          reviews: (summary?.reviews ?? []).map(
            (r: { id: string; stars: number; comment: string | null; created_at: string; student?: { full_name?: string } }) => ({
              id: r.id,
              stars: r.stars,
              comment: r.comment,
              who: (r.student?.full_name || 'A student').split(' ')[0],
              when: new Date(r.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
            })
          ),
          rate,
        });
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [loading, profile?.id]);

  return (
    <TutorV2Shell title="View as a family" width="wide">
      <div className="flex flex-col gap-ds-4">
        <div className="flex flex-wrap items-center justify-between gap-ds-3 rounded-ds-card bw-hair border-ink bg-surface-sunken px-ds-card py-ds-3">
          <p className="m-0 text-[15px] font-bold text-ink">This is how families see your profile.</p>
          <Link
            href="/tutor/profile"
            className="ds-press inline-flex min-h-[44px] items-center gap-[6px] font-body text-[15px] font-extrabold text-ink no-underline"
          >
            Back to my profile <CaretRight size={16} weight="bold" aria-hidden />
          </Link>
        </div>
        {failed ? (
          <p className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-4 text-[14px] font-bold text-ink">
            We couldn&apos;t load your profile preview. Try again in a moment.
          </p>
        ) : !data ? (
          <div className="flex flex-col gap-ds-4" aria-busy>
            <div className="h-[104px] animate-pulse rounded-ds-card bg-surface-sunken" />
            <div className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" />
            <div className="h-[160px] animate-pulse rounded-ds-card bg-surface-sunken" />
          </div>
        ) : (
          <StudentTutorProfileV2
            tutor={data.tutor}
            reviews={data.reviews}
            rateLabel={data.rate}
            showBook={false}
            classHref={(classId) => `/tutor/classes/${classId}`}
            hideBack
          />
        )}
      </div>
    </TutorV2Shell>
  );
}
