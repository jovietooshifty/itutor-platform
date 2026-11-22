import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import { TUTOR_REACTIVATABLE_REASONS, readState, startFreshPeriod } from '@/lib/server/classActivity';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

/**
 * POST /api/groups/[groupId]/restore — "Reactivate" on Classes → Archived.
 *
 * Brings the class back exactly as it was: the status it had before the rules
 * archived it (a draft stays a draft; this used to force PUBLISHED), back on
 * the marketplace if it is public, with a fresh 30-day period.
 *
 * A tutor may undo the automatic archives and their own. A class an admin
 * archived (free-text moderation reason) stays archived unless a superadmin
 * restores it.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email, columns: 'archived_reason' });
    if (actor.notFound || !actor.authorized) {
      return NextResponse.json({ error: 'Group not found or you do not own it' }, { status: 404 });
    }
    const group = actor.group as any;

    if (!group.archived_at) {
      return NextResponse.json({ error: 'Group is not archived' }, { status: 400 });
    }
    if (!actor.isAdminOverride && !TUTOR_REACTIVATABLE_REASONS.includes(group.archived_reason ?? '')) {
      return NextResponse.json(
        { error: 'This class was archived by the iTutor team. Contact support to bring it back.' },
        { status: 403 }
      );
    }

    const state = await readState(service, groupId);
    const status = state?.previous_status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';

    const { error: updateError } = await service
      .from('groups')
      .update({
        archived_at: null,
        archived_reason: null,
        status,
      })
      .eq('id', groupId);

    if (updateError) throw updateError;

    await startFreshPeriod(service, groupId, { clearArchive: true });

    await service.from('group_activity_log').insert({
      group_id: groupId,
      tutor_id: user.id,
      action: 'restored',
      details: { restored_at: new Date().toISOString(), status },
    });

    // Record a visit to reset the inactivity timer
    await service.from('group_visits').insert({
      group_id: groupId,
      user_id: user.id,
    });

    await auditAdminOverride(actor, 'class.restore');

    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/restore]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
