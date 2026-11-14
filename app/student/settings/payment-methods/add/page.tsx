'use client';

// /student/settings/payment-methods/add — the student's saved Stripe cards. The
// parent screen, pointed at the student's own routes. New UI only; with the
// flag off it hands back to Settings.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import StudentV2Shell from '@/components/student/v2/StudentV2Shell';
import ParentAddCardV2 from '@/components/parent/v2/ParentAddCardV2';
import { STUDENT_CARD_ROUTES } from '@/components/student/v2/studentCardRoutes';

export default function Page() {
  const router = useRouter();
  const on = isNewUiEnabled();
  useEffect(() => {
    if (!on) router.replace('/student/settings');
  }, [on, router]);
  if (!on) return null;
  return (
    <StudentV2Shell width="wide" title="Add a card" nav={false}>
      <ParentAddCardV2 routes={STUDENT_CARD_ROUTES} />
    </StudentV2Shell>
  );
}
