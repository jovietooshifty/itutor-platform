import { redirect } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import TutorSubjectsRatesV2 from '@/components/tutor/v2/TutorSubjectsRatesV2';

/** Subjects and rates (new UI). The old UI keeps them on /tutor/get-listed. */
export default function TutorSubjectsPage() {
  if (!isNewUiEnabled()) redirect('/tutor/get-listed');
  return <TutorSubjectsRatesV2 />;
}
