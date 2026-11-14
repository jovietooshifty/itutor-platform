'use client';

// Settings › Security (frame 160:8156). New UI only.
import ParentSecurityV2 from '@/components/parent/v2/ParentSecurityV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function ParentSecurityPage() {
  const enabled = useNewUiOnly('/parent/settings?section=security');
  return enabled ? <ParentSecurityV2 /> : null;
}
