'use client';

/**
 * The checkout, for a student on the new UI.
 *
 * Same blocks and the same payment form as the parent checkout (Figma
 * "Checkout – Maths" `160:6464`, drawn for parents) through CheckoutV2Body —
 * only the frame and the copy differ. PRESENTATION ONLY: the route
 * (app/payments/checkout) still owns the PaymentIntent, the clientSecret and
 * where success goes.
 *
 * /payments/checkout sits outside app/student, so the student layout never
 * wraps it: this draws StudentV2Shell itself, without the tab bar (a flow, as
 * on the parent side), in one centred 720 column.
 *
 * PROVISIONAL: the student file has no checkout frame. The title line
 * ("Book your lesson" / "Join the class" / "Secure your spot") replaces the
 * parent's "Enrol Jovan" back label, which is about someone else.
 */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CaretLeft } from '@phosphor-icons/react';
import StudentV2Shell from './StudentV2Shell';
import { CheckoutV2Body, type CheckoutV2Props } from '@/components/parent/v2/ParentCheckoutV2';

/** The student checkout's frame: shell, centred column, back link, optional title. */
export function StudentCheckoutFrame({
  fallbackHref,
  title,
  children,
}: {
  fallbackHref: string;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const back = () => {
    // A deep link (an email, a notification) has no history to go back to.
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };
  return (
    <StudentV2Shell width="wide" nav={false} title={title}>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-ds-4">
        <button
          type="button"
          onClick={back}
          className="ds-link inline-flex min-h-[44px] items-center gap-ds-1h self-start border-0 bg-transparent p-0 text-[15px] font-extrabold text-ink cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          <CaretLeft size={20} weight="bold" aria-hidden />
          Back
        </button>
        {title ? <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">{title}</h1> : null}
        {children}
      </div>
    </StudentV2Shell>
  );
}

export function studentCheckoutTitle(s: CheckoutV2Props['summary']): string {
  if (s.isSecureSpot) return 'Secure your spot';
  if (s.isSubscription) return s.oneMonth ? 'Join for one month' : 'Join the class';
  return 'Book your lesson';
}

export function StudentCheckoutV2(props: CheckoutV2Props) {
  const s = props.summary;
  return (
    <StudentCheckoutFrame
      title={studentCheckoutTitle(s)}
      fallbackHref={s.groupId ? `/student/explore/${s.groupId}` : '/student/find-tutors'}
    >
      <CheckoutV2Body {...props} viewer="student" />
    </StudentCheckoutFrame>
  );
}

export default StudentCheckoutV2;
