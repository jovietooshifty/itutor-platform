'use client';

// Help › contact (frame 160:8462). New UI only; with the flag off the public help
// centre is the help there is, as for /parent/help.
import { ParentHelpContactV2 } from '@/components/parent/v2/ParentHelpV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function Page() {
  const enabled = useNewUiOnly('/help');
  return enabled ? <ParentHelpContactV2 /> : null;
}
