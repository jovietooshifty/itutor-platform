'use client';

// /student/settings/profile — Customise profile (Figma 2:2466). New UI only:
// with the flag off it hands back to the old settings page, where the same
// fields live on its Profile and Academic tabs.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import StudentV2Shell from '@/components/student/v2/StudentV2Shell';
import StudentProfileEditV2 from '@/components/student/v2/StudentProfileEditV2';

export default function StudentProfileEditRoute() {
  const router = useRouter();
  const on = isNewUiEnabled();
  useEffect(() => {
    if (!on) router.replace('/student/settings');
  }, [on, router]);
  if (!on) return null;
  return (
    <StudentV2Shell width="wide" title="Customise profile" nav={false}>
      <StudentProfileEditV2 />
    </StudentV2Shell>
  );
}
