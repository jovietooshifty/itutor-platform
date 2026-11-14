// GET/PATCH /api/account/lesson-reminders — the caller's own "Lesson reminders"
// switch (student Settings, new UI).
//
// Stored as notification_preferences category 'lesson_reminder' (migration
// 270), one row per channel (email, push). No row = ON. Turning it off writes
// enabled=false for both channels; turning it on writes enabled=true.
// Honoured by /api/cron/send-reminders (1:1) and the group-class reminders
// (lib/reminders/lessonReminderOptOut.ts).
//
// GET answers { enabled: true|false, available: boolean }. `available` is
// false when the write is impossible (an environment without migration 270),
// so the screen can show the switch as fixed-on instead of one that fails.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { LESSON_REMINDER_CATEGORY } from '@/lib/reminders/lessonReminderOptOut';

export const dynamic = 'force-dynamic';

async function caller() {
  const server = await getServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const user = await caller();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await getServiceClient()
      .from('notification_preferences')
      .select('channel, enabled')
      .eq('user_id', user.id)
      .eq('category', LESSON_REMINDER_CATEGORY);
    if (error) return NextResponse.json({ enabled: true, available: false });
    const rows = (data ?? []) as Array<{ channel: string; enabled: boolean }>;
    const email = rows.find((r) => r.channel === 'email');
    return NextResponse.json({ enabled: email ? email.enabled : true, available: true });
  } catch (err) {
    console.error('[GET /api/account/lesson-reminders]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await caller();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const { error } = await getServiceClient()
      .from('notification_preferences')
      .upsert(
        ['email', 'push'].map((channel) => ({
          user_id: user.id,
          category: LESSON_REMINDER_CATEGORY,
          channel,
          enabled: body.enabled as boolean,
          updated_at: now,
        })),
        { onConflict: 'user_id,category,channel' }
      );
    if (error) {
      console.error('[PATCH /api/account/lesson-reminders]', error);
      return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }
    return NextResponse.json({ enabled: body.enabled });
  } catch (err) {
    console.error('[PATCH /api/account/lesson-reminders]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
