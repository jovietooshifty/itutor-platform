import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import { startFreshPeriod } from '@/lib/server/classActivity';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

/**
 * POST /api/groups/[groupId]/keep-active — the "Keep my class active" button
 * (from the notice email, the in-app notification and the class page banner).
 *
 * Drops any warning in progress and starts a fresh 30-day period. It also
 * records a tutor visit, so it counts as activity for the 90-day rule too.
 * POST only: an email client that prefetches the link must not press it.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound || !actor.authorized) {
      return NextResponse.json({ error: 'Class not found or you do not own it' }, { status: 404 });
    }
    if (actor.group.archived_at) {
      return NextResponse.json({ error: 'This class is archived. Reactivate it from Classes → Archived.' }, { status: 409 });
    }

    const service = getServiceClient();
    await startFreshPeriod(service, groupId);
    await service.from('group_visits').insert({ group_id: groupId, user_id: user.id });
    await service.from('group_activity_log').insert({
      group_id: groupId,
      tutor_id: actor.group.tutor_id ?? user.id,
      action: 'kept_active',
      details: { at: new Date().toISOString() },
    });
    await auditAdminOverride(actor, 'class.keep_active');

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/keep-active]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
