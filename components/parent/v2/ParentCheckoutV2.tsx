'use client';

/**
 * The checkout on the new UI — parent (ParentCheckoutV2, in DetailScreen) and,
 * through CheckoutV2Body, the student (StudentCheckoutV2). Figma "Checkout – Maths"
 * `160:6464`, with the card form from "Pay by card – Stripe payment form"
 * `198:1837` and the declined note from `160:6322`.
 *
 * PRESENTATION ONLY. app/payments/checkout/page.tsx still loads the summary,
 * owns the PaymentIntent / clientSecret, and decides where success goes; this
 * draws it. StripePaymentForm keeps every line of the confirm-then-wait-for-
 * the-webhook logic and is only asked for its 'ds' skin.
 *
 * DEVIATIONS FROM THE FRAMES:
 * - The saved-card row ("Visa ending 3456 · Change") is not drawn. Nothing in
 *   the payment flow stores or lists a card: every checkout is a fresh
 *   PaymentIntent with no customer payment methods attached, so the Stripe
 *   form (198:1837) is what a parent always gets.
 * - "Pay today" carries a second line naming the class price and the card
 *   processing fee, so the total is never a surprise against the class page.
 * - No tutor rating. The old checkout showed "★ 5.0 (0 reviews)" twice, from
 *   a field the reviews API never returns; the frame has no rating either.
 * - Wide screens: one reading column. PROVISIONAL, no wide frame.
 */

import Link from 'next/link';
import { Lock } from '@phosphor-icons/react';
import { SubjectTile, SummaryRow } from '@/components/ui';
import StripePaymentForm from '@/components/booking/StripePaymentForm';
import { DetailScreen } from './DetailScreen';
import { subjectCode, subjectColor } from './subjectTile';
import { formatAstDate, money } from './ParentClassDetailV2';

export type CheckoutSummary = {
  clientSecret: string;
  statusId: string;
  amount: number;
  /** Part of `amount` paid with iTutor credits. */
  creditsApplied?: number;
  /** A credit month: one month, never renews. */
  oneMonth?: boolean;
  processingFee: number;
  total: number;
  currency: string;
  durationMinutes: number;
  startAt: string | null;
  tutor: { id: string; name: string; avatarUrl: string | null };
  subject: string;
  /** Where to send the payer once the webhook confirms. */
  successHref: string;
  /** Monthly group subscription rather than a single session. */
  isSubscription?: boolean;
  endDate?: string | null;
  /** Paying up front to hold a seat in a class that hasn't started yet. */
  isSecureSpot?: boolean;
  /** When the held first month is delivered — end of what this payment buys. */
  releaseDate?: string | null;
  /** Class finishes inside the first month: one-time purchase, nothing after. */
  shortClass?: boolean;
  /** The class being bought — so checkout says WHAT, not only how much. */
  classProfile?: {
    name: string;
    coverImage: string | null;
    subject: string | null;
    formLevel: string | null;
    description: string | null;
    maxStudents: number | null;
  } | null;
  /** Named when the payer is not the student (a parent buying for a child). */
  forStudent?: string | null;
  groupId?: string | null;
};

/** What the class page knows that the intent does not: its schedule and next class. */
export type CheckoutClassInfo = { schedule: string | null; nextClass: Date | null } | null;

const TZ = 'America/Port_of_Spain';
const day = (d: Date) => formatAstDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const dateOnly = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00-04:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  });

export interface CheckoutV2Props {
  summary: CheckoutSummary;
  classInfo: CheckoutClassInfo;
  classEndsSoon: boolean;
  returnUrl: string;
  onConfirmed: () => void;
}

/** The parent's checkout: the shared body inside the parent DetailScreen. */
export function ParentCheckoutV2(props: CheckoutV2Props) {
  const s = props.summary;
  const first = s.forStudent ? s.forStudent.split(' ')[0] : null;
  return (
    <DetailScreen centered backLabel={first ? (s.isSubscription || s.isSecureSpot ? `Enrol ${first}` : `Book for ${first}`) : 'Payment'} fallbackHref="/parent/classes">
      <CheckoutV2Body {...props} viewer="parent" />
    </DetailScreen>
  );
}

/**
 * The checkout blocks, without a shell — shared by the parent (above) and the
 * student (components/student/v2/StudentCheckoutV2). The blocks and the
 * payment form are identical for both; only who the copy addresses differs:
 *
 * - parent: "For Jovan Smith" under the class (unchanged from before).
 * - student paying for themself: no "For" line — it is theirs.
 * - student whose parent is the payer (`forStudent` set, viewer a student):
 *   the class is theirs, the charge is on the parent's account, so it says so.
 */
