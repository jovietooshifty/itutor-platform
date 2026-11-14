import { NextRequest } from 'next/server';
import { authenticateUser, requireTutor } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { loadTutorClasses } from '@/lib/tutor/classSummaries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tutor/home — everything the new tutor Home (canvas m06 / m07 /
 * m07b / d01) shows, for the signed-in tutor only. Every query is scoped to
 * this tutor's own classes or rows: this runs on the service client, which
 * bypasses RLS, so a missing scope here is a leak (the old /api/tutor/dashboard
 * had exactly that bug).
 *
 * Nothing here is invented. A figure with no source is left out of the
 * payload rather than shown as zero — the canvas's "Time saved" is one.
 */

/** Billing states where a family's payment did not go through. */
const FAILED_STATES = ['GRACE', 'SUSPENDED', 'ACTIVATION_FAILED'];

const AST_OFFSET_MS = 4 * 60 * 60 * 1000; // AST is UTC-4, no DST.

/** Monday 00:00 AST of the current week, as a UTC instant. */
function astWeekStart(now: Date): Date {
  const ast = new Date(now.getTime() - AST_OFFSET_MS);
  const dow = ast.getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7; // days since Monday
  const mondayAst = Date.UTC(ast.getUTCFullYear(), ast.getUTCMonth(), ast.getUTCDate() - back);
  return new Date(mondayAst + AST_OFFSET_MS);
}

