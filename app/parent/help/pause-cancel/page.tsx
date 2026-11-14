'use client';

// Help › pause-cancel (frame 160:8498). New UI only; with the flag off the public help
// centre is the help there is, as for /parent/help.
import { ParentHelpPauseCancelV2 } from '@/components/parent/v2/ParentHelpV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function Page() {
  const enabled = useNewUiOnly('/help');
  return enabled ? <ParentHelpPauseCancelV2 /> : null;
}
