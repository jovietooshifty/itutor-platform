// GET /api/student/upcoming — what student My Classes (new UI, Figma 2:1088)
// needs in one read:
//
//   classes   every class the student is on, each with its next occurrence
//             (the "In 4 days · Thu 6:30 PM" tags on the class cards).
//   upcoming  the next few dated lessons, group occurrences and confirmed 1:1
//             sessions merged and sorted ("Coming up").
//   hasOneToOne  whether any 1:1 is booked ahead, for the "No 1:1 lessons
//             booked · Book a tutor" row.
//
// Service client, scoped to the caller by the session — the same pattern as
// /api/student/home and /api/student/attendance. Membership is the union of
// group_enrollments (paid) and group_members (approved/active), as there.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DAYS_FORWARD = 45;
const UPCOMING_LIMIT = 6;

type Upcoming = {
  key: string;
  kind: 'group' | '1:1';
  title: string;
  subject: string | null;
  start: string;
  end: string | null;
  href: string;
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
    const toIso = new Date(Date.now() + DAYS_FORWARD * 86_400_000).toISOString();

    const [{ data: enrolments }, { data: members }] = await Promise.all([
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
    ]);
    const groupIds = Array.from(
      new Set(
        [
          ...((enrolments ?? []) as Array<{ group_id: string }>),
          ...((members ?? []) as Array<{ group_id: string }>),
        ].map((r) => r.group_id)
      )
    );

    const upcoming: Upcoming[] = [];
    const classes: Array<{
      id: string;
      name: string;
      subject: string | null;
      coverImage: string | null;
      tutorName: string | null;
      tutorAvatarUrl: string | null;
      next: { start: string; end: string | null } | null;
    }> = [];

    if (groupIds.length > 0) {
      const [{ data: groups }, { data: gs }] = await Promise.all([
        admin
          .from('groups')
          .select('id, name, subject, cover_image, tutor_id')
          .in('id', groupIds)
          .is('archived_at', null),
        admin.from('group_sessions').select('id, group_id').in('group_id', groupIds),
      ]);
      const groupRows = (groups ?? []) as Array<{
        id: string;
        name: string | null;
        subject: string | null;
        cover_image: string | null;
        tutor_id: string | null;
      }>;
      const tutorIds = Array.from(new Set(groupRows.map((g) => g.tutor_id).filter(Boolean))) as string[];
      const { data: tutors } = tutorIds.length
        ? await admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', tutorIds)
        : { data: [] };
      const tutorById = new Map(
        ((tutors ?? []) as Array<{
          id: string;
          full_name: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }>).map((t) => [t.id, t])
      );

      const gsToGroup = new Map(
        ((gs ?? []) as Array<{ id: string; group_id: string }>).map((r) => [r.id, r.group_id])
      );
      const gsIds = [...gsToGroup.keys()];
      const nextByGroup = new Map<string, { start: string; end: string | null }>();
      const groupById = new Map(groupRows.map((g) => [g.id, g]));

      if (gsIds.length > 0) {
        const { data: occ } = await admin
          .from('group_session_occurrences')
          .select('id, group_session_id, scheduled_start_at, scheduled_end_at')
          .in('group_session_id', gsIds)
          .is('cancelled_at', null)
          .gte('scheduled_end_at', nowIso)
          .lte('scheduled_start_at', toIso)
          .order('scheduled_start_at', { ascending: true })
          .limit(200);
        for (const o of (occ ?? []) as Array<{
          id: string;
          group_session_id: string;
          scheduled_start_at: string;
          scheduled_end_at: string | null;
        }>) {
          const gid = gsToGroup.get(o.group_session_id);
          const g = gid ? groupById.get(gid) : undefined;
          if (!gid || !g) continue;
          if (!nextByGroup.has(gid)) nextByGroup.set(gid, { start: o.scheduled_start_at, end: o.scheduled_end_at });
          upcoming.push({
            key: `group_occurrence:${o.id}`,
            kind: 'group',
            title: g.name || g.subject || 'Group class',
            subject: g.subject,
            start: o.scheduled_start_at,
            end: o.scheduled_end_at,
            href: `/student/classes/${gid}`,
          });
        }
      }

      for (const g of groupRows) {
        const t = g.tutor_id ? tutorById.get(g.tutor_id) : undefined;
        classes.push({
          id: g.id,
          name: g.name || g.subject || 'Group class',
          subject: g.subject,
          coverImage: g.cover_image,
          tutorName: t?.display_name || t?.full_name || null,
          tutorAvatarUrl: t?.avatar_url || null,
          next: nextByGroup.get(g.id) ?? null,
        });
      }
      // Soonest class first; classes with nothing scheduled last.
      classes.sort((a, b) => {
        if (!a.next) return b.next ? 1 : 0;
        if (!b.next) return -1;
        return new Date(a.next.start).getTime() - new Date(b.next.start).getTime();
      });
    }

    // ---- confirmed 1:1s ahead ----------------------------------------------
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, booking_id, tutor_id, scheduled_start_at, scheduled_end_at')
      .eq('student_id', user.id)
      .is('cancelled_at', null)
      .in('status', ['SCHEDULED', 'JOIN_OPEN'])
      .gte('scheduled_end_at', nowIso)
      .lte('scheduled_start_at', toIso)
      .order('scheduled_start_at', { ascending: true })
      .limit(20);
    const sessionRows = (sessions ?? []) as Array<{
      id: string;
      booking_id: string | null;
      tutor_id: string | null;
      scheduled_start_at: string;
      scheduled_end_at: string | null;
    }>;
    const bookingIds = sessionRows.map((s) => s.booking_id).filter(Boolean) as string[];
    const subjectByBooking = new Map<string, string>();
    if (bookingIds.length) {
      const { data: bookings } = await admin
        .from('bookings')
        .select('id, subject:subjects(label, name)')
        .in('id', bookingIds);
      for (const b of (bookings ?? []) as unknown as Array<{
        id: string;
        subject: { label: string | null; name: string | null } | null;
      }>) {
        const s = b.subject?.label || b.subject?.name;
        if (s) subjectByBooking.set(b.id, s);
      }
    }
    for (const s of sessionRows) {
      const subject = s.booking_id ? subjectByBooking.get(s.booking_id) ?? null : null;
      upcoming.push({
        key: `session:${s.id}`,
        kind: '1:1',
        title: subject ?? '1:1 lesson',
        subject,
        start: s.scheduled_start_at,
        end: s.scheduled_end_at,
        href: s.booking_id ? `/student/bookings/${s.booking_id}` : '/student/bookings',
      });
    }

    upcoming.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json({
      classes,
      upcoming: upcoming.slice(0, UPCOMING_LIMIT),
      hasOneToOne: sessionRows.length > 0,
    });
  } catch (err) {
    console.error('[GET /api/student/upcoming]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
