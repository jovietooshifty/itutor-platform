// GET /api/student/payment-methods — the signed-in student's saved cards
// (brand, last 4, expiry). The Stripe Customer is read from the student's own
// profile row; cards land there when the student pays for a group class,
// secures a spot or adds one in Settings.

import { NextResponse } from 'next/server';
import { StudentAccessError, requireStudentContext } from '@/lib/server/studentAccess';
import { listSavedCards } from '@/lib/payments/parentCards';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { admin, studentId } = await requireStudentContext();
    const cards = await listSavedCards(admin, studentId);
    return NextResponse.json({ cards });
  } catch (err) {
    if (err instanceof StudentAccessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[GET /api/student/payment-methods]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
