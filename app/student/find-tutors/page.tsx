'use client';

// The student's Explore screen. Everything it renders now lives in
// components/marketplace/ExploreMarketplace, because the parent renders the same
// screen at /parent/classes — see the note at the top of that file for why the
// two must not be separate implementations.

import ExploreMarketplace from '@/components/marketplace/ExploreMarketplace';
import StudentV2Shell from '@/components/student/v2/StudentV2Shell';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';

// New UI: the same marketplace inside the student shell; ExploreMarketplace
// draws the Explore frames (2:673, 2:812) itself when the flag is on.
export default function FindTutorsPage() {
  return isNewUiEnabled() ? (
    <StudentV2Shell width="wide" title="Explore">
      <ExploreMarketplace variant="student" />
    </StudentV2Shell>
  ) : (
    <ExploreMarketplace variant="student" />
  );
}
