// GET /api/student/home — what student Home (new UI, Figma 2:444) needs that
// no existing endpoint returns in one place.
//
//   next     the soonest class still to finish: a group occurrence on a class
//            the student is on, or a confirmed 1:1 session, whichever starts
//            first. The old dashboard read only 1:1 `sessions` from the
//            browser, so a student whose only classes were group classes saw
//            "no upcoming sessions" with a class tomorrow.
//   quests   the three quests in the frame, DERIVED from data that already
//            exists (approved 2026-11-07: no quest tables). Each is simply
//            "has the student done this yet".
//   finder   whether the Finder's "My best matches" link should show. The
//            flag is server-only by design (lib/featureFlags/finder.ts).
//
// The streak and the session/hour totals are NOT here: they come from
// /api/student/attendance, the shared §6 helper, so Home and the attendance
// panel can never disagree about which classes counted.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { isFinderEnabled } from '@/lib/featureFlags/finder';

export const dynamic = 'force-dynamic';

type NextClass = {
  kind: 'group' | '1:1';
  /** Where "Open class" goes. */
  href: string;
  title: string;
  subject: string | null;
  tutorName: string | null;
  tutorAvatarUrl: string | null;
  start: string;
  end: string | null;
};

type TutorRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export async function GET() {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();
    const nowIso = new Date().toISOString();

    const [{ data: profile }, { data: enrolments }, { data: members }, bookingCount] =
      await Promise.all([
        admin.from('profiles').select('subjects_of_study').eq('id', user.id).maybeSingle(),
        admin
          .from('group_enrollments')
          .select('group_id')
          .eq('student_id', user.id)
          .in('status', ['ACTIVE', 'GRACE', 'SECURED']),
        admin
          .from('group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .in('status', ['approved', 'active']),
        admin
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.id),
      ]);

    const groupIds = Array.from(
      new Set(
        [
          ...((enrolments ?? []) as Array<{ group_id: string }>),
          ...((members ?? []) as Array<{ group_id: string }>),
        ].map((r) => r.group_id)
      )
    );

    const candidates: Array<NextClass & { tutorId: string | null }> = [];

    // ---- the next group occurrence ----------------------------------------
    if (groupIds.length > 0) {
      const [{ data: groups }, { data: gs }] = await Promise.all([
        admin
          .from('groups')
          .select('id, name, subject, tutor_id')
          .in('id', groupIds)
          .is('archived_at', null),
        admin.from('group_sessions').select('id, group_id').in('group_id', groupIds),
      ]);
      const groupById = new Map(
        ((groups ?? []) as Array<{
          id: string;
          name: string | null;
          subject: string | null;
          tutor_id: string | null;
        }>).map((g) => [g.id, g])
      );
      const gsToGroup = new Map(
        ((gs ?? []) as Array<{ id: string; group_id: string }>).map((r) => [r.id, r.group_id])
      );
      const gsIds = [...gsToGroup.keys()];
      if (gsIds.length > 0) {
        // Still running counts: a class that started ten minutes ago is the
        // one the student most needs the button for.
        const { data: occ } = await admin
          .from('group_session_occurrences')
          .select('id, group_session_id, scheduled_start_at, scheduled_end_at, cancelled_at')
          .in('group_session_id', gsIds)
          .is('cancelled_at', null)
          .gte('scheduled_end_at', nowIso)
          .order('scheduled_start_at', { ascending: true })
          .limit(5);
        for (const o of (occ ?? []) as Array<{
          group_session_id: string;
          scheduled_start_at: string;
          scheduled_end_at: string | null;
        }>) {
          const gid = gsToGroup.get(o.group_session_id);
          const g = gid ? groupById.get(gid) : undefined;
          if (!gid || !g) continue; // archived class
          candidates.push({
            kind: 'group',
            href: `/student/classes/${gid}`,
            title: g.name || g.subject || 'Group class',
            subject: g.subject,
            tutorId: g.tutor_id,
            tutorName: null,
            tutorAvatarUrl: null,
            start: o.scheduled_start_at,
            end: o.scheduled_end_at,
          });
          break; // ordered ascending: the first live one is the next one
        }
      }
    }

    // ---- the next 1:1 session ---------------------------------------------
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, booking_id, tutor_id, scheduled_start_at, scheduled_end_at, status')
      .eq('student_id', user.id)
      .is('cancelled_at', null)
      .in('status', ['SCHEDULED', 'JOIN_OPEN'])
      .gte('scheduled_end_at', nowIso)
      .order('scheduled_start_at', { ascending: true })
      .limit(1);
    const s = ((sessions ?? []) as Array<{
      id: string;
      booking_id: string | null;
      tutor_id: string | null;
      scheduled_start_at: string;
      scheduled_end_at: string | null;
    }>)[0];
    if (s) {
      let subject: string | null = null;
      if (s.booking_id) {
        const { data: b } = await admin
          .from('bookings')
          .select('subject:subjects(label, name)')
          .eq('id', s.booking_id)
          .maybeSingle();
        const sub = (b as { subject?: { label: string | null; name: string | null } | null } | null)
          ?.subject;
        subject = sub?.label || sub?.name || null;
      }
      candidates.push({
        kind: '1:1',
        href: s.booking_id ? `/student/bookings/${s.booking_id}` : '/student/classes',
        title: subject ? `${subject} · 1:1` : '1:1 lesson',
        subject,
        tutorId: s.tutor_id,
        tutorName: null,
        tutorAvatarUrl: null,
        start: s.scheduled_start_at,
        end: s.scheduled_end_at,
      });
    }

    candidates.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const first = candidates[0] ?? null;
    let next: NextClass | null = null;
    if (first) {
      const { tutorId, ...rest } = first;
      next = rest;
      if (tutorId) {
        const { data: t } = await admin
          .from('profiles')
          .select('id, full_name, display_name, avatar_url')
          .eq('id', tutorId)
          .maybeSingle();
        const tutor = t as TutorRow | null;
        next.tutorName = tutor?.display_name || tutor?.full_name || null;
        next.tutorAvatarUrl = tutor?.avatar_url || null;
      }
    }

    const subjects = ((profile as { subjects_of_study?: string[] | null } | null)
      ?.subjects_of_study ?? []) as string[];

    return NextResponse.json({
      next,
      quests: {
        subjects: subjects.length > 0,
        joinedClass: groupIds.length > 0,
        bookedTutor: (bookingCount.count ?? 0) > 0,
      },
      finder: isFinderEnabled(),
    });
  } catch (err) {
    console.error('[GET /api/student/home]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
