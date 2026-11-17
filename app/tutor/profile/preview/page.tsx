import { redirect } from 'next/navigation';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import TutorFamilyPreviewV2 from '@/components/tutor/v2/TutorFamilyPreviewV2';

/** View as a family (new UI only; the old profile keeps its own link). */
export default function TutorProfilePreviewPage() {
  if (!isNewUiEnabled()) redirect('/tutor/profile');
  return <TutorFamilyPreviewV2 />;
}
