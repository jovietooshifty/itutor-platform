import { NextRequest } from 'next/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { TUTOR_REACTIVATABLE_REASONS, isMissingTable, warningDeadline } from '@/lib/server/classActivity';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tutor/class-activity — the signed-in tutor's own classes:
 *   warnings  classes in a keep-active warning, with the archive date
 *   archived  archived classes they can reactivate themselves
 * Response is wrapped by ok(): read `json.data`.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    const db = getServiceClient();

    const { data: own, error } = await db
      .from('groups')
      .select('id, name, subject, cover_image, archived_at, archived_reason, visibility')
      .eq('tutor_id', user.id);
    if (error) throw error;
    const rows = own ?? [];
    const ids = rows.map((g: any) => g.id);

    let states: any[] = [];
    if (ids.length > 0) {
      const { data, error: sErr } = await db
        .from('class_activity_state')
        .select('group_id, warning_rule, warned_at, reminded_at')
        .in('group_id', ids)
        .not('warning_rule', 'is', null);
      if (sErr && !isMissingTable(sErr)) throw sErr;
      states = data ?? [];
    }

    const warnings = states
      .filter((s) => s.warned_at)
      .map((s) => ({
        groupId: s.group_id,
        rule: s.warning_rule as 'no_students' | 'inactive',
        archiveOn: warningDeadline(s.warned_at).toISOString(),
        reminded: Boolean(s.reminded_at),
      }));

    const archived = rows
      .filter((g: any) => g.archived_at && TUTOR_REACTIVATABLE_REASONS.includes(g.archived_reason ?? ''))
      .sort((a: any, b: any) => (b.archived_at as string).localeCompare(a.archived_at))
      .map((g: any) => ({
        id: g.id,
        name: g.name ?? 'Untitled class',
        subject: g.subject ?? null,
        coverImage: g.cover_image ?? null,
        archivedAt: g.archived_at,
        reason: g.archived_reason,
        visibility: g.visibility ?? 'public',
      }));

    return ok({ warnings, archived });
  } catch (err: any) {
    return fail(err?.message ?? 'Internal server error', 500);
  }
}
