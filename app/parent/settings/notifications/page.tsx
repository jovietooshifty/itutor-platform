'use client';

// Settings › Notifications (frame 160:8262). New UI only; with the flag off
// the old Settings › Notifications section holds the same switches.
import ParentNotificationSettingsV2 from '@/components/parent/v2/ParentNotificationSettingsV2';
import { useNewUiOnly } from '@/components/parent/v2/accountKit';

export default function ParentNotificationSettingsPage() {
  const enabled = useNewUiOnly('/parent/settings?section=notifications');
  return enabled ? <ParentNotificationSettingsV2 /> : null;
}
