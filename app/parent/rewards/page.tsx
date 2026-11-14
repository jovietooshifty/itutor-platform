'use client';

// /parent/rewards — the parent's iTutor credits. Credits a parent earns or
// redeems are theirs, and they can spend them on their children's classes.
// Shared with /student/rewards (components/credits/RewardsPage); the new UI
// renders its own screen over the same data (components/parent/v2).

import ParentShell from '@/components/parent/ParentShell';
import RewardsPage from '@/components/credits/RewardsPage';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import ParentRewardsV2 from '@/components/parent/v2/ParentRewardsV2';

export default function ParentRewardsPage() {
  if (isNewUiEnabled()) return <ParentRewardsV2 />;
  return (
    <ParentShell>
      <div className="mx-auto w-full max-w-3xl">
        <RewardsPage role="parent" />
      </div>
    </ParentShell>
  );
}
