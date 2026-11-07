'use client';

/**
 * The Classes tab — SCREEN_MAP logic row 1.
 *
 * A NEW ROUTE, because the Classes tab needs one and every obvious name was
 * taken: `/parent/classes` is the marketplace (Explore), and `/parent/classes/
 * [groupId]` is a class page under it. Putting "my classes" at `/parent/classes`
 * would have meant moving the marketplace and breaking every card link in
 * ExploreMarketplace, the attention card and the emails.
 *
 * It exists only for the new UI. With the flag off this route redirects to
 * `/parent/subscriptions`, so there is no way to reach a new screen while the
 * rest of the app is old — the redirect pair in the other direction lives on
 * the two old pages.
 */

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import ParentV2Shell from '@/components/parent/v2/ParentV2Shell';
import ParentClassesV2 from '@/components/parent/v2/ParentClassesV2';
import { parentInitials } from '@/components/parent/v2/initials';
import { useProfile } from '@/lib/hooks/useProfile';

export default function ParentMyClassesPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const enabled = isNewUiEnabled();

  useEffect(() => {
    if (!enabled) router.replace('/parent/subscriptions');
  }, [enabled, router]);

  if (!enabled) return null;

  return (
    <ParentV2Shell initials={parentInitials(profile)} width="wide">
      {/* useSearchParams (?request=, ?booking=) needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <ParentClassesV2 />
      </Suspense>
    </ParentV2Shell>
  );
}
