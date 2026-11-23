// Paid classes a student has been APPROVED for but has not paid for yet.
//
// On a paid class a tutor's approval is permission to pay, not a seat (see
// isEnrolledInGroup and the class API's viewer_membership.enrolled). Until the
// student pays, they hold nothing — so the dashboard has to tell them, or the
// approval sits unseen and the place is never taken.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isPaidGroup } from '@/lib/payments/groupPricing';

export type AwaitingPaymentItem = {
  groupId: string;
  className: string;
  priceMonthly: number | null;
  studentId: string;
  /** Set for a parent's view: whose place this is. */
  studentName: string | null;
};

const LIVE = ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'];

export async function listAwaitingPayment(
  admin: SupabaseClient,
  studentIds: string[]
): Promise<AwaitingPaymentItem[]> {
  if (studentIds.length === 0) return [];

  const { data: members } = await admin
    .from('group_members')
    .select('group_id, user_id')
    .in('user_id', studentIds)
    .in('status', ['approved', 'invited']);
  const rows = (members ?? []) as Array<{ group_id: string; user_id: string }>;
  if (rows.length === 0) return [];

  const groupIds = [...new Set(rows.map((r) => r.group_id))];
  const { data: groups } = await admin
    .from('groups')
    .select('id, name, pricing_model, price_monthly')
    .in('id', groupIds)
    .is('archived_at', null);
  const paid = new Map(
    ((groups ?? []) as Array<any>).filter((g) => isPaidGroup(g)).map((g) => [g.id as string, g])
  );
  const candidates = rows.filter((r) => paid.has(r.group_id));
  if (candidates.length === 0) return [];

  const { data: enrolments } = await admin
    .from('group_enrollments')
    .select('group_id, student_id')
    .in('group_id', [...new Set(candidates.map((c) => c.group_id))])
    .in('student_id', studentIds)
    .in('status', LIVE);
  const seated = new Set(
    ((enrolments ?? []) as Array<{ group_id: string; student_id: string }>).map(
      (e) => `${e.group_id}:${e.student_id}`
    )
  );

  const unpaid = candidates.filter((c) => !seated.has(`${c.group_id}:${c.user_id}`));
  if (unpaid.length === 0) return [];

  const { data: people } = await admin
    .from('profiles')
    .select('id, full_name, display_name')
    .in('id', [...new Set(unpaid.map((u) => u.user_id))]);
  const names = new Map(
    ((people ?? []) as Array<any>).map((p) => [p.id as string, (p.display_name || p.full_name || null) as string | null])
  );

  return unpaid.map((u) => {
    const g = paid.get(u.group_id);
    return {
      groupId: u.group_id,
      className: g?.name ?? 'Class',
      priceMonthly: g?.price_monthly != null ? Number(g.price_monthly) : null,
      studentId: u.user_id,
      studentName: names.get(u.user_id) ?? null,
    };
  });
}
