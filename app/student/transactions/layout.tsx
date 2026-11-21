// Payment history is removed from the new student UI (owner, 14 Nov 2026):
// it repeated Billing. With the flag on it goes to Billing; old UI unchanged.
import type { ReactNode } from 'react';
import NewUiRedirect from '@/components/student/v2/NewUiRedirect';

export default function StudentTransactionsLayout({ children }: { children: ReactNode }) {
  return <NewUiRedirect to="/student/subscriptions">{children}</NewUiRedirect>;
}
