// GET /api/classes/awaiting-payment
// Paid classes the caller (a student) or the caller's children (a parent) were
// approved for and have not paid for yet. Feeds the dashboard "pay now" card.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { listAwaitingPayment } from '@/lib/server/awaitingPayment';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const role = (me as { role?: string } | null)?.role;

    let studentIds: string[] = [user.id];
    if (role === 'parent') {
      const { data: links } = await admin
        .from('parent_child_links')
        .select('child_id')
        .eq('parent_id', user.id);
      studentIds = ((links ?? []) as Array<{ child_id: string }>).map((l) => l.child_id);
    }

    const items = await listAwaitingPayment(admin, studentIds);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[GET /api/classes/awaiting-payment]', err);
    return NextResponse.json({ items: [] });
  }
}
