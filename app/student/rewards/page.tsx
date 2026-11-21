'use client';

// /student/rewards — the student's iTutor credits: balance, referral link,
// friends, history. Old UI shares components/credits/RewardsPage with
// /parent/rewards; the new UI (Figma 2:1995) is StudentRewardsV2.

import RewardsPage from '@/components/credits/RewardsPage';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import StudentV2Shell from '@/components/student/v2/StudentV2Shell';
import StudentRewardsV2 from '@/components/student/v2/StudentRewardsV2';

export default function StudentRewardsPage() {
  if (isNewUiEnabled()) {
    return (
      <StudentV2Shell width="wide" title="Credits">
        <StudentRewardsV2 />
      </StudentV2Shell>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl">
      <RewardsPage role="student" />
    </div>
  );
}
