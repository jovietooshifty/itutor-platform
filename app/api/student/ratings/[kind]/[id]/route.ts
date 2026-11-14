// PATCH /api/student/ratings/session/:ratingId  { stars, comment? }
// PATCH /api/student/ratings/group/:reviewId     { patience_rating, explanation_rating, class_material_rating, comment? }
//
// Lets a student change a rating they already left. Creation stays where it
// was (POST /api/feedback/student, POST /api/groups/[groupId]/reviews); this
// route only edits, because neither existing path can change a score safely:
//  - /api/feedback/student "edits" by overwriting the latest row for the
//    tutor and deleting the others, and resets created_at and session_id.
//  - PATCH /api/reviews/[id] changes the comment only.
//
// Checks, in order: signed in; role student; the row is the caller's own
// (student_id / reviewer_id); not removed by moderation (deleted_at, or
// is_active=false after an overturned appeal); not system-issued (those are
// iTutor's, not the student's); and the same eligibility as creation (an
// ended, non-cancelled session with that tutor / a current class enrollment or
// membership). Only the score and comment columns are written — moderation,
// appeal and tutor-reply columns are never touched.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { recalculateRating } from '@/lib/services/groupReviews';
import { getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ kind: string; id: string }> };

export const dynamic = 'force-dynamic';

const star = z.number().int().min(1).max(5);
const comment = z.string().max(2000).nullable().optional();
const sessionSchema = z.object({ stars: star, comment });
const groupSchema = z.object({
  patience_rating: star,
  explanation_rating: star,
  class_material_rating: star,
  comment,
});

const clean = (c: string | null | undefined) => (c && c.trim() ? c.trim() : null);

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const { kind, id } = await params;
    if (kind !== 'session' && kind !== 'group') return fail('Not found', 404);

    const service = getServiceClient();
    const { data: me } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (me?.role !== 'student') return fail('Forbidden', 403);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('Invalid body', 400);
    }

    if (kind === 'session') {
      const parsed = sessionSchema.safeParse(body);
      if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid body', 400);

      const { data: rating } = await service
        .from('ratings')
        .select('id, student_id, tutor_id, system_issued, deleted_at, is_active')
        .eq('id', id)
        .maybeSingle();
      if (!rating || rating.student_id !== user.id) return fail('Rating not found', 404);
      if (rating.deleted_at || rating.is_active === false) return fail('This rating was removed by a moderator and cannot be edited.', 403);
      if (rating.system_issued) return fail('This rating was issued by iTutor and cannot be edited.', 403);

      const { data: session } = await service
        .from('sessions')
        .select('id')
        .eq('student_id', user.id)
        .eq('tutor_id', rating.tutor_id)
        .neq('status', 'CANCELLED')
        .lte('scheduled_end_at', new Date().toISOString())
        .limit(1)
        .maybeSingle();
      if (!session) return fail('You need a completed session with this tutor to rate them.', 403);

      // The ratings_update_tutor_stats trigger recomputes the tutor's average.
      const { data: updated, error } = await service
        .from('ratings')
        .update({ stars: parsed.data.stars, comment: clean(parsed.data.comment) })
        .eq('id', id)
        .eq('student_id', user.id)
        .select('id, stars, comment')
        .single();
      if (error) return fail(error.message, 500);
      return ok(updated);
    }

    // kind === 'group'
    const parsed = groupSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid body', 400);

    const { data: review } = await service
      .from('group_reviews')
      .select('id, reviewer_id, group_id, tutor_id, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (!review || review.reviewer_id !== user.id) return fail('Review not found', 404);
    if (review.deleted_at) return fail('This review was removed and cannot be edited.', 403);

    const [{ data: enrollment }, { data: membership }] = await Promise.all([
      service
        .from('group_enrollments')
        .select('id')
        .eq('group_id', review.group_id)
        .eq('student_id', user.id)
        .in('status', ['ACTIVE', 'GRACE'])
        .limit(1)
        .maybeSingle(),
      service
        .from('group_members')
        .select('id')
        .eq('group_id', review.group_id)
        .eq('user_id', user.id)
        .in('status', ['approved', 'active'])
        .limit(1)
        .maybeSingle(),
    ]);
    if (!enrollment && !membership) return fail('You must be enrolled in this class to change your review.', 403);

    const { patience_rating: pr, explanation_rating: er, class_material_rating: cr } = parsed.data;
    const overall = Math.round((pr + er + cr) / 3);

    const { data: updated, error } = await service
      .from('group_reviews')
      .update({
        rating: overall,
        patience_rating: pr,
        explanation_rating: er,
        class_material_rating: cr,
        comment: clean(parsed.data.comment),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('reviewer_id', user.id)
      .is('deleted_at', null)
      .select('id, rating, patience_rating, explanation_rating, class_material_rating, comment, updated_at')
      .single();
    if (error) return fail(error.message, 500);

    try {
      await recalculateRating(review.tutor_id);
    } catch {
      /* aggregate refresh is best-effort, as in the admin removal route */
    }
    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}
