'use client';

/**
 * /parent/profile — frame `160:8114`, and the Profile tab's destination.
 *
 * The tab used to point at /parent/settings, which took the parent to the old
 * five-section settings page and, before the shell fix, dropped the new tab
 * bar entirely. The frame settles it: Profile is its own screen and it keeps
 * the nav, with Profile active.
 *
 * NEW UI ONLY. With the flag off there is no such screen to show, so the
 * route redirects to the settings page that has always held these fields
 * rather than 404ing on a URL the old app never had.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ParentV2Shell from '@/components/parent/v2/ParentV2Shell';
import ParentProfileV2 from '@/components/parent/v2/ParentProfileV2';
import { parentInitials } from '@/components/parent/v2/initials';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import { useProfile } from '@/lib/hooks/useProfile';

export default function ParentProfilePage() {
  const router = useRouter();
  const { profile } = useProfile();
  const enabled = isNewUiEnabled();

  useEffect(() => {
    if (!enabled) router.replace('/parent/settings');
  }, [enabled, router]);

  if (!enabled) return null;

  return (
    <ParentV2Shell initials={parentInitials(profile)} width="wide">
      <ParentProfileV2 />
    </ParentV2Shell>
  );
}
