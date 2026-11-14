import type { ReactNode } from 'react';
import StudentLayoutSwitch from '@/components/student/v2/StudentLayoutSwitch';

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentLayoutSwitch>{children}</StudentLayoutSwitch>;
}
