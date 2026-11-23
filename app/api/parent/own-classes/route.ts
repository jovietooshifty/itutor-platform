// GET /api/parent/own-classes
//
// Classes a PARENT account is enrolled in itself — not a child's. Happens when a
// parent joins through a class's share link, which lands on the student join
// page and enrols whoever is signed in. The seat is real (paid, on the roster)
// but the parent pages only ever list children's classes, so without this the
// parent has no way back to a class they paid for.
//
// Same seat rule as everywhere else: a paid class needs a live enrolment, a
// free class needs an approved roster row.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { isPaidGroup } from '@/lib/payments/groupPricing';

export const dynamic = 'force-dynamic';

const LIVE = ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'];

export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();

    const { data: members } = await admin
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)
      .in('status', ['approved', 'active', 'invited']);
    const groupIds = ((members ?? []) as Array<{ group_id: string }>).map((m) => m.group_id);
    if (groupIds.length === 0) return NextResponse.json({ classes: [] });

    const [{ data: groups }, { data: enrolments }] = await Promise.all([
      admin
        .from('groups')
        .select('id, name, subject, pricing_model, price_monthly')
        .in('id', groupIds)
        .is('archived_at', null),
      admin
        .from('group_enrollments')
        .select('group_id')
        .eq('student_id', user.id)
        .in('group_id', groupIds)
        .in('status', LIVE),
    ]);

    const paidUp = new Set(((enrolments ?? []) as Array<{ group_id: string }>).map((e) => e.group_id));
    const classes = ((groups ?? []) as Array<any>)
      .filter((g) => !isPaidGroup(g) || paidUp.has(g.id))
      .map((g) => ({ id: g.id as string, name: g.name as string, subject: (g.subject ?? null) as string | null }));

    return NextResponse.json({ classes });
  } catch (err) {
    console.error('[GET /api/parent/own-classes]', err);
    return NextResponse.json({ classes: [] });
  }
}
