'use client';

// The parent's marketplace — the SAME screen the student browses.
//
// It used to be a parent-only list: its own cards, its own two tabs, no filters,
// no day/time narrowing, no promotions, no capacity language, and a join modal
// on the card itself. That was a second description of one catalogue, and the
// parent got the poorer half of it while being the person least able to judge a
// class without the detail.
//
// What was here that is deliberately NOT here any more: joining from a card.
// A card cannot ask which child it is for, and §5 puts the child choice and its
// two checks inside the booking flow — which lives on the class page. Every
// card now opens /parent/classes/[groupId], where ChildPickerCheck runs before
// anything is joined or paid.

import ParentShell from '@/components/parent/ParentShell';
import ExploreMarketplace from '@/components/marketplace/ExploreMarketplace';
import ParentV2Shell from '@/components/parent/v2/ParentV2Shell';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import { parentInitials } from '@/components/parent/v2/initials';
import { useProfile } from '@/lib/hooks/useProfile';

/**
 * Explore — SCREEN_MAP logic row 3.
 *
 * The row's requirement is that parent Explore REUSES ExploreMarketplace's data
 * and logic rather than opening a second path to the same catalogue. So the
 * marketplace component is unchanged and is simply given the new chrome: with
 * the flag on it renders inside ParentV2Shell (new header, five-tab bar), with
 * the flag off inside ParentShell exactly as before.
 *
 * The cards are now the Explore frames too. That was deferred once because
 * restyling in place means editing a 1,698-line component that also serves the
 * LIVE student marketplace and carries `@ts-nocheck`, so the compiler would
 * catch none of it. It is done instead by swapping only the PRESENTATION:
 * ExploreMarketplace keeps the catalogue, the filters and the gating, and for a
 * parent on the new UI it renders ParentExploreV2 rather than its own markup.
 * The new markup lives in its own type-checked file, and the student path is
 * untouched by construction rather than by careful editing.
 */
export default function ParentClassesPage() {
  const { profile } = useProfile();

  if (isNewUiEnabled()) {
    return (
      <ParentV2Shell initials={parentInitials(profile)}>
        <ExploreMarketplace variant="parent" />
      </ParentV2Shell>
    );
  }

  return (
    <ParentShell>
      <ExploreMarketplace variant="parent" />
    </ParentShell>
  );
}
