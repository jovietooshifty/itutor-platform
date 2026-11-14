// GET /api/tutor/class-stats — the calling tutor's roster and next-session
// figures, per class and in total.
//
// Why this exists: My Classes read "Members 0/15 · Next —" and the dashboard
// read "Active students 0" for a tutor with four paying students and sessions
// twice a week. The dashboard counted confirmed 1:1 bookings only (group
// students were never in it), and the class cards took their figures from the
// marketplace listing endpoint, whose silent fallback to a bare `groups` read
// carries no member count and no next session at all.
//
// The roster rule is the Clients page's (app/api/tutor/clients): a student is
// on a class if they have an ACTIVE/GRACE/SECURED enrolment or an
// approved/active group_members row. Same rule, same number on every surface.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ENROLLED = ['ACTIVE', 'GRACE', 'SECURED'];
const MEMBER = ['approved', 'active'];

export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();

    const { data: groups } = await admin
      .from('groups')
      .select('id')
      .eq('tutor_id', user.id)
      .is('archived_at', null);
    const groupIds = ((groups ?? []) as Array<{ id: string }>).map((g) => g.id);

    const studentsByGroup = new Map<string, Set<string>>(groupIds.map((id) => [id, new Set<string>()]));
    const nextByGroup = new Map<string, string>();

    if (groupIds.length > 0) {
      const nowIso = new Date().toISOString();
      const [{ data: enrolments }, { data: members }, { data: gsRows }] = await Promise.all([
        admin.from('group_enrollments').select('group_id, student_id').in('group_id', groupIds).in('status', ENROLLED),
        admin.from('group_members').select('group_id, user_id').in('group_id', groupIds).in('status', MEMBER),
        admin.from('group_sessions').select('id, group_id').in('group_id', groupIds),
      ]);

      for (const e of (enrolments ?? []) as Array<{ group_id: string; student_id: string | null }>) {
        if (e.student_id) studentsByGroup.get(e.group_id)?.add(e.student_id);
      }
      for (const m of (members ?? []) as Array<{ group_id: string; user_id: string | null }>) {
        if (m.user_id) studentsByGroup.get(m.group_id)?.add(m.user_id);
      }

      const groupBySession = new Map(
        ((gsRows ?? []) as Array<{ id: string; group_id: string }>).map((s) => [s.id, s.group_id])
      );
      const sessionIds = Array.from(groupBySession.keys());
      if (sessionIds.length > 0) {
        // Earliest future, non-cancelled occurrence per class. A class meeting
        // twice a week has ~8 a month; 500 covers dozens of classes.
        const { data: occ } = await admin
          .from('group_session_occurrences')
          .select('group_session_id, scheduled_start_at, status, cancelled_at')
          .in('group_session_id', sessionIds)
          .gt('scheduled_start_at', nowIso)
          .is('cancelled_at', null)
          .order('scheduled_start_at', { ascending: true })
          .limit(500);
        for (const o of (occ ?? []) as Array<{ group_session_id: string; scheduled_start_at: string; status: string | null }>) {
          if (String(o.status ?? '').toLowerCase() === 'cancelled') continue;
          const gid = groupBySession.get(o.group_session_id);
          if (gid && !nextByGroup.has(gid)) nextByGroup.set(gid, o.scheduled_start_at);
        }
      }
    }

    // Active students = everyone on a class roster + everyone with a confirmed 1:1.
    const all = new Set<string>();
    for (const set of studentsByGroup.values()) set.forEach((id) => all.add(id));
    const { data: bookings } = await admin
      .from('bookings')
      .select('student_id')
      .eq('tutor_id', user.id)
      .in('status', ['CONFIRMED', 'confirmed']);
    for (const b of (bookings ?? []) as Array<{ student_id: string | null }>) {
      if (b.student_id) all.add(b.student_id);
    }

    return NextResponse.json({
      activeStudents: all.size,
      classes: groupIds.map((id) => ({
        id,
        memberCount: studentsByGroup.get(id)?.size ?? 0,
        nextSessionAt: nextByGroup.get(id) ?? null,
      })),
    });
  } catch (err) {
    console.error('[GET /api/tutor/class-stats]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
