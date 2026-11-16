import { NextRequest } from 'next/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { loadTutorClasses } from '@/lib/tutor/classSummaries';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ classId: string }> };

/**
 * GET /api/tutor/classes/[classId]/overview — the new Manage class screen
 * (canvas m10 / d03): the class's derived state, next session, seats,
 * enrolment status, the roster with payment and access, and pending join
 * requests.
 *
 * OWNER ONLY. Service client, so the ownership check is the whole guard: the
 * class must appear in the caller's own `groups.tutor_id` list. A superadmin
 * "entering as tutor" gets 404 here and the page falls back to the full hub,
 * which has its own admin path.
 */

function shortName(p: any): string {
  const n = (p?.display_name || p?.full_name || '').trim();
  if (!n) return 'A student';
  const parts = n.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { classId } = await params;
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const db = getServiceClient();
    const now = new Date();
    const { summaries } = await loadTutorClasses(db, user.id, now);
    const summary = summaries.find((s) => s.id === classId);
    if (!summary) return fail('Class not found', 404);

    const [{ data: g }, { data: nextOcc }, { data: lastOcc }, { data: enrolRows }, { data: pending }] = await Promise.all([
      db
        .from('groups')
        .select('class_format, end_date, enrolment_closed_until, require_join_requests, description')
        .eq('id', classId)
        .eq('tutor_id', user.id)
        .single(),
      db
        .from('group_session_occurrences')
        .select('id, scheduled_start_at, scheduled_end_at, session:group_sessions!inner(group_id)')
        .eq('session.group_id', classId)
        .is('cancelled_at', null)
        .gte('scheduled_end_at', now.toISOString())
        .order('scheduled_start_at', { ascending: true })
        .limit(1),
      db
        .from('group_session_occurrences')
        .select('id, scheduled_end_at, session:group_sessions!inner(group_id)')
        .eq('session.group_id', classId)
        .is('cancelled_at', null)
        .lt('scheduled_end_at', now.toISOString())
        .order('scheduled_end_at', { ascending: false })
        .limit(1),
      db
        .from('group_enrollments')
        .select(
          'id, student_id, payer_id, status, enrolled_at, created_at, plan_price_ttd, grace_period_ends_at, seat_type, student:profiles!student_id(full_name, display_name), payer:profiles!payer_id(full_name, display_name)'
        )
        .eq('group_id', classId)
        // An unfinished checkout is not a student yet. Showing it put a name on
        // the tutor's roster ("Checkout started · Pending") for someone who may
        // never pay, and the hold expires on its own. Owner call, 2026-11-16.
        .not('status', 'in', '(CANCELLED,PENDING_PAYMENT)')
        .order('enrolled_at', { ascending: false, nullsFirst: false }),
      db
        .from('group_members')
        .select('id, user_id, joined_at, status_changed_at, user:profiles!user_id(full_name, display_name)')
        .eq('group_id', classId)
        .eq('status', 'pending'),
    ]);

    const roster = (enrolRows ?? []).map((e: any) => ({
      id: e.id,
      name: shortName(e.student),
      parent: e.payer_id && e.payer_id !== e.student_id ? shortName(e.payer) : null,
      enrolledAt: e.enrolled_at ?? e.created_at ?? null,
      status: e.status as string,
      graceEndsAt: e.grace_period_ends_at ?? null,
      seatType: e.seat_type ?? null,
    }));

    const requests = (pending ?? []).map((m: any) => ({
      id: m.id,
      name: shortName(m.user),
      at: m.status_changed_at ?? m.joined_at ?? null,
    }));

    const closedUntil = g?.enrolment_closed_until && g.enrolment_closed_until > now.toISOString() ? g.enrolment_closed_until : null;

    return ok({
      class: {
        ...summary,
        format: g?.class_format ?? null,
        endDate: g?.end_date ?? null,
        enrolmentClosedUntil: closedUntil,
        requireJoinRequests: Boolean(g?.require_join_requests),
      },
      next: nextOcc?.[0] ? { id: nextOcc[0].id, start: nextOcc[0].scheduled_start_at, end: nextOcc[0].scheduled_end_at } : null,
      lastEnded: lastOcc?.[0]?.scheduled_end_at ?? null,
      lastId: lastOcc?.[0]?.id ?? null,
      roster,
      requests,
    });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}
