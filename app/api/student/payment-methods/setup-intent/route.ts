// POST /api/student/payment-methods/setup-intent — start "Add a card" for the
// signed-in student. Same as the parent route: a SetupIntent on the student's
// own Customer (created on first use, as checkout would). Charges nothing.

import { NextResponse } from 'next/server';
import { StudentAccessError, requireStudentContext } from '@/lib/server/studentAccess';
import { ensureStripeCustomer } from '@/lib/payments/stripeSubscriptions';
import { getStripeClient } from '@/lib/payments/stripeClient';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { admin, studentId } = await requireStudentContext();
    const customerId = await ensureStripeCustomer(admin as any, studentId);
    const intent = await getStripeClient().setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { student_id: studentId, source: 'student_settings_add_card' },
    });
    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (err) {
    if (err instanceof StudentAccessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[POST /api/student/payment-methods/setup-intent]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
