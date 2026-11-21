// Study tools are removed from the new student UI (owner, 14 Nov 2026). Every
// /student/tools/* page goes Home with the flag on; old UI unchanged.
import type { ReactNode } from 'react';
import NewUiRedirect from '@/components/student/v2/NewUiRedirect';

export default function StudentToolsLayout({ children }: { children: ReactNode }) {
  return <NewUiRedirect to="/student/dashboard">{children}</NewUiRedirect>;
}
