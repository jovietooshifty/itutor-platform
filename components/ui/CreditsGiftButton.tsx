'use client';

/**
 * CreditsGiftButton — the permanent gift icon in the student and parent top
 * bars (Product Sprint, 21 Nov 2026, item 5).
 *
 * It replaces the old "credits pill", which only appeared once a programme
 * was switched on or the user already had credits. That hid "Refer friends to
 * earn credits" from exactly the people who had not found it yet, so the icon
 * now shows on every page that has a header, for everyone.
 *
 * With a spendable balance it becomes a pill with the amount (the old pill's
 * look, so nothing changes for people who already have credits). With nothing
 * to spend it is a plain round icon with no badge, so it never shows "TT$0".
 */

import { useRouter } from 'next/navigation';
import { Gift } from '@phosphor-icons/react';
import { fmtCredits, useCredits } from '@/lib/credits/useCredits';

/** "TT$100" for whole amounts; cents only when there are some. */
function pillAmount(n: number): string {
  return fmtCredits(n).replace(/\.00$/, '');
}

export function CreditsGiftButton({ href, enabled = true }: { href: string; enabled?: boolean }) {
  const router = useRouter();
  const credits = useCredits('lite', enabled);
  const balance = credits.data?.wallet?.available ?? 0;
  const go = () => router.push(href);

  if (balance > 0) {
    return (
      <button
        type="button"
        onClick={go}
        aria-label={`Rewards: ${pillAmount(balance)} in credits`}
        title="Rewards and referrals"
        className="ds-press mr-ds-1 inline-flex h-[34px] items-center gap-ds-1h rounded-ds-sm border-0 bg-ink px-ds-3 font-display text-[13px] font-extrabold tabular-nums text-accent-yellow cursor-pointer"
      >
        <Gift size={16} weight="bold" aria-hidden />
        {pillAmount(balance)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      aria-label="Rewards: refer friends to earn credits"
      title="Refer friends to earn credits"
      className="ds-press mr-ds-1 inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-0 bg-ink text-accent-yellow cursor-pointer"
    >
      <Gift size={18} weight="bold" aria-hidden />
    </button>
  );
}

export default CreditsGiftButton;
