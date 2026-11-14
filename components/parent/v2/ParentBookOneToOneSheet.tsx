'use client';

/**
 * A parent books a 1:1 for their child, start to finish, without the child
 * asking first.
 *
 * Now a thin wrapper: the stepped sheet (Who → Subject & length → Day & time
 * → Review & pay) lives in components/booking/OneToOneBookingSheet.tsx and is
 * shared with the student tutor page. See that file's header for the backend
 * contract: POST /api/parent/bookings/direct-book runs the same
 * lib/bookings/directBook.ts as the student route, with the child as the
 * student and the parent as the payer; paid → /payments/checkout?pi=…, free →
 * booked CONFIRMED. The server re-checks the parent↔child link, the tutor's
 * availability, overlaps (tutor and child) and the 15-minute lead.
 */

import { OneToOneBookingSheet, type BookableSubject } from '@/components/booking/OneToOneBookingSheet';

export type { BookableSubject };

export function ParentBookOneToOneSheet({
  open,
  onClose,
  tutorId,
  tutorFirstName,
  tutorName,
  subjects,
}: {
  open: boolean;
  onClose: () => void;
  tutorId: string;
  tutorFirstName: string;
  /** Full name for the review step; falls back to the first name. */
  tutorName?: string;
  subjects: BookableSubject[];
}) {
  return (
    <OneToOneBookingSheet
      mode="parent"
      open={open}
      onClose={onClose}
      tutorId={tutorId}
      tutorName={tutorName ?? tutorFirstName}
      tutorFirstName={tutorFirstName}
      subjects={subjects}
      lengths={[1, 1.5, 2]}
    />
  );
}

export default ParentBookOneToOneSheet;
