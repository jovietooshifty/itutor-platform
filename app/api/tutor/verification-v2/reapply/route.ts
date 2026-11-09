// POST /api/tutor/verification-v2/reapply
// A teacher whose verification was revoked starts again. Everything they submitted is kept (ID check,
// name, credentials); they fix what the reason says and send the application for a fresh review. The
// Verified badge stays off until an admin approves. Only a revoked teacher can use this.

import { NextResponse } from 'next/server';
import { schemaNotReady } from '@/lib/verificationV2/schemaReady';
import { setProfileStatus, setV2Status, statusErrorResponse } from '@/lib/verification/setStatus';
import { blocked, guardV2, loadRow } from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const g = await guardV2({ allowRevoked: true });
  if (g.error) return g.error;
  const { db, tutorId } = g;
  if (!g.revoked) return blocked('Only a teacher whose verification was removed can apply again', 409, { code: 'not_revoked' });

  try {
    const row = await loadRow(db, tutorId);
    if (row?.status === 'REVOKED') {
      // The reason the admin gave stays on the record, so the teacher still sees it.
      const reopened = await setV2Status({ tutorId, to: 'IN_PROGRESS', actor: 'tutor', reason: row.decision_reason, db });
      if (!reopened.ok) return statusErrorResponse(reopened);
    } else if (!row) {
      // Revoked without an application on file (an old record): open an empty one to work in.
      const { error } = await db.from('tutor_verification_v2').insert({ tutor_id: tutorId, status: 'IN_PROGRESS' });
      if (error) throw error;
    }
    // Profile last: if this step fails the teacher is still revoked and can simply press the button again.
    const moved = await setProfileStatus({ tutorId, to: 'REVERIFICATION_REQUIRED', actor: 'tutor', db });
    if (!moved.ok) return statusErrorResponse(moved);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const setup = schemaNotReady(err);
    if (setup) return setup;
    console.error('[verification-v2/reapply] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not start again' }, { status: 500 });
  }
}
