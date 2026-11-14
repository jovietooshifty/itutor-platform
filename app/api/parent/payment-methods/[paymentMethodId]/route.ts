// DELETE /api/parent/payment-methods/[paymentMethodId] — remove a saved card.
//
// The id in the URL is only a pointer: detachParentCard checks the card is on
// the signed-in parent's own Stripe Customer before touching it, and refuses
// (409) a card a live subscription would charge next.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { detachParentCard } from '@/lib/payments/parentCards';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ paymentMethodId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { paymentMethodId } = await params;
    if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const outcome = await detachParentCard(admin, parentProfile.id, paymentMethodId);
    if (outcome === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (outcome === 'in_use') {
      return NextResponse.json(
        { error: 'in_use', message: 'This card pays for a class. Add another card before removing it.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[DELETE /api/parent/payment-methods/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
