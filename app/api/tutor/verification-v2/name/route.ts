// POST /api/tutor/verification-v2/name   { firstName, lastName }
// The teacher's legal name. Typed here before the ID check; once the check has started the name comes
// from the ID and cannot be changed, and after an admin approves it is locked for good. Saving also sets
// the name everyone sees on the profile, so a teacher's public name is always first name + last name.

import { NextRequest, NextResponse } from 'next/server';
import { schemaNotReady } from '@/lib/verificationV2/schemaReady';
import { syncProfileName } from '@/lib/identity/legalName';
import { blocked, guardV2, isEditable, loadRow } from '@/lib/verificationV2/server';
import { validateLegalName } from '@/lib/verificationV2/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const g = await guardV2();
  if (g.error) return g.error;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return blocked('Invalid request', 400);
  }
  const check = validateLegalName(body);
  if (!check.ok) return blocked(check.error, 400);

  try {
    const row = await loadRow(g.db, g.tutorId);
    const idStarted = ['pending', 'processing', 'verified'].includes(row?.identity_status ?? '');
    if (row?.name_locked_at || idStarted) {
      return blocked('Your name comes from your ID check and cannot be changed.', 409, { code: 'name_locked' });
    }
    // Editable while the application is open. A teacher verified before names were checked may confirm theirs once.
    const verifiedFirstTime = row?.status === 'VERIFIED' && !row.name_confirmed_at;
    if (row && !isEditable(row) && !verifiedFirstTime) {
      return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });
    }

    const now = new Date().toISOString();
    const { error } = await g.db.from('tutor_verification_v2').upsert(
      {
        tutor_id: g.tutorId,
        legal_first_name: check.value.first,
        legal_last_name: check.value.last,
        name_source: 'teacher',
        name_confirmed_at: now,
        ...(verifiedFirstTime ? { name_locked_at: now } : {}),
      },
      { onConflict: 'tutor_id' }
    );
    if (error) throw error;
    await syncProfileName(g.db, g.tutorId, check.value.first, check.value.last);
    return NextResponse.json({ ok: true, firstName: check.value.first, lastName: check.value.last });
  } catch (err) {
    const setup = schemaNotReady(err);
    if (setup) return setup;
    console.error('[verification-v2/name] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not save your name' }, { status: 500 });
  }
}
