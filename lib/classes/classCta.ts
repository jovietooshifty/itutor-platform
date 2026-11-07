/**
 * What a class page's one action says and does, for a STUDENT viewer.
 *
 * Lifted verbatim from ClassDetailView's `Detail` (ctaLabel / ctaCaption /
 * ctaDisabled / isFull) so the new student class page (Figma 2:922) cannot
 * drift from the old one while both exist. The ORDER is the rule: settled facts
 * about this student first (enrolled, in the tutor's queue, mid-payment), then
 * fullness, then the parent's gate, then the price-shaped labels the gate
 * replaces. See the long comment above ctaLabel in ClassDetailView for why.
 *
 * `now` is null until the page has mounted: reading the clock during render
 * would differ between server and client. Until then the server's own
 * `paymentPending` answer stands.
 */

import { preorderFor, type GroupData, type ParentGate } from '@/components/classes/ClassDetailView';
import { fmtTTD } from '@/lib/utils/formatCurrency';

export type ClassCtaKind =
  | 'open'
  | 'pending'
  | 'complete-payment'
  | 'waitlist'
  | 'awaiting-parent'
  | 'ask-parent'
  | 'secure-spot'
  | 'request'
  | 'join';

export interface ClassCta {
  kind: ClassCtaKind;
  label: string;
  caption: string;
  disabled: boolean;
  isFull: boolean;
  spotsLeft: number;
  price: number;
}

export function classCta(group: GroupData, parentGate: ParentGate | null, now: number | null): ClassCta {
  const isPending = group.memberStatus === 'pending';
  const spotsLeft = Math.max(0, group.max_students - group.member_count);
  const offeredSeats = (group.seat_availability ?? []).filter((s) => !s.unavailable);
  const isFull = offeredSeats.length > 0 ? offeredSeats.every((s) => s.full) : spotsLeft <= 0;
  const price = group.price_monthly ?? group.price_per_session ?? 0;
  const preorder = preorderFor(group);

  const holdExpiresAt = group.paymentPendingExpiresAt ?? null;
  const holdMsLeft = holdExpiresAt && now !== null ? new Date(holdExpiresAt).getTime() - now : null;
  const paymentPending = group.paymentPending && (holdMsLeft === null || holdMsLeft > 0);
  const holdMinutesLeft = holdMsLeft !== null && holdMsLeft > 0 ? Math.ceil(holdMsLeft / 60_000) : null;

  const gated = Boolean(parentGate?.needsParentApproval);
  const awaitingParent = gated && Boolean(parentGate?.pending);
  const parentLabel = parentGate?.parentName ?? 'your parent';

  const [kind, label]: [ClassCtaKind, string] = group.enrolled
    ? ['open', 'Open class']
    : isPending
      ? ['pending', 'Request pending']
      : paymentPending
        ? ['complete-payment', 'Complete payment']
        : isFull
          ? ['waitlist', 'Join waitlist']
          : awaitingParent
            ? ['awaiting-parent', 'Waiting on your parent']
            : gated
              ? ['ask-parent', 'Ask parent to enrol']
              : preorder
                ? ['secure-spot', 'Secure your spot']
                : group.require_join_requests
                  ? ['request', 'Request to join']
                  : ['join', 'Join class'];

  const caption = group.enrolled
    ? "You're enrolled"
    : isPending
      ? 'Awaiting tutor approval'
      : paymentPending
        ? holdMinutesLeft !== null
          ? `Your seat is held for ${holdMinutesLeft} more minute${holdMinutesLeft === 1 ? '' : 's'}`
          : holdExpiresAt
            ? 'Your seat is held until payment completes'
            : 'Your place is held until you pay your tutor'
        : isFull
          ? 'Class full · join the waitlist'
          : awaitingParent
            ? `${parentLabel} has been asked · no place is being held`
            : gated
              ? `${parentLabel} approves this · you will not be asked to pay`
              : preorder
                ? `${price > 0 ? `${fmtTTD(price)} today, covering your first month` : 'Free to reserve'} · Classes start ${preorder.firstSession.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
                : group.require_join_requests
                  ? 'Tutor approval required'
                  : 'Join instantly · cancel anytime';

  return {
    kind,
    label,
    caption,
    disabled: isPending || awaitingParent,
    isFull,
    spotsLeft,
    price,
  };
}