function firstName(p: any): string {
  const n = (p?.display_name || p?.full_name || '').trim();
  if (!n) return 'A student';
  const parts = n.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export async function GET(_req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    if (!(await requireTutor(user.id))) return fail('Tutor role required', 403);

    const db = getServiceClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const weekStart = astWeekStart(now);
    const weekStartIso = weekStart.toISOString();

    const { data: profile } = await db
      .from('profiles')
      .select('full_name, display_name, avatar_url, bio')
      .eq('id', user.id)
      .single();

    const {
      groups,
      ids,
      upcoming,
      enrolments,
      seated,
      seatsByGroup,
      summaries,
    } = await loadTutorClasses(db, user.id, now, {
      enrolmentSelect:
        'id, group_id, student_id, status, enrolled_at, plan_price_ttd, grace_period_ends_at, pause_reason, pause_start, pause_end, paused_at, student:profiles!student_id(full_name, display_name)',
    });

    const groupName = (gid: string) => groups.find((g: any) => g.id === gid)?.name ?? 'your class';

    // ── Next 1:1 lesson ──────────────────────────────────────────────────
    const { data: nextOneToOne } = await db
      .from('sessions')
      .select('id, scheduled_start_at, scheduled_end_at, status, student:profiles!student_id(full_name, display_name)')
      .eq('tutor_id', user.id)
      .in('status', ['SCHEDULED', 'JOIN_OPEN'])
      .gte('scheduled_end_at', nowIso)
      .order('scheduled_start_at', { ascending: true })
      .limit(1);

    const firstGroupOcc = (upcoming ?? [])[0] as any;
    const firstOne = (nextOneToOne ?? [])[0] as any;
    let next: null | {
      kind: 'class' | 'lesson';
      href: string;
      title: string;
      start: string;
      end: string;
      students: number | null;
      seats: number | null;
    } = null;
    if (firstGroupOcc && (!firstOne || firstGroupOcc.scheduled_start_at <= firstOne.scheduled_start_at)) {
      const gid = firstGroupOcc.session.group_id;
      const g = groups.find((x: any) => x.id === gid);
      next = {
        kind: 'class',
        href: `/tutor/classes/${gid}`,
        title: g?.name ?? firstGroupOcc.session.title ?? 'Class',
        start: firstGroupOcc.scheduled_start_at,
        end: firstGroupOcc.scheduled_end_at,
        students: seatsByGroup.get(gid) ?? 0,
        seats: g?.max_students ?? null,
      };
    } else if (firstOne) {
      next = {
        kind: 'lesson',
        href: `/tutor/sessions/${firstOne.id}`,
        title: `1:1 with ${firstName(firstOne.student)}`,
        start: firstOne.scheduled_start_at,
        end: firstOne.scheduled_end_at,
        students: 1,
        seats: null,
      };
    }

    // ── Needs your attention ─────────────────────────────────────────────
    type Action = { id: string; tone: 'danger' | 'warn' | 'info'; tag: string; title: string; detail: string; href: string; cta: string };
    const actions: Action[] = [];

    for (const e of enrolments.filter((x: any) => FAILED_STATES.includes(x.status))) {
      const who = firstName((e as any).student);
      const price = Number((e as any).plan_price_ttd ?? 0);
      actions.push({
        id: `pay-${e.id}`,
        tone: 'danger',
        tag: 'Needs action',
        title: `Payment failed · ${who}`,
        detail:
          e.status === 'GRACE'
            ? `${price > 0 ? `TT$${price.toLocaleString('en-US')} ` : ''}could not be charged for ${groupName(e.group_id)}. They keep access until the grace period ends.`
            : `${price > 0 ? `TT$${price.toLocaleString('en-US')} ` : ''}could not be charged. Their access to ${groupName(e.group_id)} is on hold.`,
        href: `/tutor/classes/${e.group_id}`,
        cta: 'View class',
      });
    }

    // A class on a tutor break has no sessions on purpose; it is not a fault.
    for (const g of summaries.filter((x) => x.state === 'fix')) {
      actions.push({
        id: `sched-${g.id}`,
        tone: 'warn',
        tag: 'Fix',
        title: `${g.name} has no upcoming session`,
        detail: "Add one so no family pays for a class that isn't running.",
        href: `/tutor/classes/${g.id}`,
        cta: 'Add session',
      });
    }

    const { data: pendingMembers } = await db
      .from('group_members')
      .select('id, group_id, user:profiles!user_id(full_name, display_name)')
      .in('group_id', ids)
      .eq('status', 'pending');
    for (const m of pendingMembers ?? []) {
      actions.push({
        id: `req-${m.id}`,
        tone: 'info',
        tag: 'Request',
        title: `${firstName((m as any).user)} asked to join`,
        detail: groupName((m as any).group_id),
        href: `/tutor/classes/${(m as any).group_id}`,
        cta: 'Review',
      });
    }

    // ── Unread messages (the Messages badge and the inbox teaser) ────────
    const { data: convs } = await db
      .from('conversations')
      .select('id, participant_1_id, participant_2_id, last_message_at, last_message_preview')
      .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50);
    const convIds = (convs ?? []).map((c: any) => c.id);
    const { data: unreadRows } = convIds.length
      ? await db
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', convIds)
          .neq('sender_id', user.id)
          .eq('is_read', false)
      : { data: [] as any[] };
    const unreadByConv = new Map<string, number>();
    for (const r of unreadRows ?? []) unreadByConv.set(r.conversation_id, (unreadByConv.get(r.conversation_id) ?? 0) + 1);

    const unreadConvs = (convs ?? []).filter((c: any) => unreadByConv.has(c.id)).slice(0, 3);
    const otherIds = unreadConvs.map((c: any) => (c.participant_1_id === user.id ? c.participant_2_id : c.participant_1_id));
    const { data: others } = otherIds.length
      ? await db.from('profiles').select('id, full_name, display_name').in('id', otherIds)
      : { data: [] as any[] };
    const messages = unreadConvs.map((c: any) => {
      const otherId = c.participant_1_id === user.id ? c.participant_2_id : c.participant_1_id;
      return {
        id: c.id,
        name: firstName((others ?? []).find((p: any) => p.id === otherId)),
        preview: c.last_message_preview ?? '',
        at: c.last_message_at,
        unread: unreadByConv.get(c.id) ?? 0,
        href: `/tutor/messages/${c.id}`,
      };
    });
    const unreadMessages = Array.from(unreadByConv.values()).reduce((a, b) => a + b, 0);

    // ── This week (Mon–Sun, AST) ─────────────────────────────────────────
    const { data: weekSubs } = await db
      .from('subscription_payments')
      .select('amount_ttd')
      .in('group_id', ids)
      .eq('status', 'PAID')
      .gte('paid_at', weekStartIso);
    const { data: weekOneToOne } = await db
      .from('sessions')
      .select('charge_amount_ttd, status, scheduled_end_at, charged_at')
      .eq('tutor_id', user.id)
      .or(`charged_at.gte.${weekStartIso},scheduled_end_at.gte.${weekStartIso}`);
    const collected =
      (weekSubs ?? []).reduce((a: number, r: any) => a + Number(r.amount_ttd ?? 0), 0) +
      (weekOneToOne ?? [])
        .filter((s: any) => s.charged_at && s.charged_at >= weekStartIso)
        .reduce((a: number, r: any) => a + Number(r.charge_amount_ttd ?? 0), 0);

    const newStudents = new Set(
      seated.filter((e: any) => e.enrolled_at && e.enrolled_at >= weekStartIso).map((e: any) => e.student_id)
    ).size;

    // Group occurrence status never leaves 'upcoming', so "taught" is
    // "ended this week and not cancelled".
    const { count: groupTaught } = await db
      .from('group_session_occurrences')
      .select('id, session:group_sessions!inner(group_id)', { count: 'exact', head: true })
      .in('session.group_id', ids)
      .is('cancelled_at', null)
      .gte('scheduled_end_at', weekStartIso)
      .lte('scheduled_end_at', nowIso);
    const oneToOneTaught = (weekOneToOne ?? []).filter(
      (s: any) => s.status === 'COMPLETED' && s.scheduled_end_at >= weekStartIso && s.scheduled_end_at <= nowIso
    ).length;

    // ── Classes (Home shows a few; Classes shows all) ────────────────────
    const classes = summaries.slice(0, 4);

    // ── Setup checklist (m07 / m07b) ─────────────────────────────────────
    const setup = {
      photoAndBio: Boolean(profile?.avatar_url && (profile?.bio ?? '').trim()),
      publishedClass: groups.some((g: any) => g.status === 'PUBLISHED'),
      contactConfirmed: Boolean(user.email_confirmed_at),
    };

    return ok({
      name: (profile?.display_name || profile?.full_name || '').trim().split(/\s+/)[0] || null,
      next,
      actions,
      messages,
      unreadMessages,
      week: {
        start: weekStartIso,
        collected: Math.round(collected * 100) / 100,
        newStudents,
        lessonsTaught: (groupTaught ?? 0) + oneToOneTaught,
      },
      classes,
      totalClasses: groups.length,
      totalStudents: new Set(seated.map((e: any) => e.student_id)).size,
      setup,
    });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}
