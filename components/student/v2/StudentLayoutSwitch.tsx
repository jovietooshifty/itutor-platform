'use client';

/**
 * Which shell a student page gets.
 *
 * Student pages cannot each pick their own shell the way parent pages do:
 * app/student/layout.tsx wraps EVERY student page. So this switch decides.
 *
 * Flag off: the old StudentShell, for every page, exactly as before.
 *
 * Flag on, two cases:
 * - A route in V2_ROUTES has a new screen. The page renders StudentV2Shell
 *   itself (it needs to pass width, title, nav or a bottomBar), so the layout
 *   steps aside.
 * - Every other student route — the pages whose flow is not rebuilt yet —
 *   gets StudentV2Shell from here, with the old page content inside it. Before
 *   this, those routes fell back to the old StudentShell, so opening one
 *   (Messages, Payment history, a booking, Study tools…) flipped the whole app
 *   back to the old sidebar and header mid-session. The content of those pages
 *   is still the old design; the chrome no longer changes under the student.
 *
 * Add a route to V2_ROUTES in the same commit as its V2 screen.
 *
 * isNewUiEnabled() reads a NEXT_PUBLIC_ variable, fixed at build time, so the
 * branch never flips between renders.
 */

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { StudentShell } from '@/components/student/StudentShell';
import StudentV2Shell from '@/components/student/v2/StudentV2Shell';
import { StudentStoreProvider } from '@/lib/student-store';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';

const V2_ROUTES: RegExp[] = [
  /^\/student\/dashboard\/?$/,
  /^\/student\/find-tutors\/?$/,
  /^\/student\/explore\/[^/]+\/?$/,
  /^\/student\/classes\/?$/,
  /^\/student\/notifications\/?$/,
  /^\/student\/subscriptions\/?$/,
  /^\/student\/rewards\/?$/,
  /^\/student\/settings\/?$/,
  /^\/student\/settings\/profile\/?$/,
  /^\/student\/tutors\/[^/]+(\/book)?\/?$/,
  /^\/student\/ratings\/?$/,
  /^\/student\/messages(\/[^/]+)?\/?$/,
];

export function isStudentV2Route(pathname: string | null): boolean {
  if (!isNewUiEnabled() || !pathname) return false;
  return V2_ROUTES.some((re) => re.test(pathname));
}

export default function StudentLayoutSwitch({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!isNewUiEnabled()) return <StudentShell>{children}</StudentShell>;
  if (isStudentV2Route(pathname)) return <>{children}</>;
  return (
    <StudentStoreProvider>
      <StudentV2Shell width="wide">
        {/* Old page content, unchanged. */}
        <div className="min-w-0">{children}</div>
      </StudentV2Shell>
    </StudentStoreProvider>
  );
}
