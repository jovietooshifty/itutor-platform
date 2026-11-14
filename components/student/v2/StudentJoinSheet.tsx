'use client';

/**
 * The student's join step on the new UI — a design-system Sheet in place of the
 * old <Modal><JoinFlow/></Modal> on /student/explore/[groupId].
 *
 * EVERY RULE AND EVERY CALL IS JoinFlow's (components/classes/ClassDetailView),
 * ported branch for branch and in the same order: the parent's ask
 * (/api/student/class-requests), secure your spot (/api/groups/:id/secure-spot),
 * cash hold, a credit month, the monthly subscribe, and the free/request join
 * (/members). The server re-checks all of it; this only decides what to send
 * and what to say. If JoinFlow changes, change this with it.
 *
 * Outcomes (enrolled / request sent / sent to your parent / place held for
 * cash) are drawn in the same sheet, as the old modal drew JoinedScreen.
 *
 * PROVISIONAL: drawn from design-system parts, not from the B1–B9 frames
 * (not read in this pass). The credits choice is the existing
 * CheckoutCreditsChoice, as the parent's sheet uses it.
 */

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Hourglass, ShieldCheck } from '@phosphor-icons/react';
import { Button, SubjectTile, SummaryRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Sheet } from '@/components/parent/v2/Sheet';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';
import { money, scheduleLine } from '@/components/parent/v2/ParentClassDetailV2';
import { SecureSpotTermsV2 } from '@/components/classes/SecureSpotTermsV2';
import { preorderFor, type GroupData, type ParentGate, type Step } from '@/components/classes/ClassDetailView';
import { usePhysicalClasses } from '@/lib/hooks/usePhysicalClasses';
import CheckoutCreditsChoice, { type CreditChoice } from '@/components/credits/CheckoutCreditsChoice';
import { invalidateCredits, useCredits } from '@/lib/credits/useCredits';

export interface StudentJoinSheetProps {
  group: GroupData;
  /** 'detail' = closed. Anything else is the sheet's content. */
  step: Step;
  onClose: () => void;
  /** Same contract as JoinFlow's onSuccess: the outcome step. */
  onSuccess: (step: Step) => void;
  profile: { id?: string | null } | null;
  parentGate: ParentGate | null;
}

export function StudentJoinSheet({ group, step, onClose, onSuccess, profile, parentGate }: StudentJoinSheetProps) {
  if (step === 'detail') return null;
  if (step === 'join') {
    return (
      <JoinSheetBody group={group} onClose={onClose} onSuccess={onSuccess} profile={profile} parentGate={parentGate} />
    );
  }
  return <OutcomeSheet group={group} kind={step} onClose={onClose} />;
}

/* ─── The class, one row ───────────────────────────────── */

function ClassRowCard({ group }: { group: GroupData }) {
  const subject = group.subject || group.name;
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const sub = [tutorName, scheduleLine(group)].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <SubjectTile code={subjectCode(subject)} color={subjectColor(subject)} size={52} />
      <div className="flex min-w-0 flex-col gap-[2px]">
        <p className="m-0 text-[15px] font-extrabold leading-[18px] text-ink">{group.name}</p>
        {sub ? <p className="m-0 text-[13px] text-ink-muted">{sub}</p> : null}
      </div>
    </div>
  );
}

/* ─── A radio row (seat / how to pay) ──────────────────── */

function ChoiceRow({
  selected,
  onSelect,
  title,
  detail,
  aside,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  aside?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'ds-press flex w-full items-start gap-ds-3 rounded-ds-card bg-surface-card p-ds-3 text-left cursor-pointer',
        selected ? 'bw-bold border-ink' : 'bw-hair border-border'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-[2px] flex size-5 flex-none items-center justify-center rounded-ds-full',
          selected ? 'bw-bold border-ink' : 'bw-hair border-border'
        )}
      >
        {selected ? <span className="size-[10px] rounded-ds-full bg-ink" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold leading-[19px] text-ink">{title}</span>
        <span className="mt-[2px] block text-[13px] leading-[18px] text-ink-muted">{detail}</span>
      </span>
      {aside ? <span className="flex-none text-[14px] font-extrabold tabular-nums text-ink">{aside}</span> : null}
    </button>
  );
}

