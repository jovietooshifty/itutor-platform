// Client-side: tell the server someone pressed Join on a group class.
//
// Attendance is derived from join clicks (lib/server/attendance.ts). The class
// Join buttons used to open the room without saying anything, so production
// recorded no joins at all and every past session read "class didn't run".
//
// Only the class id is sent. The server works out which occurrence is open now
// and whether the caller is the class's tutor or an enrolled student, so the
// client cannot choose either. Fire-and-forget with keepalive: it must never
// delay or block the meeting opening.
export function markClassJoin(groupId: string | null | undefined): void {
  if (!groupId) return;
  try {
    fetch('/api/attendance/mark-present', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never block the join */
  }
}
