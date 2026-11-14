'use client';

/**
 * Help, inside the parent app. Settings › "Help and support" and Billing ›
 * "Billing help" land here.
 *
 * Both used to go to /help, the public help centre, which sits in the
 * marketing shell and shows "Log in" and "Get started" to a parent who is
 * already signed in. That page is for visitors and stays as it is. With the
 * new UI off this route sends the parent there, as before.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import ParentHelpV2 from '@/components/parent/v2/ParentHelpV2';

export default function ParentHelpPage() {
  const router = useRouter();
  const enabled = isNewUiEnabled();

  useEffect(() => {
    if (!enabled) router.replace('/help');
  }, [enabled, router]);

  if (!enabled) return null;
  return <ParentHelpV2 />;
}
