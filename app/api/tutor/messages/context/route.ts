import { NextRequest } from 'next/server';
import { authenticateUser, requireTutor } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { loadTutorClasses } from '@/lib/tutor/classSummaries';
import type { MessagePerson, MessageTagTone } from '@/lib/tutor/messageContext';

export const dynamic = 'force-dynamic';

type Tone = MessageTagTone;

const ACTIVE_ENROLMENT = ['ACTIVE', 'SECURED', 'PENDING_PAYMENT', 'GRACE', 'SUSPENDED', 'ACTIVATION_FAILED'];
const OPEN_BOOKING = ['PENDING', 'PENDING_PARENT_APPROVAL', 'PARENT_APPROVED', 'COUNTER_PROPOSED', 'CONFIRMED'];
const HISTORIC_BOOKING = ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'PARENT_REJECTED', 'SEAT_UNAVAILABLE_REFUNDED'];

// Most urgent first; a person shows the first that applies.
const RULES: { key: string; label: string; tone: Tone }[] = [
  { key: 'booking:PENDING', label: 'Booking request', tone: 'warning' },
  { key: 'join', label: 'Join request', tone: 'warning' },
  { key: 'enrol:ACTIVATION_FAILED', label: 'Payment failed', tone: 'danger' },
  { key: 'enrol:GRACE', label: 'Payment overdue', tone: 'danger' },
  { key: 'enrol:PENDING_PAYMENT', label: 'Payment pending', tone: 'warning' },
  { key: 'booking:PENDING_PARENT_APPROVAL', label: 'Awaiting parent', tone: 'outline' },
];

function shortName(p: any): string | null {
  const n = (p?.display_name || p?.full_name || '').trim();
  return n ? n.split(/\s+/)[0] : null;
}

