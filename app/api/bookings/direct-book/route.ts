// POST /api/bookings/direct-book — a student books a 1:1 for themselves.
// The logic lives in lib/bookings/directBook.ts, shared with the parent route.
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { runDirectBook, type DirectBookBody } from '@/lib/bookings/directBook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = await getServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: DirectBookBody;
  try {
    body = (await request.json()) as DirectBookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  return runDirectBook(body, { studentId: user.id, studentEmail: user.email ?? null });
}
