'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';

/**
 * Pages the owner removed from the new student UI (14 Nov 2026): with the flag
 * on, send the student to `to`; with it off, render the old page unchanged.
 * Nothing renders while redirecting, so the old design never flashes.
 */
export default function NewUiRedirect({ to, children }: { to: string; children: ReactNode }) {
  const router = useRouter();
  const on = isNewUiEnabled();
  useEffect(() => {
    if (on) router.replace(to);
  }, [on, to, router]);
  return on ? null : <>{children}</>;
}