export function CheckoutV2Body({
  summary,
  classInfo,
  classEndsSoon,
  returnUrl,
  onConfirmed,
  viewer,
}: CheckoutV2Props & { viewer: 'parent' | 'student' }) {
  const s = summary;
  const first = s.forStudent ? s.forStudent.split(' ')[0] : null;
  const forLine =
    viewer === 'parent'
      ? first
        ? `For ${s.forStudent}`
        : null
      : s.forStudent
        ? 'Billed to your parent’s account · the place is yours'
        : null;
  const subject = s.classProfile?.subject || s.subject;
  const title = s.classProfile?.name || s.subject;
  const start = s.startAt ? new Date(s.startAt) : null;
  const firstClass = s.isSubscription ? classInfo?.nextClass ?? start : start;
  const credits = s.creditsApplied && s.creditsApplied > 0 ? s.creditsApplied : 0;

  const subtitle = [s.tutor?.name, classInfo?.schedule ?? (start && !s.isSubscription ? `${day(start)} · ${time(start)}` : null)]
    .filter(Boolean)
    .join(' · ');

  const what = s.isSecureSpot
    ? s.shortClass
      ? 'whole class'
      : 'first month'
    : s.isSubscription
      ? s.oneMonth
        ? 'one month'
        : 'class'
      : `${s.durationMinutes}-min lesson`;

  const billing = s.isSecureSpot
    ? `One-time · ${s.shortClass ? 'whole class' : 'first month'}`
    : s.isSubscription
      ? s.oneMonth
        ? `One month · ${money(s.total)}`
        : `Monthly · ${money(s.total)}`
      : `One lesson · ${s.durationMinutes} min`;

  // The subscription renews on the monthly anniversary of paying (Stripe's
  // billing anchor is the subscription's start), so "a month from today".
  const nextPayment = (() => {
    if (s.isSecureSpot) return s.shortClass ? 'None · this covers the whole class' : 'None until you choose to continue';
    if (!s.isSubscription) return null;
    if (s.oneMonth) return 'None · one month only';
    if (classEndsSoon && s.endDate) return `None · class ends ${dateOnly(s.endDate)}`;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return day(d);
  })();

  const cancelBy = start && !s.isSubscription && !s.isSecureSpot ? new Date(start.getTime() - 24 * 3600 * 1000) : null;
  const cancel = s.isSecureSpot
    ? 'Refunded if the tutor cancels first'
    : s.isSubscription
      ? s.oneMonth
        ? 'Nothing to cancel'
        : 'Any time, from Billing'
      : cancelBy
        ? `Free until ${day(cancelBy)} · ${time(cancelBy)}`
        : null;

  const terms = s.isSecureSpot
    ? `A one-time payment, not a subscription. iTutor holds it until the ${s.shortClass ? 'class' : 'first month'} has been taught, and refunds it automatically if the tutor cancels before it starts.`
    : s.isSubscription
      ? s.oneMonth || classEndsSoon
        ? `${money(s.total)} is charged once. Nothing is charged after that.`
        : `${money(s.total)} is charged today and then every month${s.endDate ? ' until the class ends' : ''}. Cancel any time from Billing and keep the month you paid for.`
      : 'Cancel or reschedule for free up to 24 hours before the lesson.';

  return (
    <>
      {/* The class */}
      <div className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
        <SubjectTile code={subjectCode(subject)} color={subjectColor(subject)} size={52} />
        <div className="flex min-w-0 flex-col gap-[2px]">
          <p className="text-[15px] font-extrabold leading-[18px] text-ink">{title}</p>
          {subtitle ? <p className="text-[13px] text-ink-muted">{subtitle}</p> : null}
          {forLine ? <p className="text-[13px] text-ink-muted">{forLine}</p> : null}
        </div>
      </div>

      {/* Pay today */}
      <div className="flex flex-col gap-ds-1h rounded-ds-card bw-hair border-ink bg-ink p-ds-card">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.99px] text-brand">Pay today</span>
        <span className="font-display text-[36px] font-extrabold leading-[36px] tabular-nums text-on-ink">{money(s.total)}</span>
        <span className="text-[13px] text-on-ink-muted">
          {money(s.amount)} {what}
          {credits ? ` − ${money(credits)} credits` : ''} + {money(s.processingFee)} card processing
        </span>
      </div>

      {/* The terms, as rows */}
      <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-[9px]">
        <SummaryRow label="Billing" value={billing} />
        {firstClass ? <SummaryRow label="First class" value={`${day(firstClass)} · ${time(firstClass)}`} /> : null}
        {s.isSecureSpot && s.releaseDate && !s.shortClass ? (
          <SummaryRow label="First month runs until" value={dateOnly(s.releaseDate)} />
        ) : null}
        {nextPayment ? <SummaryRow label="Next payment" value={nextPayment} /> : null}
        {cancel ? <SummaryRow label="Cancel" value={cancel} /> : null}
      </div>

      {/* Pay with card */}
      <section className="flex flex-col gap-ds-3">
        <h2 className="font-display text-[18px] font-extrabold text-ink">Pay with card</h2>
        <StripePaymentForm
          variant="ds"
          clientSecret={s.clientSecret}
          statusId={s.statusId}
          amount={s.amount}
          processingFee={s.processingFee}
          total={s.total}
          currency={s.currency}
          hideBreakdown
          submitLabel={`Pay ${money(s.total)}`}
          returnUrl={returnUrl}
          onConfirmed={onConfirmed}
          beforeSubmit={
            <p className="text-[13px] leading-[18px] text-ink-muted">
              By paying you agree to iTutor&apos;s{' '}
              <Link href="/terms" className="underline underline-offset-2">
                Terms &amp; Refund Policy
              </Link>
              . {terms}
            </p>
          }
        />
        <p className="flex items-center justify-center gap-ds-1h text-[12px] text-ink-muted">
          <Lock size={14} weight="bold" />
          Secure payment powered by Stripe ·{' '}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </section>
    </>
  );
}

export default ParentCheckoutV2;