/**
 * GET /api/tutor/messages/context — what the new tutor Messages screen (canvas
 * m14 / m16 / d05) needs beyond the conversation list itself: for each person
 * the tutor talks to, how they relate to this tutor (a class, a join request, a
 * 1:1 booking, or nothing yet = an enquiry) and the one status worth a chip.
 * Also the class each conversation was started about (conversations.group_context_id),
 * when that class is the tutor's own.
 *
 * Read-only. Everything is scoped to the caller's own conversations, classes
 * and bookings; no other tutor's data is reachable through it. The design's
 * "Offer sent" chip has no backend (chat offers are a separate project) and is
 * not produced.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    if (!(await requireTutor(user.id))) return fail('Tutor role required', 403);
    const db = getServiceClient();
    const me = user.id;

    const { data: convs, error: convErr } = await db
      .from('conversations')
      .select('id, participant_1_id, participant_2_id, group_context_id')
      .or(`participant_1_id.eq.${me},participant_2_id.eq.${me}`);
    if (convErr) throw convErr;

    const others = Array.from(
      new Set(
        (convs ?? [])
          .map((c: any) => (c.participant_1_id === me ? c.participant_2_id : c.participant_1_id))
          .filter(Boolean)
      )
    ) as string[];
    if (others.length === 0) return ok({ people: {}, about: {} });

    const [{ groups, groupIds, enrolments }, { data: profiles }, { data: links }] = await Promise.all([
      loadTutorClasses(db, me, new Date(), {
        enrolmentSelect:
          'id, group_id, student_id, payer_id, status, enrolled_at, plan_price_ttd, pause_reason, pause_start, pause_end, paused_at',
      }),
      db.from('profiles').select('id, role').in('id', others),
      db
        .from('parent_child_links')
        .select('parent_id, child_id, child:profiles!child_id(full_name, display_name)')
        .in('parent_id', others),
    ]);

    const groupName = new Map<string, string>((groups ?? []).map((g: any) => [g.id, g.name]));

    // Everyone whose relationship counts for a person: themself, plus linked children.
    const childOf = new Map<string, { id: string; name: string | null }[]>();
    for (const l of links ?? []) {
      const arr = childOf.get((l as any).parent_id) ?? [];
      arr.push({ id: (l as any).child_id, name: shortName((l as any).child) });
      childOf.set((l as any).parent_id, arr);
    }
    const subjects = new Set<string>(others);
    for (const kids of Array.from(childOf.values())) for (const k of kids) subjects.add(k.id);
    const subjectIds = Array.from(subjects);

    const [{ data: pendingMembers }, { data: bookings }] = await Promise.all([
      groupIds.length
        ? db
            .from('group_members')
            .select('group_id, user_id, parent_id')
            .eq('status', 'pending')
            .in('group_id', groupIds)
        : Promise.resolve({ data: [] as any[] }),
      db
        .from('bookings')
        .select('student_id, payer_id, status')
        .eq('tutor_id', me)
        .in('status', [...OPEN_BOOKING, ...HISTORIC_BOOKING]),
    ]);

    // Facts keyed by the profile they belong to (student, payer or requester).
    const facts = new Map<string, { keys: Set<string>; classes: Set<string>; related: boolean }>();
    const fact = (id: string | null | undefined) => {
      if (!id || !subjects.has(id)) return null;
      let f = facts.get(id);
      if (!f) facts.set(id, (f = { keys: new Set(), classes: new Set(), related: false }));
      return f;
    };

    for (const e of enrolments as any[]) {
      // Any enrolment, past ones included, means this is not a first enquiry.
      const active = ACTIVE_ENROLMENT.includes(e.status);
      for (const id of new Set([e.student_id, e.payer_id])) {
        const f = fact(id);
        if (!f) continue;
        f.related = true;
        if (!active) continue;
        f.keys.add(`enrol:${e.status}`);
        const n = groupName.get(e.group_id);
        if (n) f.classes.add(n);
      }
    }
    for (const m of pendingMembers ?? []) {
      for (const id of new Set([(m as any).user_id, (m as any).parent_id])) {
        const f = fact(id);
        if (!f) continue;
        f.related = true;
        f.keys.add('join');
      }
    }
    for (const b of bookings ?? []) {
      for (const id of new Set([(b as any).student_id, (b as any).payer_id])) {
        const f = fact(id);
        if (!f) continue;
        f.related = true;
        f.keys.add(`booking:${(b as any).status}`);
      }
    }

    const roleOf = new Map<string, string | null>((profiles ?? []).map((p: any) => [p.id, p.role ?? null]));
    const people: Record<string, MessagePerson> = {};
    for (const id of others) {
      const role = roleOf.get(id) ?? null;
      const own = facts.get(id);
      const kids = childOf.get(id) ?? [];
      const keys = new Set<string>(own ? Array.from(own.keys) : []);
      const classes = new Set<string>(own ? Array.from(own.classes) : []);
      let related = own?.related ?? false;
      let child: string | null = null;
      for (const k of kids) {
        const kf = facts.get(k.id);
        if (!kf?.related) continue;
        related = true;
        child = child ?? k.name;
        for (const key of Array.from(kf.keys)) keys.add(key);
        for (const c of Array.from(kf.classes)) classes.add(c);
      }
      const rule = RULES.find((r) => keys.has(r.key));
      // Only students and parents can be enquiries; admins and other tutors are not.
      const enquiry = !related && (role === 'student' || role === 'parent');
      people[id] = {
        role,
        tag: rule ? { label: rule.label, tone: rule.tone } : enquiry ? { label: 'New enquiry', tone: 'brand' } : null,
        needsAction: Boolean(rule),
        enquiry,
        classes: Array.from(classes),
        child,
      };
    }

    const about: Record<string, string> = {};
    for (const c of convs ?? []) {
      const n = (c as any).group_context_id ? groupName.get((c as any).group_context_id) : undefined;
      if (n) about[(c as any).id] = n;
    }

    return ok({ people, about });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}
