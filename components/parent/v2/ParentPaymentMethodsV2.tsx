'use client';

/**
 * Payment methods — frame `160:8186`. Settings › Payment methods.
 *
 * REAL DATA: the parent's saved Stripe cards from
 * GET /api/parent/payment-methods (session user only; brand, last 4, expiry).
 * A parent who has never paid has no Stripe Customer, so the list is empty
 * and only "Add a card" shows.
 *
 * Deviations from the frame:
 * - Back link reads "Settings" with "Payment methods" as the page title
 *   (DetailScreen, like every other screen under Account). The frame puts the
 *   screen name beside the back arrow and has no title.
 * - The frame's one card is a DECLINED card (pink, "Declined Fri 23 Oct").
 *   Stripe does not mark a saved card as declined, so the alert tone is used
 *   for an EXPIRED card instead; the rest render as plain white cards. The
 *   last failure is on Billing, where it can be fixed.
 * - "Remove" is offered on every card except one a live subscription would
 *   charge next ("Pays for a class"), because detaching that card would make
 *   the next renewal fail. The server refuses it too (409).
 * - Remove asks for confirmation in a sheet (PROVISIONAL, no frame).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Plus } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { Sheet } from './Sheet';
import { FormError } from './accountKit';

type Card = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  expired: boolean;
  inUse: boolean;
};

const BRAND: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

const brandName = (b: string) => BRAND[b] ?? (b ? b[0].toUpperCase() + b.slice(1) : 'Card');
const expiry = (c: Card) => `${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`;

export default function ParentPaymentMethodsV2() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [removing, setRemoving] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/parent/payment-methods', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setCards(json.cards ?? []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/parent/payment-methods/${encodeURIComponent(removing.id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? 'Could not remove the card. Try again.');
        return;
      }
      setRemoving(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Payment methods">
      {status === 'loading' ? (
        <DetailSkeleton rows={1} />
      ) : status === 'error' ? (
        <EmptyCard
          title="We could not load your cards"
          body="Nothing has changed. Try again in a moment."
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          {cards.length === 0 ? (
            <p className="font-body text-[14px] text-ink-muted">
              No cards saved yet. A card you pay with at checkout is saved here too.
            </p>
          ) : (
            <ul className="flex flex-col gap-ds-3">
              {cards.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    'flex items-center gap-ds-3 rounded-ds-card bw-hair p-ds-card',
                    c.expired ? 'border-danger bg-danger-soft' : 'border-border bg-surface-card'
                  )}
                >
                  <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[5px] bg-ink text-brand">
                    <CreditCard size={16} weight="fill" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">
                      {brandName(c.brand)} ending {c.last4}
                    </span>
                    <span className={cn('font-body text-[13px]', c.expired ? 'text-danger' : 'text-ink-muted')}>
                      {c.expired ? `Expired ${expiry(c)}` : `Expires ${expiry(c)}`}
                      {c.inUse ? ' · Pays for a class' : ''}
                    </span>
                  </span>
                  {c.inUse ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setRemoving(c);
                      }}
                      className="shrink-0 rounded-ds-sm border-0 bg-danger px-ds-2 py-[3px] font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-on-ink cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Button variant="outline" size="lg" block="always" onClick={() => router.push('/parent/settings/payment-methods/add')}>
            <span className="flex items-center justify-center gap-ds-2">
              <Plus size={20} weight="bold" aria-hidden />
              Add a card
            </span>
          </Button>
        </>
      )}

      <Sheet
        open={!!removing}
        onClose={() => (busy ? undefined : setRemoving(null))}
        title={removing ? `Remove ${brandName(removing.brand)} ending ${removing.last4}?` : 'Remove card'}
        footer={
          <>
            <Button variant="danger" size="lg" block onClick={remove} disabled={busy}>
              {busy ? 'Removing…' : 'Remove card'}
            </Button>
            <Button variant="outline" size="lg" block onClick={() => setRemoving(null)} disabled={busy}>
              Keep card
            </Button>
          </>
        }
      >
        <p className="font-body text-[14px] text-ink">
          The card is taken off your account. Nothing is charged or refunded.
        </p>
        {error ? <FormError>{error}</FormError> : null}
      </Sheet>
    </DetailScreen>
  );
}