function Lines({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-ds-2 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-ds-2 text-[13px] leading-[18px] text-ink-muted">
          <Check size={16} weight="bold" className="mt-[1px] flex-none text-brand-edge" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─── The join itself (JoinFlow) ───────────────────────── */

function JoinSheetBody({
  group,
  onClose,
  onSuccess,
  profile,
  parentGate,
}: Omit<StudentJoinSheetProps, 'step'>) {
  // ── Seats and payment method: JoinFlow's rules, unchanged ──
  const physicalClasses = usePhysicalClasses();
  const cashAvailable =
    physicalClasses && group.accepts_cash === true && group.class_format && group.class_format !== 'online';
  const [payMethod, setPayMethod] = useState<'card' | 'cash'>('card');

  const openSeats = (group.seat_availability ?? []).filter((s) => !s.unavailable && !s.full);
  const seatChoiceNeeded = openSeats.length > 1;
  const [chosenSeat, setChosenSeat] = useState<'online' | 'physical'>(
    openSeats.length === 1 ? openSeats[0].seat : 'online'
  );

  const offeredSeats = (group.seat_availability ?? []).filter((s) => !s.unavailable);
  const isFull =
    offeredSeats.length > 0 ? offeredSeats.every((s) => s.full) : group.max_students - group.member_count <= 0;
  const isRequest = group.require_join_requests;
  const price = group.price_monthly ?? group.price_per_session ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const effectivePrice = discountedPrice ?? price;
  // JoinFlow's parent-feedback add-on is switched off (hasFeedbackAddon =
  // false), so the total is the effective price and there is no decision to wait on.
  const totalPrice = effectivePrice;
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const preorder = preorderFor(group);
  const gated = Boolean(parentGate?.needsParentApproval) && !isFull;
  const parentLabel = parentGate?.parentName ?? 'your parent';
  const cashChosen = payMethod === 'cash' && price > 0 && !isFull;

  const [creditChoice, setCreditChoice] = useState<CreditChoice>('none');
  const { data: creditData } = useCredits('lite');
  const creditBalance = creditData?.wallet?.available ?? 0;
  const creditsOffered = price > 0 && !isFull && !gated && !cashChosen && !preorder;
  const usingCredits = creditsOffered ? creditChoice : 'none';

  const heading = isFull
    ? 'Join the waitlist'
    : gated
      ? `Ask ${parentLabel}`
      : preorder
        ? 'Secure your spot'
        : isRequest
          ? 'Request to join'
          : 'Confirm your enrolment';

  const confirmLabel = isFull
    ? 'Add me to the waitlist'
    : gated
      ? 'Ask parent to enrol'
      : preorder
        ? price > 0
          ? 'Continue to payment'
          : 'Reserve my place'
        : isRequest
          ? 'Send request to tutor'
          : payMethod === 'cash' && price > 0
            ? 'Hold my place'
            : usingCredits === 'one_month'
              ? 'Join for one month'
              : price > 0
                ? 'Continue to payment'
                : 'Confirm & join class';

  const handleConfirm = async () => {
    if (!profile?.id) return;
    setSubmitting(true);
    setErr('');
    try {
      if (gated) {
        const res = await fetch('/api/student/class-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: group.id }),
        });
        const data = await res.json();
        if (!res.ok && res.status !== 202) {
          throw new Error(data.error || 'Could not send the request. Please try again.');
        }
        onSuccess('awaiting-parent');
        return;
      }

      if (preorder && !isFull) {
        const res = await fetch(`/api/groups/${group.id}/secure-spot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.parent_approval_required) { onSuccess('awaiting-parent'); return; }
        if (!res.ok) throw new Error(data.error || 'Could not reserve your place. Please try again.');
        if (data.checkout_url) { window.location.href = data.checkout_url; return; }
        if (data.free) { onSuccess('joined'); return; }
        throw new Error('Could not start the payment. Please try again.');
      }

      if (payMethod === 'cash' && price > 0 && !isFull) {
        const res = await fetch(`/api/groups/${group.id}/cash-hold`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seatType: chosenSeat }),
        });
        const data = await res.json();
        if (data.parent_approval_required) { onSuccess('awaiting-parent'); return; }
        if (!res.ok) throw new Error(data.error || 'Could not hold your place. Please try again.');
        onSuccess('cash-held');
        return;
      }

      if (usingCredits === 'one_month') {
        const res = await fetch(`/api/groups/${group.id}/credit-month`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seatType: chosenSeat, useCreditsTtd: creditBalance }),
        });
        const data = await res.json();
        if (data.parent_approval_required) { onSuccess('awaiting-parent'); return; }
        if (!res.ok) throw new Error(data.error || 'Could not use your credits. Please try again.');
        invalidateCredits();
        if (data.checkout_url) { window.location.href = data.checkout_url; return; }
        if (data.completed) { onSuccess('joined'); return; }
        throw new Error('Could not start the purchase. Please try again.');
      }

      if (price > 0 && !isFull) {
        const res = await fetch(`/api/groups/${group.id}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seatType: chosenSeat }),
        });
        const data = await res.json();
        if (data.parent_approval_required) { onSuccess('awaiting-parent'); return; }
        if (data.checkout_url) { window.location.href = data.checkout_url; return; }
        if (data.waitlisted) { onSuccess('awaiting-approval'); return; }
        if (res.status === 503) throw new Error('Online payments are not available right now. Please contact the tutor directly.');
        if (!res.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Failed to process enrolment. Please try again.'));
      } else {
        const res = await fetch(`/api/groups/${group.id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to join');
        if (data.parent_approval_required) { onSuccess('awaiting-parent'); return; }
        const status = data.member?.status;
        if (status === 'pending_approval' || status === 'pending' || isRequest) {
          onSuccess('awaiting-approval');
        } else {
          onSuccess('joined');
        }
        return;
      }
      onSuccess('joined');
    } catch (e: any) {
      setErr(e?.message ?? 'Failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'your tutor';
  const per = group.price_monthly ? 'month' : 'session';

  return (
    <Sheet
      open
      onClose={onClose}
      title={heading}
      footer={
        <Button block size="lg" disabled={submitting} onClick={() => void handleConfirm()}>
          {submitting ? 'Working…' : confirmLabel}
        </Button>
      }
    >
      <ClassRowCard group={group} />

      {gated ? (
        <>
          <div className="flex items-start gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
            <span aria-hidden className="flex size-[34px] flex-none items-center justify-center rounded-ds-sm bg-brand text-ink">
              <ShieldCheck size={18} weight="bold" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-[15px] font-extrabold leading-[19px] text-ink">
                {parentGate?.pending ? `${parentLabel} already has this` : `${parentLabel} enrols you`}
              </p>
              <p className="m-0 mt-[2px] text-[13px] leading-[18px] text-ink-muted">
                {parentGate?.pending
                  ? `You have already asked to join this class. Asking again will not send a second request — it is still with ${parentLabel}.`
                  : `Your account is set so that ${parentLabel} approves the classes you join. We will send them this class and let you know what they say.`}
              </p>
            </div>
          </div>
          <Lines
            items={[
              `${parentLabel} gets an email with the class, the tutor and the price.`,
              ...(price > 0
                ? [
                    `You will not be asked to pay. ${
                      preorder
                        ? 'They pay when they enrol you, and iTutor holds it until the first month has been taught.'
                        : 'Paying is part of enrolling you, and that is theirs to do.'
                    }`,
                  ]
                : []),
              ...(isRequest ? ['The tutor also accepts who joins, so their yes goes on to the tutor.'] : []),
              'We will email you either way, as soon as they answer.',
            ]}
          />
          <div className="flex items-start gap-ds-3 rounded-ds-card bw-hair border-ink bg-accent-yellow p-ds-card">
            <Clock size={18} weight="bold" className="mt-[1px] flex-none text-ink" aria-hidden />
            <p className="m-0 text-[13px] leading-[18px] text-ink">
              <strong>No place is being held.</strong> You are not in this class yet, and someone else can take the
              last seat while {parentLabel} decides.
            </p>
          </div>
        </>
      ) : (
        <>
          {seatChoiceNeeded ? (
            <section className="flex flex-col gap-ds-2" role="radiogroup" aria-label="How will you attend?">
              <h3 className="m-0 text-[15px] font-extrabold text-ink">How will you attend?</h3>
              {openSeats.map((s) => {
                const seatPrice = s.priceTtd ?? effectivePrice;
                return (
                  <ChoiceRow
                    key={s.seat}
                    selected={chosenSeat === s.seat}
                    onSelect={() => setChosenSeat(s.seat)}
                    title={s.seat === 'physical' ? 'In person' : 'Online'}
                    detail={`${
                      s.seat === 'physical'
                        ? group.venue?.region
                          ? `At ${group.venue.name} · ${group.venue.region.name}`
                          : 'At the venue'
                        : 'Join from home'
                    }${s.remaining !== null ? ` · ${s.remaining} left` : ''}`}
                    aside={seatPrice > 0 ? money(seatPrice) : undefined}
                  />
                );
              })}
              {chosenSeat === 'physical' && group.venue?.address_hidden ? (
                <p className="m-0 text-[13px] text-ink-muted">You&apos;ll get the full address as soon as you join.</p>
              ) : null}
            </section>
          ) : null}

          {cashAvailable && price > 0 && !isFull ? (
            <section className="flex flex-col gap-ds-2" role="radiogroup" aria-label="How would you like to pay?">
              <h3 className="m-0 text-[15px] font-extrabold text-ink">How would you like to pay?</h3>
              <ChoiceRow
                selected={payMethod === 'card'}
                onSelect={() => setPayMethod('card')}
                title="Pay online now"
                detail="Card payment. Your place is confirmed straight away."
              />
              <ChoiceRow
                selected={payMethod === 'cash'}
                onSelect={() => setPayMethod('cash')}
                title="Pay your tutor directly"
                detail="We hold your place. Pay your tutor in person to confirm it."
              />
              {payMethod === 'cash' ? (
                <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
                  iTutor does not handle this payment — you pay {tutorName} directly, and they record it.
                </p>
              ) : null}
            </section>
          ) : null}

          {creditsOffered ? (
            <CheckoutCreditsChoice groupId={group.id} value={creditChoice} onChange={setCreditChoice} />
          ) : null}

          {preorder && !isFull ? (
            <SecureSpotTermsV2 preorder={preorder} priceMonthly={group.price_monthly} audience="student" compact />
          ) : (
            <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-[9px]">
              <SummaryRow
                label="Billing"
                value={
                  price <= 0
                    ? 'Free'
                    : usingCredits === 'one_month'
                      ? 'One month, paid with credits'
                      : group.price_monthly
                        ? 'Monthly'
                        : 'Per session'
                }
              />
              {price > 0 ? (
                <SummaryRow
                  label="Price"
                  value={
                    promo && discountedPrice !== null
                      ? `${money(discountedPrice)} /${per === 'month' ? 'mo' : 'session'} · ${promo.discount}% off`
                      : `${money(totalPrice)} /${per === 'month' ? 'mo' : 'session'}`
                  }
                />
              ) : null}
              {price > 0 && !isFull && payMethod === 'card' && usingCredits !== 'one_month' ? (
                <SummaryRow label="Card processing" value="Added at checkout" />
              ) : null}
            </div>
          )}

          <Lines
            items={[
              ...(preorder && !isFull
                ? [
                    'Your place is held for you from today.',
                    "If the tutor cancels the class before it starts, you're refunded automatically.",
                  ]
                : usingCredits === 'one_month'
                  ? ["This buys one month and does not renew. We'll remind you before it ends."]
                  : price > 0 && !isFull && payMethod === 'card'
                    ? [`You'll be charged ${money(totalPrice)}${group.price_monthly ? ' each month' : ' per session'}. Cancel any time from Billing.`]
                    : ['You can cancel any time from your account.']),
              ...(isRequest ? ['The tutor will review your request and respond within 48 hours.'] : []),
              ...(isFull ? ["You'll be notified the moment a seat opens — no obligation."] : []),
              "By joining you agree to iTutor's Terms of Service.",
            ]}
          />
        </>
      )}

      {err ? (
        <p role="alert" className="m-0 text-[13px] font-extrabold text-danger">
          {err}
        </p>
      ) : null}
    </Sheet>
  );
}

