'use client';

/**
 * Add a card — frame `160:8220`. Settings › Payment methods › Add a card.
 *
 * REAL: a Stripe SetupIntent for the signed-in parent's own Customer
 * (POST /api/parent/payment-methods/setup-intent), confirmed in the browser
 * with Stripe Elements. Card details go straight to Stripe and never reach
 * our server. Saving charges nothing and retries nothing, as the frame says.
 *
 * Deviations from the frame:
 * - The four drawn fields (card number, name on card, expiry, CVV) are
 *   Stripe's Payment Element instead of our own inputs. Raw card inputs
 *   would put card numbers in our page and our PCI scope; the Element is the
 *   same one checkout uses. It does not ask for the name on the card.
 * - Back link reads "Payment methods" with "Add a card" as the page title.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Info } from '@phosphor-icons/react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getStripe } from '@/components/booking/StripePaymentForm';
import { Button } from '@/components/ui';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { FormError } from './accountKit';

function Note() {
  return (
    <div className="flex items-start gap-ds-3">
      <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] bg-brand text-ink">
        <Info size={14} weight="bold" aria-hidden />
      </span>
      <p className="font-body text-[13px] leading-[19px] text-ink-muted">
        Saving a card does not charge anything or retry a failed payment.
      </p>
    </div>
  );
}

function AddCardForm() {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/parent/settings/payment-methods` },
    });
    if (err) {
      setBusy(false);
      setError(err.message ?? 'The card could not be saved. Check the details and try again.');
      return;
    }
    router.replace('/parent/settings/payment-methods');
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-ds-4">
      <div className="rounded-ds-card bw-hair border-ink bg-surface-card p-ds-card">
        <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }} />
      </div>
      <Note />
      {error ? <FormError>{error}</FormError> : null}
      <Button type="submit" size="lg" block="always" disabled={!stripe || busy}>
        {busy ? 'Saving…' : 'Save card'}
      </Button>
    </form>
  );
}

export default function ParentAddCardV2() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const stripePromise = getStripe();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/parent/payment-methods/setup-intent', { method: 'POST' });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setClientSecret(json.clientSecret ?? null);
        if (!json.clientSecret && !cancelled) setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DetailScreen backLabel="Payment methods" fallbackHref="/parent/settings/payment-methods" title="Add a card">
      {failed || !stripePromise ? (
        <EmptyCard title="Cards cannot be added right now" body="Nothing has been saved or charged. Try again in a moment." />
      ) : !clientSecret ? (
        <DetailSkeleton rows={2} />
      ) : (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: { colorPrimary: '#0d2318', colorText: '#0d2318', borderRadius: '10px' },
            },
          }}
        >
          <AddCardForm />
        </Elements>
      )}
    </DetailScreen>
  );
}
