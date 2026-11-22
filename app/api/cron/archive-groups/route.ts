import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { runClassActivity } from '@/lib/server/classActivity';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily (03:00 UTC, vercel.json). Runs both keep-active rules — 30 days with
 * no students and 90 days with no activity — through one notice → reminder →
 * archive flow. See lib/server/classActivity.ts.
 *
 * Until CLASS_ACTIVITY_RULE_ENABLED=true it is a dry run: the response lists
 * what would happen and nothing is written or sent. That includes the old
 * 90-day archive, which used to run with no warning at all.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = await runClassActivity(getServiceClient());
    return NextResponse.json({
      success: true,
      ...report,
      // The old response's fields, for anything that still reads them.
      archived_count: report.archived.length,
      groups: report.archived.map((a) => ({ id: a.groupId, name: a.name })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/cron/archive-groups]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
