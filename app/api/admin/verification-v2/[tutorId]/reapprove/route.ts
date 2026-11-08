// POST /api/admin/verification-v2/[tutorId]/reapprove
// Restores a revoked teacher to Verified. Admin role only (here, in the transition map and in the
// database). Nothing the teacher submitted was removed by the revoke, so nothing has to be redone.

import { NextRequest, NextResponse } from 'next/server';
import { reapproveV2 } from '@/lib/verificationV2/review';
import { guardAdminV2, reviewErrorResponse } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: { tutorId: string } }) {
  const g = await guardAdminV2({ decide: true, adminOnly: true });
  if (g.error) return g.error;
  const result = await reapproveV2({ actor: g.actor, actorId: g.actorId, db: g.db }, params.tutorId);
  if (!result.ok) return reviewErrorResponse(result);
  return NextResponse.json({ ok: true, status: result.to, profile: result.profile });
}
