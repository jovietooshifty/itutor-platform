// A teacher whose verification was revoked sees the reason, can apply again, keeps what they sent, and is
// verified again only when an admin approves. Extras are gone: only the ID and credentials remain.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any, auth: null as any, profileStatus: 'REVOKED' as string }));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/middleware/adminAuth', () => ({ requireAdmin: async () => h.auth }));
vi.mock('@/lib/identity/registry', async (orig) => ({
  ...(await orig<typeof import('@/lib/identity/registry')>()),
  getProvider: () => ({ redact: async () => ({ ok: true }) }) as any,
}));
vi.mock('@/lib/verificationV2/server', async (orig) => ({
  ...(await orig<typeof import('@/lib/verificationV2/server')>()),
  guardV2: async () => ({
    error: null,
    tutorId: '11111111-1111-1111-1111-111111111111',
    db: h.db,
    revoked: h.db.tables.profiles[0].tutor_verification_status === 'REVOKED',
    profileStatus: h.db.tables.profiles[0].tutor_verification_status,
  }),
}));

import { POST as reapplyPOST } from '@/app/api/tutor/verification-v2/reapply/route';
import { POST as submitPOST } from '@/app/api/tutor/verification-v2/submit/route';
import { GET as stateGET } from '@/app/api/tutor/verification-v2/state/route';
import { POST as approvePOST } from '@/app/api/admin/verification-v2/[tutorId]/approve/route';
import { checkTransition } from '@/lib/verification/transitions';

const T = '11111111-1111-1111-1111-111111111111';
const ADMIN = { id: 'adm-1', role: 'admin', is_reviewer: false, full_name: 'Ada Admin', email: 'ada@itutor.test' };
const REASON = 'Credentials could not be confirmed';

function seed(profileStatus: string, v2: Record<string, any> | null) {
  h.db = makeFakeDb({
    profiles: [{ id: T, role: 'tutor', full_name: 'Zoë Ramdhanie', display_name: 'Zoë Ramdhanie', email: 'z@example.test', tutor_verification_status: profileStatus }],
    tutor_verification_v2: v2 === null ? [] : [{
      tutor_id: T, status: 'REVOKED', consent_at: 'x', identity_status: 'verified', identity_attempts: 1,
      legal_first_name: 'Zoë', legal_last_name: 'Ramdhanie', name_source: 'id', name_locked_at: 'x', decision_reason: REASON, ...v2,
    }],
    tutor_credentials_v2: [{ id: 'c1', tutor_id: T, kind: 'OTHER', title: 'Award', proof_path: `${T}/a.png`, pending_approval: false, created_at: '1' }],
    tutor_verification_v2_decisions: [],
    notifications: [],
    identity_webhook_events: [],
  });
}
const row = () => h.db.tables.tutor_verification_v2[0];
const profile = () => h.db.tables.profiles[0];

beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  h.auth = { error: null, user: { id: ADMIN.id }, profile: ADMIN };
  seed('REVOKED', {});
});
afterEach(() => {
  delete process.env.VERIFICATION_V2_ENABLED;
  vi.restoreAllMocks();
});

describe('a revoked teacher', () => {
  it('sees the reason and is offered another go', async () => {
    const st = await (await stateGET()).json();
    expect(st).toMatchObject({ status: 'REVOKED', decisionReason: REASON, editable: false });
  });

  it('can apply again: the reason stays, nothing they sent is lost, and the badge stays off', async () => {
    const res = await reapplyPOST();
    expect(res.status).toBe(200);
    expect(profile().tutor_verification_status).toBe('REVERIFICATION_REQUIRED');
    expect(row()).toMatchObject({ status: 'IN_PROGRESS', decision_reason: REASON, identity_status: 'verified', legal_last_name: 'Ramdhanie' });
    expect(h.db.tables.tutor_credentials_v2).toHaveLength(1);
    const st = await (await stateGET()).json();
    expect(st).toMatchObject({ status: 'REVERIFICATION_REQUIRED', decisionReason: REASON, editable: true });
    expect(st.steps.credentials).toBe('needs_changes');
  });

  it('sends it for a fresh review, and only an admin brings the badge back', async () => {
    await reapplyPOST();
    expect((await submitPOST()).status).toBe(200);
    expect(row().status).toBe('IN_REVIEW');
    expect(profile().tutor_verification_status).toBe('REVERIFICATION_REQUIRED');
    const approved = await approvePOST(new NextRequest('http://localhost/x', { method: 'POST', body: '{}' }), { params: { tutorId: T } });
    expect(approved.status).toBe(200);
    expect(profile().tutor_verification_status).toBe('VERIFIED');
    expect(row().status).toBe('VERIFIED');
  });

  it('cannot skip straight to "in review", and only the teacher can apply again', () => {
    expect(checkTransition('v2', 'REVOKED', 'IN_REVIEW', 'tutor').ok).toBe(false);
    expect(checkTransition('profile', 'REVOKED', 'PENDING', 'tutor').ok).toBe(false);
    expect(checkTransition('profile', 'REVOKED', 'REVERIFICATION_REQUIRED', 'tutor').ok).toBe(true);
    expect(checkTransition('v2', 'REVOKED', 'IN_PROGRESS', 'tutor').ok).toBe(true);
    expect(checkTransition('v2', 'REVOKED', 'IN_PROGRESS', 'reviewer').ok).toBe(false);
  });

  it('a teacher who is not revoked cannot use it', async () => {
    seed('VERIFIED', { status: 'VERIFIED' });
    const res = await reapplyPOST();
    expect(res.status).toBe(409);
    expect(profile().tutor_verification_status).toBe('VERIFIED');
  });

  it('pressing the button twice does no harm', async () => {
    await reapplyPOST();
    expect((await reapplyPOST()).status).toBe(409);
    expect(row().status).toBe('IN_PROGRESS');
  });
});

describe('extras are gone', () => {
  const fs = require('fs') as typeof import('fs');
  it('there is no extras route and the state has no extras or details step', async () => {
    expect(fs.existsSync('app/api/tutor/verification-v2/extras')).toBe(false);
    const st = await (await stateGET()).json();
    expect(st).not.toHaveProperty('extras');
    expect(st.steps).not.toHaveProperty('details');
  });
});
