'use client';

// Billing › a class — Payment detail (frame 160:6853) with the pause/cancel
// flow. New UI only; with the flag off pause and cancel stay in the old
// Settings › Billing section.
import { useParams } from 'next/navigation';
import ParentPaymentDetailV2 from '@/components/parent/v2/ParentPaymentDetailV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function ParentPaymentDetailPage() {
  const params = useParams<{ enrolmentId: string }>();
  const enabled = useNewUiOnly('/parent/settings?section=billing');
  if (!enabled || !params?.enrolmentId) return null;
  return <ParentPaymentDetailV2 enrolmentId={params.enrolmentId} />;
}
