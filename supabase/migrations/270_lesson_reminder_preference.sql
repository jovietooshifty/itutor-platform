-- =====================================================
-- 270: let a student turn lesson reminders off
-- =====================================================
-- notification_preferences (226) only allowed the six parent categories. A
-- student's "Lesson reminders" switch (student Settings, new UI) stores
-- category 'lesson_reminder', one row per channel (email, push), enabled
-- false when off. Absence of a row still means ON, as for every category.
--
-- Additive: widens a CHECK. No data changes, no trigger fires.
-- The senders that honour it: /api/cron/send-reminders (1:1 session
-- reminders) and /api/cron/group-class-reminders. Both skip a student whose
-- email row is disabled.

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_category_check;

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (category = ANY (ARRAY[
    'booking_request', 'approval_outcome', 'payment',
    'feedback_received', 'feedback_requested', 'subscription',
    'lesson_reminder'
  ]::text[]));
