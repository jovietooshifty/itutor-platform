'use client';

// Settings › Payment methods (frame 160:8186). New UI only; with the flag off
// the old Settings › Billing section is where cards and billing live.
import ParentPaymentMethodsV2 from '@/components/parent/v2/ParentPaymentMethodsV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function ParentPaymentMethodsPage() {
  const enabled = useNewUiOnly('/parent/settings?section=billing');
  return enabled ? <ParentPaymentMethodsV2 /> : null;
}
