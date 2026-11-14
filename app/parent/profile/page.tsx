'use client';

/**
 * /parent/profile — frame `160:8111`. Reached only from Settings (the
 * Profile row and the parent card); back link to Settings. See the header of
 * ParentProfileV2 for why the frame's tab bar is not drawn.
 *
 * NEW UI ONLY. With the flag off there is no such screen to show, so the
 * route redirects to the settings page that has always held these fields
 * rather than 404ing on a URL the old app never had.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DetailScreen } from '@/components/parent/v2/DetailScreen';
import ParentProfileV2 from '@/components/parent/v2/ParentProfileV2';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';

export default function ParentProfilePage() {
  const router = useRouter();
  const enabled = isNewUiEnabled();

  useEffect(() => {
    if (!enabled) router.replace('/parent/settings');
  }, [enabled, router]);

  if (!enabled) return null;

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Profile" width="wide">
      <ParentProfileV2 />
    </DetailScreen>
  );
}
