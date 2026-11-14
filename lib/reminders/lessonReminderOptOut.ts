// Which students have turned lesson reminders off (student Settings, new UI).
//
// Stored in notification_preferences as category 'lesson_reminder' (migration
// 270), channel 'email', enabled=false. No row means ON, as for every
// category. The switch writes both email and push rows; the senders here are
// email (and the in-app row that goes with it), so they read the email row.
//
// FAILS OPEN. Any read error returns an empty set, so reminders still go out:
// a missed class is a worse failure than an unwanted email. Same for an
// environment without migration 270 — nobody can have opted out there.

import type { SupabaseClient } from '@supabase/supabase-js';

export const LESSON_REMINDER_CATEGORY = 'lesson_reminder';

export async function lessonRemindersOff(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  try {
    const { data, error } = await admin
      .from('notification_preferences')
      .select('user_id')
      .eq('category', LESSON_REMINDER_CATEGORY)
      .eq('channel', 'email')
      .eq('enabled', false)
      .in('user_id', ids);
    if (error) return new Set();
    return new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  } catch {
    return new Set();
  }
}
