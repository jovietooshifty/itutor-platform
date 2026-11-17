'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import TutorProfileEditV2 from '@/components/tutor/v2/TutorProfileEditV2';

/**
 * New-UI only (canvas m28). With the flag off the same fields live in the old
 * Settings › Account section, so send the tutor there rather than 404.
 */
export default function TutorProfileEditPage() {
  const router = useRouter();
  const on = isNewUiEnabled();
  useEffect(() => {
    if (!on) router.replace('/tutor/settings?section=profile');
  }, [on, router]);
  return on ? <TutorProfileEditV2 /> : null;
}
