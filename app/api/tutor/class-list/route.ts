import { NextRequest } from 'next/server';
import { authenticateUser, requireTutor } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { loadTutorClasses } from '@/lib/tutor/classSummaries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tutor/class-list — every class the signed-in tutor runs, with the
 * derived state the new Classes screen (canvas m08 / d02) shows: Live, Full,
 * Fix schedule, Draft or Paused. Scoped to the caller's own classes; see
 * lib/tutor/classSummaries.ts.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    if (!(await requireTutor(user.id))) return fail('Tutor role required', 403);

    const { summaries } = await loadTutorClasses(getServiceClient(), user.id);
    return ok({ classes: summaries });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}
