'use client';

// Help › billing (frame 160:8481). New UI only; with the flag off the public help
// centre is the help there is, as for /parent/help.
import { ParentHelpBillingV2 } from '@/components/parent/v2/ParentHelpV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function Page() {
  const enabled = useNewUiOnly('/help');
  return enabled ? <ParentHelpBillingV2 /> : null;
}
