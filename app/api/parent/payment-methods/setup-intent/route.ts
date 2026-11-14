// POST /api/parent/payment-methods/setup-intent — start "Add a card".
//
// Returns a SetupIntent client secret for the signed-in parent's own Stripe
// Customer (created on first use, exactly as checkout would). The card is
// entered in Stripe Elements and confirmed browser-side; it never touches this
// server. A SetupIntent charges nothing and retries nothing — it only saves the
// card for later, which is what the frame's note promises.
//
// It does NOT become the default for existing subscriptions: each subscription
// keeps the card it was started with until a fix-payment flow changes it.

import { NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { ensureStripeCustomer } from '@/lib/payments/stripeSubscriptions';
import { getStripeClient } from '@/lib/payments/stripeClient';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const customerId = await ensureStripeCustomer(admin as any, parentProfile.id);
    const intent = await getStripeClient().setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { parent_id: parentProfile.id, source: 'parent_settings_add_card' },
    });
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/payment-methods/setup-intent]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
