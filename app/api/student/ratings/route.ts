// GET /api/student/ratings — everything the student Ratings page needs, for
// the signed-in student only.
//
// Two rating systems, unchanged by this route:
//  - 1:1 ratings (`ratings`): one per (student, tutor) in practice. Created by
//    POST /api/feedback/student with a past, non-cancelled session of the
//    student's with that tutor. A tutor is "to rate" when the student has such
//    a session and NO ratings row for that tutor at all (a system-issued or a
//    moderator-removed row counts as taken, because the create route would
//    overwrite it rather than add one).
//  - Class reviews (`group_reviews`): one live review per (reviewer, group).
//    Created by POST /api/groups/[groupId]/reviews, which requires an
//    ACTIVE/GRACE enrollment or an approved/active membership and, when the
//    enrollment date is known, 30 days of tenure. The same gates are mirrored
//    here so the page only offers what that route will accept.
//
// Read with the service client, always scoped to the caller's own id.

import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const TENURE_DAYS = 30;

type Person = { id: string; name: string; avatar: string | null };

export async function GET() {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const service = getServiceClient();
    const { data: me } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (me?.role !== 'student') return fail('Forbidden', 403);

    const nowIso = new Date().toISOString();

    const enrollmentQuery = async () => {
      let res = await service
        .from('group_enrollments')
        .select('group_id, enrolled_at')
        .eq('student_id', user.id)
        .in('status', ['ACTIVE', 'GRACE']);
      if (res.error) {
        res = (await service
          .from('group_enrollments')
          .select('group_id')
          .eq('student_id', user.id)
          .in('status', ['ACTIVE', 'GRACE'])) as typeof res;
      }
      return (res.data ?? []) as Array<{ group_id: string; enrolled_at?: string | null }>;
    };

    const [ratingsRes, sessionsRes, reviewsRes, enrollments, membersRes] = await Promise.all([
      service
        .from('ratings')
        .select('id, session_id, tutor_id, stars, comment, created_at, tutor_reply, system_issued, deleted_at, is_active')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false }),
      service
        .from('sessions')
        .select('id, tutor_id, scheduled_end_at')
        .eq('student_id', user.id)
        .neq('status', 'CANCELLED')
        .lte('scheduled_end_at', nowIso)
        .order('scheduled_end_at', { ascending: false })
        .limit(500),
      service
        .from('group_reviews')
        .select('id, group_id, tutor_id, rating, patience_rating, explanation_rating, class_material_rating, comment, created_at, updated_at, tutor_reply')
        .eq('reviewer_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      enrollmentQuery(),
      service.from('group_members').select('group_id').eq('user_id', user.id).in('status', ['approved', 'active']),
    ]);
    if (ratingsRes.error) return fail(ratingsRes.error.message, 500);
    if (sessionsRes.error) return fail(sessionsRes.error.message, 500);
    if (reviewsRes.error) return fail(reviewsRes.error.message, 500);

    const ratings = ratingsRes.data ?? [];
    const sessions = sessionsRes.data ?? [];
    const reviews = reviewsRes.data ?? [];
    const members = membersRes.data ?? [];

    // Groups the student may review today, and when the tenure gate opens.
    const enrolledAt = new Map<string, string | null>();
    for (const e of enrollments) {
      const prev = enrolledAt.get(e.group_id);
      // Keep the earliest known date; a membership alone carries no gate.
      if (!enrolledAt.has(e.group_id) || (e.enrolled_at && prev && e.enrolled_at < prev)) {
        enrolledAt.set(e.group_id, e.enrolled_at ?? null);
      }
    }
    const memberGroups = new Set(members.map((m: any) => m.group_id as string));
    const eligibleGroups = new Set<string>([...Array.from(enrolledAt.keys()), ...Array.from(memberGroups)]);

    const groupIds = Array.from(new Set([...Array.from(eligibleGroups), ...reviews.map((r: any) => r.group_id as string)]));
    const { data: groups } = groupIds.length
      ? await service.from('groups').select('id, name, tutor_id').in('id', groupIds)
      : { data: [] as Array<{ id: string; name: string | null; tutor_id: string }> };
    const groupById = new Map((groups ?? []).map((g: any) => [g.id as string, g]));

    const tutorIds = Array.from(
      new Set([
        ...ratings.map((r: any) => r.tutor_id),
        ...sessions.map((s: any) => s.tutor_id),
        ...(groups ?? []).map((g: any) => g.tutor_id),
      ].filter(Boolean) as string[])
    );
    const { data: tutors } = tutorIds.length
      ? await service.from('profiles').select('id, full_name, display_name, avatar_url').in('id', tutorIds)
      : { data: [] as any[] };
    const person = (id: string): Person => {
      const t = (tutors ?? []).find((p: any) => p.id === id);
      return { id, name: t?.display_name || t?.full_name || 'Tutor', avatar: t?.avatar_url ?? null };
    };

    // ---- 1:1 ----
    const sessionsByTutor = new Map<string, { latestSessionId: string; lastAt: string; count: number }>();
    for (const s of sessions as any[]) {
      if (!s.tutor_id) continue;
      const cur = sessionsByTutor.get(s.tutor_id);
      if (cur) cur.count += 1;
      else sessionsByTutor.set(s.tutor_id, { latestSessionId: s.id, lastAt: s.scheduled_end_at, count: 1 });
    }

    const ratingByTutor = new Map<string, any>();
    for (const r of ratings as any[]) {
      // Latest row per tutor (ordered desc). Prefer the student's own words over
      // a system-issued row when both exist.
      const cur = ratingByTutor.get(r.tutor_id);
      if (!cur || (cur.system_issued && !r.system_issued)) ratingByTutor.set(r.tutor_id, r);
    }

    const oneOnOneRated = Array.from(ratingByTutor.values()).map((r: any) => {
      const s = sessionsByTutor.get(r.tutor_id);
      const removed = Boolean(r.deleted_at) || r.is_active === false;
      return {
        kind: 'session' as const,
        id: r.id as string,
        tutor: person(r.tutor_id),
        stars: r.stars as number,
        comment: (r.comment as string | null) ?? null,
        createdAt: r.created_at as string,
        tutorReply: (r.tutor_reply as string | null) ?? null,
        systemIssued: Boolean(r.system_issued),
        removed,
        sessionCount: s?.count ?? 0,
        // Same rule as creation: the student must have had an ended,
        // non-cancelled session with this tutor.
        canEdit: !r.system_issued && !removed && Boolean(s),
      };
    });

    const oneOnOneToRate = Array.from(sessionsByTutor.entries())
      .filter(([tutorId]) => !ratingByTutor.has(tutorId))
      .map(([tutorId, s]) => ({
        kind: 'session' as const,
        tutor: person(tutorId),
        sessionId: s.latestSessionId,
        lastAt: s.lastAt,
        sessionCount: s.count,
      }));

    // ---- Classes ----
    const reviewedGroups = new Set(reviews.map((r: any) => r.group_id as string));
    const classRated = (reviews as any[]).map((r) => {
      const g = groupById.get(r.group_id);
      return {
        kind: 'group' as const,
        id: r.id as string,
        groupId: r.group_id as string,
        className: (g?.name as string) || 'Class',
        tutor: person(r.tutor_id),
        rating: r.rating as number,
        patience: (r.patience_rating as number | null) ?? null,
        explanation: (r.explanation_rating as number | null) ?? null,
        classMaterial: (r.class_material_rating as number | null) ?? null,
        comment: (r.comment as string | null) ?? null,
        createdAt: r.created_at as string,
        updatedAt: (r.updated_at as string | null) ?? null,
        tutorReply: (r.tutor_reply as string | null) ?? null,
        canEdit: eligibleGroups.has(r.group_id),
      };
    });

    const classToRate = Array.from(eligibleGroups)
      .filter((gid) => !reviewedGroups.has(gid) && groupById.has(gid))
      .map((gid) => {
        const g = groupById.get(gid);
        const since = enrolledAt.get(gid) ?? null;
        const opensAt = since ? new Date(new Date(since).getTime() + TENURE_DAYS * 86_400_000).toISOString() : null;
        return {
          kind: 'group' as const,
          groupId: gid,
          className: (g?.name as string) || 'Class',
          tutor: person(g.tutor_id),
          // null = can review now.
          opensAt: opensAt && opensAt > nowIso ? opensAt : null,
        };
      });

    return ok({
      toRate: { sessions: oneOnOneToRate, classes: classToRate },
      rated: { sessions: oneOnOneRated, classes: classRated },
    });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}
