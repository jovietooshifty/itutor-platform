'use client';

/**
 * Which shell a student page gets.
 *
 * The parent new UI branches page by page, because parent pages render their
 * own shell. Student pages cannot: app/student/layout.tsx wraps EVERY page in
 * the old StudentShell, so a new screen that rendered StudentV2Shell itself
 * would come out with the new chrome nested inside the old sidebar.
 *
 * So the layout steps aside for the routes that have a new screen, and those
 * pages render StudentV2Shell themselves (they need to pass width and title).
 * Everything else keeps the old shell until its flow is built. Add a route here
 * in the same commit as its V2 screen.
 *
 * isNewUiEnabled() reads a NEXT_PUBLIC_ variable, fixed at build time, so the
 * branch never flips between renders.
 */

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { StudentShell } from '@/components/student/StudentShell';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';

const V2_ROUTES: RegExp[] = [/^\/student\/dashboard\/?$/];

export function isStudentV2Route(pathname: string | null): boolean {
  if (!isNewUiEnabled() || !pathname) return false;
  return V2_ROUTES.some((re) => re.test(pathname));
}

export default function StudentLayoutSwitch({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isStudentV2Route(pathname)) return <>{children}</>;
  return <StudentShell>{children}</StudentShell>;
}
