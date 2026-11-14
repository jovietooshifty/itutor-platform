'use client';

/**
 * "Secure your spot", explained — the new-UI card shown wherever a class that
 * has not started yet is sold as a held, one-time charge: the student class
 * page, the parent class page, and the confirm sheets on both.
 *
 * It states the four things the old (i) explainer did (SecureSpotExplainer in
 * ClassDetailView), because a disputed charge turns on them: what is paid now,
 * when the class starts, that iTutor holds the money until the first month is
 * taught (refunded automatically if the tutor cancels first), and what happens
 * after — asked whether to continue, or nothing more for a short class.
 *
 * The amount is the checkout's: secure-spot checkout grosses up price_monthly
 * (lib/payments/secureSpotCheckout), the same as monthlyCharge() here.
 *
 * PROVISIONAL: no frame draws this card. Built from Card/SummaryRow tokens.
 */

import { ShieldCheck } from '@phosphor-icons/react';
import { SummaryRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatAstDate, money, monthlyCharge } from '@/components/parent/v2/ParentClassDetailV2';

export interface SecureSpotTermsV2Props {
  preorder: { firstSession: Date; releaseDate: string; shortClass: boolean };
  /** groups.price_monthly — the price secure-spot checkout charges. */
  priceMonthly: number | null | undefined;
  /** Who is reading. The copy is true for both today; kept so a role-specific
   *  line can be added without touching every caller. */
  audience: 'student' | 'parent';
  /** Drop the heading and the refund line (inside a sheet that already says them). */
  compact?: boolean;
  className?: string;
}

const TZ = 'America/Port_of_Spain';

export function secureSpotDates(preorder: SecureSpotTermsV2Props['preorder']) {
  const start = `${formatAstDate(preorder.firstSession, { weekday: 'short', day: 'numeric', month: 'short' })} · ${preorder.firstSession.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}`;
  const until = new Date(`${preorder.releaseDate}T12:00:00-04:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TZ,
  });
  return { start, until };
}

export function SecureSpotTermsV2({ preorder, priceMonthly, compact = false, className }: SecureSpotTermsV2Props) {
  const charge = monthlyCharge(priceMonthly);
  const { start, until } = secureSpotDates(preorder);

  return (
    <section
      className={cn('flex flex-col gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card', className)}
      aria-label="How securing a spot works"
    >
      {!compact ? (
        <div className="flex items-center gap-ds-3">
          <span aria-hidden className="flex size-[34px] flex-none items-center justify-center rounded-ds-sm bg-brand text-ink">
            <ShieldCheck size={18} weight="bold" />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.99px] text-brand-edge">Secure your spot</p>
            <p className="m-0 text-[16px] font-extrabold leading-5 text-ink">
              {charge ? 'Pay for the first month now, hold the place' : 'Reserve a place before the class starts'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col">
        <SummaryRow
          label="Pay today"
          value={charge ? `${money(charge.total)} once` : 'Free'}
        />
        {charge ? (
          <p className="m-0 -mt-[3px] pb-[3px] text-right text-[12px] text-ink-muted">
            {money(charge.base)} {preorder.shortClass ? 'whole class' : 'first month'} + {money(charge.fee)} card processing
          </p>
        ) : null}
        <SummaryRow label="Classes start" value={start} />
        <SummaryRow
          label={preorder.shortClass ? 'Class ends' : 'First month runs until'}
          value={until}
        />
        <SummaryRow
          label="After that"
          value={preorder.shortClass ? 'Nothing more to pay' : 'You choose whether to continue'}
        />
      </div>

      <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
        {charge ? 'A one-time payment, not a subscription. ' : ''}
        {charge
          ? `iTutor holds it until the ${preorder.shortClass ? 'class' : 'first month'} has been taught${!compact ? ', and refunds it automatically if the tutor cancels before the class starts' : ''}.`
          : 'Nothing is charged to hold the place.'}
        {preorder.shortClass
          ? ''
          : ' Nothing renews by itself: before the first month ends, you choose whether to continue monthly.'}
      </p>
    </section>
  );
}

export default SecureSpotTermsV2;
