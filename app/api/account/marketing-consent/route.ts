// GET/PATCH /api/account/marketing-consent — the caller's own "Tips & offers"
// switch (Figma 2:2219, student Settings › Notifications).
//
// This is the ONLY notification switch on that screen with a real backend.
// The old student settings page wrote `profiles.notification_preferences`,
// a column that exists nowhere (see migration 257's header), so every one of
// its four toggles failed with "Failed to save notification preferences".
//
// marketing_consent (migration 257) is what Customer.io reads for
// unsubscribed / marketing_opt_in. Writing it through the service client,
// scoped to the session user, keeps the audit columns honest: an answer
// given here is recorded as source 'settings', distinct from the signup tick
// and from the column-default backfill.
//
// If the column is missing (an environment without 257) GET answers
// { marketing: null } and the screen hides the switch rather than offering
// one that cannot save.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function caller() {
  const server = await getServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  return user;
}

export async function GET() {
  try {
    const user = await caller();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data, error } = await getServiceClient()
      .from('profiles')
      .select('marketing_consent')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ marketing: null });
    const v = (data as { marketing_consent?: boolean | null } | null)?.marketing_consent;
    return NextResponse.json({ marketing: typeof v === 'boolean' ? v : null });
  } catch (err) {
    console.error('[GET /api/account/marketing-consent]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await caller();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { marketing?: unknown } | null;
    if (typeof body?.marketing !== 'boolean') {
      return NextResponse.json({ error: 'marketing must be true or false' }, { status: 400 });
    }
    const { error } = await getServiceClient()
      .from('profiles')
      .update({
        marketing_consent: body.marketing,
        marketing_consent_at: new Date().toISOString(),
        marketing_consent_source: 'settings',
      })
      .eq('id', user.id);
    if (error) {
      console.error('[PATCH /api/account/marketing-consent]', error);
      return NextResponse.json({ error: 'Could not save' }, { status: 500 });
    }
    return NextResponse.json({ marketing: body.marketing });
  } catch (err) {
    console.error('[PATCH /api/account/marketing-consent]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
