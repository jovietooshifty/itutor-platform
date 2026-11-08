// POST /api/webhooks/identity/didit
// Didit is the only identity provider. The signature (DIDIT_WEBHOOK_SECRET) is verified inside
// its provider module. Any other name in the path is a 404.

import { NextRequest, NextResponse } from 'next/server';
import { handleIdentityWebhook } from '@/lib/identity/webhook';
import { isProviderName } from '@/lib/identity/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  if (!isProviderName(params.provider)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return handleIdentityWebhook(params.provider, request);
}

export async function GET(_req: NextRequest, { params }: { params: { provider: string } }) {
  if (!isProviderName(params.provider)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ status: 'ok', service: `itutor-identity-webhook-${params.provider}` });
}
