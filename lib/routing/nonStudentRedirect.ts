/**
 * Where a signed-in account that is NOT a student goes when it opens a
 * student page.
 *
 * Student pages used to send every non-student to /login. Parents reach
 * student URLs all the time — a "Booking confirmed" notification or email
 * written for the child, a link a child shared — and landing on the login
 * screen while signed in reads as being thrown out. A parent now goes to the
 * parent screen that shows the same thing; any other role, or no profile,
 * still goes to /login as before.
 */
export function nonStudentRedirect(
  profile: { role?: string | null } | null | undefined,
  pathname?: string
): string {
  if (!profile || profile.role !== 'parent') return '/login';
  const path =
    pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/student/dashboard');
  return parentEquivalent(path);
}

/** The parent route that shows what a given student route shows. */
export function parentEquivalent(path: string): string {
  const m = (re: RegExp) => path.match(re);
  let hit: RegExpMatchArray | null;
  if ((hit = m(/^\/student\/classes\/([^/?#]+)/))) return `/parent/classes/${hit[1]}`;
  if ((hit = m(/^\/student\/explore\/([^/?#]+)/))) return `/parent/classes/${hit[1]}`;
  if ((hit = m(/^\/student\/tutors\/([^/?#]+)/))) return `/parent/tutors/${hit[1]}`;
  if (path.startsWith('/student/bookings')) return '/parent/my-classes';
  if (path.startsWith('/student/classes')) return '/parent/my-classes';
  if (path.startsWith('/student/subscriptions')) return '/parent/my-classes';
  if (path.startsWith('/student/messages')) return '/parent/messages';
  if (path.startsWith('/student/notifications')) return '/parent/notifications';
  if (path.startsWith('/student/ratings')) return '/parent/feedback';
  if (path.startsWith('/student/search')) return '/parent/classes';
  if (path.startsWith('/student/explore')) return '/parent/classes';
  if (path.startsWith('/student/find-tutors')) return '/parent/classes';
  if (path.startsWith('/student/settings')) return '/parent/settings';
  if (path.startsWith('/student/rewards')) return '/parent/rewards';
  return '/parent/dashboard';
}
