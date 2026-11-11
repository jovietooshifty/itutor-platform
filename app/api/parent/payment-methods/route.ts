// GET /api/parent/payment-methods — the signed-in parent's saved cards.
//
// Session user only: the Stripe Customer is read from the parent's own
// profile row (lib/payments/parentCards.ts). Nothing here accepts an id from
// the client. Brand, last 4 and expiry only — never more of the card.

import { NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { listParentCards } from '@/lib/payments/parentCards';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const cards = await listParentCards(admin, parentProfile.id);
    return NextResponse.json({ cards });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/payment-methods]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
