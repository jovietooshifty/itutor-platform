// DELETE /api/student/payment-methods/[paymentMethodId] — remove a saved card.
// Ownership is checked against the student's own Stripe Customer. A card a
// subscription charges is moved off (to another usable card) before removal,
// or refused with 409 when it is the only one.

import { NextRequest, NextResponse } from 'next/server';
import { StudentAccessError, requireStudentContext } from '@/lib/server/studentAccess';
import { detachSavedCard } from '@/lib/payments/parentCards';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ paymentMethodId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { admin, studentId } = await requireStudentContext();
    const { paymentMethodId } = await params;
    if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const outcome = await detachSavedCard(admin, studentId, paymentMethodId);
    if (outcome === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (outcome === 'in_use') {
      return NextResponse.json(
        { error: 'in_use', message: 'This card pays for your subscription. Add another card before removing it.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StudentAccessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[DELETE /api/student/payment-methods/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