/* ─── Outcomes (JoinedScreen) ──────────────────────────── */

function OutcomeSheet({
  group,
  kind,
  onClose,
}: {
  group: GroupData;
  kind: Exclude<Step, 'detail' | 'join'>;
  onClose: () => void;
}) {
  const router = useRouter();
  const tutor = group.tutor?.display_name || group.tutor?.full_name;
  const copy = {
    joined: {
      done: true,
      title: "You're enrolled",
      body: "You've been added to the class. Your class page has the stream and upcoming sessions.",
      next: 'Go to my class',
      href: `/student/classes/${group.id}`,
    },
    'awaiting-approval': {
      done: false,
      title: 'Request sent',
      body: `${tutor || 'The tutor'} typically responds within 48 hours. You'll get a notification when they approve.`,
      next: 'Back to Explore',
      href: '/student/find-tutors',
    },
    'cash-held': {
      done: false,
      title: 'Your place is held',
      body: `Pay ${tutor || 'your tutor'} to confirm it. They will mark it as paid and your place becomes permanent.`,
      next: 'Go to my class',
      href: `/student/classes/${group.id}`,
    },
    'awaiting-parent': {
      done: false,
      title: 'Sent to your parent',
      body: 'Your parent has to approve this before you can join. They have been emailed, and you will hear as soon as they answer. Your place is not being held in the meantime.',
      next: 'Back to Explore',
      href: '/student/find-tutors',
    },
  }[kind];

  return (
    <Sheet
      open
      onClose={onClose}
      title={copy.title}
      footer={
        <Button block size="lg" onClick={() => router.push(copy.href)}>
          {copy.next}
        </Button>
      }
    >
      <div className="flex items-start gap-ds-3">
        <span
          aria-hidden
          className={cn(
            'flex size-[34px] flex-none items-center justify-center rounded-ds-sm text-ink',
            copy.done ? 'bg-brand' : 'bg-accent-yellow'
          )}
        >
          {copy.done ? <Check size={18} weight="bold" /> : <Hourglass size={18} weight="bold" />}
        </span>
        <p className="m-0 text-[14px] leading-[20px] text-ink">{copy.body}</p>
      </div>
      <ClassRowCard group={group} />
    </Sheet>
  );
}

export default StudentJoinSheet;
