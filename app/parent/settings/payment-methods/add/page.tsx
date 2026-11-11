'use client';

// Settings › Payment methods › Add a card (frame 160:8220). New UI only.
import ParentAddCardV2 from '@/components/parent/v2/ParentAddCardV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function ParentAddCardPage() {
  const enabled = useNewUiOnly('/parent/settings?section=billing');
  return enabled ? <ParentAddCardV2 /> : null;
}
