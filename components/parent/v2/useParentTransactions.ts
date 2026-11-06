'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { cashBaseTtd, creditsCol, withOptionalCredits } from '@/lib/credits/cash';

export type TxnRow = {
  id: string; student_name: string; amount_ttd: number; status: string;
  created_at: string; enrollment_id: string | null; class_name: string;
  type: 'payment' | 'refund';
};

/**
 * Payments for every enrolment of every linked child, newest first. Shared by
 * the old page and the v2 screen so the two cannot disagree about a figure.
 */
export function useParentTransactions(profileId: string | undefined) {
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      const { data: links } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profileId);

      if (!links?.length) { setLoading(false); return; }

      const childMap = new Map(links.map((l: any) => {
        const c = Array.isArray(l.child) ? l.child[0] : l.child;
        return [c.id, c?.display_name || c?.full_name || 'Child'];
      }));
      const childIds = [...childMap.keys()];

      // Fetch subscription payments for all children's enrollments
      const { data: enrollments } = await supabase
        .from('group_enrollments')
        .select('id, student_id, group:groups!group_enrollments_group_id_fkey(name)')
        .in('student_id', childIds);

      const enrollmentIds = (enrollments ?? []).map((e: any) => e.id);
      const enrollMap = new Map((enrollments ?? []).map((e: any) => [
        e.id,
        { student_id: e.student_id, class_name: (Array.isArray(e.group) ? e.group[0] : e.group)?.name ?? 'Class' },
      ]));

      if (!enrollmentIds.length) { setLoading(false); return; }

      const { data: payments } = await withOptionalCredits((on) =>
        supabase
          .from('subscription_payments')
          .select('id, enrollment_id, amount_ttd, status, created_at' + creditsCol(on))
          .in('enrollment_id', enrollmentIds)
          .order('created_at', { ascending: false })
          .limit(100)
      );

      const rows: TxnRow[] = (payments ?? []).map((p: any) => {
        const info = enrollMap.get(p.enrollment_id);
        return {
          id: p.id,
          student_name: info ? (childMap.get(info.student_id) ?? 'Child') : 'Child',
          // Cash only: the part iTutor credits covered was not paid by you.
          amount_ttd: cashBaseTtd(p),
          status: p.status ?? 'PENDING',
          created_at: p.created_at,
          enrollment_id: p.enrollment_id,
          class_name: info?.class_name ?? 'Class',
          type: 'payment' as const,
        };
      });

      setTxns(rows);
      setLoading(false);
    })();
  }, [profileId]);

  return { txns, loading };
}
