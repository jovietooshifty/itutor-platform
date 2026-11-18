// Who may rate a group class (owner, 15 Nov): an enrolled student who has
// joined at least one of its sessions. This replaced the 30-day tenure gate.
//
// "Joined" is the attendance log the Join button feeds (recordStudentJoin) and
// the tutor's register writes: a row for this student and class that is
// attended or late, or carries a join time.

import type { SupabaseClient } from '@supabase/supabase-js';

type Admin = SupabaseClient<any, 'public', 'public', any, any>;

/** The subset of `groupIds` this student has joined a session of. */
export async function groupsJoinedBy(admin: Admin, studentId: string, groupIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (groupIds.length === 0) return out;
  const { data } = await admin
    .from('session_attendance_log')
    .select('group_id, status, joined_at')
    .eq('student_id', studentId)
    .in('group_id', groupIds)
    .or('status.in.(attended,late),joined_at.not.is.null')
    .limit(1000);
  for (const r of (data ?? []) as Array<{ group_id: string | null }>) if (r.group_id) out.add(r.group_id);
  return out;
}
