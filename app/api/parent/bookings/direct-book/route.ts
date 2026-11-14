// POST /api/parent/bookings/direct-book — a parent books a 1:1 for their child.
//
// Body: the student route's body plus `childId`. The parent must be linked to
// the child (requireParentChild, 404 otherwise). The lesson is the child's —
// every check (child schedule conflict, duplicate slot, tutor availability) and
// the booking's student_id are the child's — and the parent is the payer, on
// their own card, regardless of the child's billing_mode: a parent booking
// directly is the clearest possible approval.
//
// Same pay-first flow as the student: paid → a Stripe PaymentIntent with the
// booking in its metadata (student_id = child, payer_id = parent) and no
// booking row until the webhook sees payment; free → a CONFIRMED booking now.
// /api/payments/stripe/intent/[id] already lets the payer read the intent, so
// /payments/checkout?pi=… works for the parent unchanged.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentChild, requireParentContext } from '@/lib/server/parentAccess';
import { runDirectBook, type DirectBookBody } from '@/lib/bookings/directBook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { parentProfile } = await requireParentContext();
    const body = (await request.json().catch(() => null)) as (DirectBookBody & { childId?: string }) | null;
    if (!body?.childId) return NextResponse.json({ error: 'Choose which child this lesson is for' }, { status: 400 });
    const child = await requireParentChild(parentProfile.id, body.childId);
    if (!parentProfile.email) {
      return NextResponse.json({ error: 'Your account is missing an email address' }, { status: 400 });
    }
    const { childId: _drop, ...rest } = body;
    return runDirectBook(rest, {
      studentId: child.id,
      studentEmail: child.email ?? null,
      payer: { payerId: parentProfile.id, email: parentProfile.email, isProxy: true },
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/bookings/direct-book]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
