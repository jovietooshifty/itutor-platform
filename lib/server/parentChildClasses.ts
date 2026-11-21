// The ONE definition of "the classes a child is in", for every parent surface
// that counts or lists them: the child page, Home, Classes › Upcoming and the
// children summary.
//
// WHY THIS EXISTS. QA (10 Nov) found one child described three ways: the child
// page said 6 classes, Home said 3 and Classes › Upcoming listed 2. Each read a
// different table with a different rule:
//   child page   group_members approved/active — including an ARCHIVED class
//   Home         group_enrollments not cancelled — including a COMPLETED one
//   Classes      group_enrollments not cancelled and not completed
// and the two billing-based ones could never see a FREE class, because a free
// class has a group_members row and no group_enrollments row at all. A child in
// a free class tomorrow (it was on the Calendar) had no class on Home or in
// Classes.
//
// THE DEFINITION. A child is in a class when the class is not archived AND
// either
//   - they are a member (group_members.status approved | active), or
//   - they hold a live subscription (group_enrollments.status ACTIVE | GRACE |
//     SECURED | SUSPENDED, not cancelled).
// This is the same union /api/parent/calendar uses to decide whose sessions to
// show, so a class on the calendar is a class everywhere else. SUSPENDED is
// counted (the calendar leaves it out because it has nothing to attend): a
// class with a payment problem is still the child's, and Classes keeps it in
// Upcoming for that reason.
//
// Archived classes are left out: nothing runs, and the parent cannot act on one.

import type { SupabaseClient } from '@supabase/supabase-js';

export const LIVE_MEMBER_STATUSES = ['approved', 'active'] as const;
export const LIVE_ENROLLMENT_STATUSES = ['ACTIVE', 'GRACE', 'SECURED', 'SUSPENDED'] as const;

export type ChildClass = {
  childId: string;
  groupId: string;
  className: string;
  subject: string | null;
  tutorId: string | null;
  tutorName: string | null;
  /** The class's listed monthly price, 0 for a free class. */
  priceMonthly: number;
  /** True when a live subscription (a billing row) backs this class. */
  billed: boolean;
};

/**
 * Every current class for each of `childIds`, keyed by child. Service client
 * only: the rows are RLS-scoped to the child, and the caller must already have
 * checked the parent link.
 */
export async function loadChildClasses(
  admin: SupabaseClient,
  childIds: string[]
): Promise<Map<string, ChildClass[]>> {
  const out = new Map<string, ChildClass[]>();
  if (childIds.length === 0) return out;

  const [{ data: members }, { data: enrolments }] = await Promise.all([
    admin
      .from('group_members')
      .select('user_id, group_id')
      .in('user_id', childIds)
      .in('status', [...LIVE_MEMBER_STATUSES]),
    admin
      .from('group_enrollments')
      .select('student_id, group_id, cancelled_at')
      .in('student_id', childIds)
      .in('status', [...LIVE_ENROLLMENT_STATUSES]),
  ]);

  const pairs = new Map<string, { childId: string; groupId: string; billed: boolean }>();
  for (const m of (members ?? []) as Array<{ user_id: string; group_id: string }>) {
    if (!m.group_id) continue;
    pairs.set(`${m.user_id}:${m.group_id}`, { childId: m.user_id, groupId: m.group_id, billed: false });
  }
  for (const e of (enrolments ?? []) as Array<{ student_id: string; group_id: string; cancelled_at: string | null }>) {
    if (!e.group_id || e.cancelled_at) continue;
    pairs.set(`${e.student_id}:${e.group_id}`, { childId: e.student_id, groupId: e.group_id, billed: true });
  }

  const groupIds = Array.from(new Set([...pairs.values()].map((p) => p.groupId)));
  if (groupIds.length === 0) return out;

  const { data: groups } = await admin
    .from('groups')
    .select('id, name, subject, tutor_id, price_monthly, archived_at')
    .in('id', groupIds);

  const groupById = new Map(
    ((groups ?? []) as Array<{
      id: string;
      name: string | null;
      subject: string | null;
      tutor_id: string | null;
      price_monthly: number | string | null;
      archived_at: string | null;
    }>).map((g) => [g.id, g])
  );

  const tutorIds = Array.from(
    new Set([...groupById.values()].map((g) => g.tutor_id).filter((x): x is string => Boolean(x)))
  );
  const { data: tutors } = tutorIds.length
    ? await admin.from('profiles').select('id, full_name, display_name').in('id', tutorIds)
    : { data: [] as Array<{ id: string; full_name: string | null; display_name: string | null }> };
  const tutorName = new Map(
    ((tutors ?? []) as Array<{ id: string; full_name: string | null; display_name: string | null }>).map((t) => [
      t.id,
      t.display_name || t.full_name || 'Tutor',
    ])
  );

  for (const p of pairs.values()) {
    const g = groupById.get(p.groupId);
    // No row (deleted) or archived: not a class the child is in any more.
    if (!g || g.archived_at) continue;
    const list = out.get(p.childId) ?? [];
    list.push({
      childId: p.childId,
      groupId: p.groupId,
      className: g.name || g.subject || 'Class',
      subject: g.subject,
      tutorId: g.tutor_id,
      tutorName: g.tutor_id ? (tutorName.get(g.tutor_id) ?? null) : null,
      priceMonthly: Number(g.price_monthly ?? 0) || 0,
      billed: p.billed,
    });
    out.set(p.childId, list);
  }

  for (const list of out.values()) list.sort((a, b) => a.className.localeCompare(b.className));
  return out;
}
