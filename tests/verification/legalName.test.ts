// The teacher's name is the name on their ID: typed before the check, replaced by the ID's name when it
// passes, locked after approval, and the only name students and parents see.

import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any, auth: null as any }));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/middleware/adminAuth', () => ({ requireAdmin: async () => h.auth }));
vi.mock('@/lib/identity/registry', async (orig) => ({
  ...(await orig<typeof import('@/lib/identity/registry')>()),
  getProvider: () => ({ redact: async () => ({ ok: true }) }) as any,
}));
vi.mock('@/lib/verificationV2/server', async (orig) => ({
  ...(await orig<typeof import('@/lib/verificationV2/server')>()),
  guardV2: async () => ({ error: null, tutorId: '11111111-1111-1111-1111-111111111111', db: h.db, revoked: false, profileStatus: null }),
}));

import { POST as namePOST } from '@/app/api/tutor/verification-v2/name/route';
import { GET as stateGET } from '@/app/api/tutor/verification-v2/state/route';
import { POST as approvePOST } from '@/app/api/admin/verification-v2/[tutorId]/approve/route';
import { applyProviderOutcome } from '@/lib/identity/webhook';
import { documentNames, tidyName } from '@/lib/identity/legalName';
import { loadVerificationDetailsPage } from '@/lib/verificationV2/publicDetails';
import { validateLegalName } from '@/lib/verificationV2/validation';

const T = '11111111-1111-1111-1111-111111111111';
const ADMIN = { id: 'adm-1', role: 'admin', is_reviewer: false, full_name: 'Ada Admin', email: 'ada@itutor.test' };
const body = (b: unknown) => new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } });
const params = { params: { tutorId: T } };

function seed(v2: Record<string, any> | null = {}, profile: Record<string, any> = {}) {
  h.db = makeFakeDb({
    profiles: [{ id: T, role: 'tutor', full_name: 'zoe the tutor', display_name: 'Zozo', username: 'zozo77', email: 'z@example.test', tutor_verification_status: 'UNVERIFIED', ...profile }],
    tutor_verification_v2: v2 === null ? [] : [{ tutor_id: T, status: 'IN_PROGRESS', consent_at: null, identity_status: null, identity_attempts: 0, ...v2 }],
    tutor_credentials_v2: [],
    tutor_extras_v2: [],
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
  seed();
});
afterEach(() => {
  delete process.env.VERIFICATION_V2_ENABLED;
  vi.restoreAllMocks();
});

describe('name helpers', () => {
  it('turns an all-capitals document name into a proper name', () => {
    expect(tidyName('ZOE RAMDHANIE')).toBe('Zoe Ramdhanie');
    expect(tidyName("  o'neil   MC-DONALD ")).toBe("o'neil MC-DONALD");
    expect(tidyName("O'NEIL MC-DONALD")).toBe("O'Neil Mc-Donald");
  });
  it('splits a document name into first and last', () => {
    expect(documentNames({ documentFirstName: 'ANA MARIA', documentLastName: 'RAMDHANIE' })).toEqual({ first: 'Ana Maria', last: 'Ramdhanie' });
    expect(documentNames({ documentName: 'Zoe Ramdhanie Singh' })).toEqual({ first: 'Zoe', last: 'Ramdhanie Singh' });
    expect(documentNames({ documentName: 'Madonna' })).toBeNull();
  });
  it('accepts real names and refuses nicknames with symbols, numbers or nothing', () => {
    expect(validateLegalName({ firstName: 'Zoë', lastName: "O'Neil-Singh" }).ok).toBe(true);
    for (const bad of [{ firstName: '', lastName: 'R' }, { firstName: 'Zoe99', lastName: 'R' }, { firstName: 'Z', lastName: '@zozo' }, { firstName: 'Z'.repeat(61), lastName: 'R' }]) {
      expect(validateLegalName(bad).ok).toBe(false);
    }
  });
});

describe('the name step', () => {
  it('before the ID check the teacher types their legal name; it becomes the name everyone sees', async () => {
    const res = await namePOST(body({ firstName: 'Zoë', lastName: 'Ramdhanie' }));
    expect(res.status).toBe(200);
    expect(row()).toMatchObject({ legal_first_name: 'Zoë', legal_last_name: 'Ramdhanie', name_source: 'teacher' });
    expect(profile()).toMatchObject({ full_name: 'Zoë Ramdhanie', display_name: 'Zoë Ramdhanie' });
    const st = await (await stateGET()).json();
    expect(st.steps.name).toBe('done');
    expect(st.name).toMatchObject({ firstName: 'Zoë', lastName: 'Ramdhanie', canEdit: true });
  });

  it('a nickname is refused and nothing is saved', async () => {
    const res = await namePOST(body({ firstName: 'Zozo', lastName: '77' }));
    expect(res.status).toBe(400);
    expect(profile().display_name).toBe('Zozo');
  });

  it('can be corrected until the ID check starts, then it is locked', async () => {
    expect((await namePOST(body({ firstName: 'Zoe', lastName: 'Ramdhani' }))).status).toBe(200);
    expect((await namePOST(body({ firstName: 'Zoe', lastName: 'Ramdhanie' }))).status).toBe(200);
    row().identity_status = 'pending';
    const refused = await namePOST(body({ firstName: 'Someone', lastName: 'Else' }));
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe('name_locked');
    expect(row().legal_last_name).toBe('Ramdhanie');
    expect((await (await stateGET()).json()).name.canEdit).toBe(false);
  });

  it('a failed check frees the name again until the next check starts', async () => {
    row().identity_status = 'retryable_failure';
    expect((await namePOST(body({ firstName: 'Zoe', lastName: 'Ramdhanie' }))).status).toBe(200);
  });
});

describe('the ID check supplies the name', () => {
  const ev = { eventId: 'e1', sessionRef: 'sess-1', tutorId: T, ignore: false, outcome: null, livemode: false } as any;
  const passed = { outcome: { kind: 'verified' }, providerCode: null, documentName: 'ZOË RAMDHANIE', documentFirstName: 'ZOË', documentLastName: 'RAMDHANIE' } as any;

  beforeEach(() => {
    seed({ consent_at: 'x', identity_status: 'pending', identity_provider: 'didit', identity_provider_session_ref: 'sess-1', identity_attempts: 1, legal_first_name: 'Zoe', legal_last_name: 'Ramdhani', name_source: 'teacher' });
  });

  it('a passed check replaces what the teacher typed with the first and last name on the ID, on the profile too', async () => {
    expect(await applyProviderOutcome(h.db, 'didit', ev, passed)).toBe('applied');
    expect(row()).toMatchObject({ identity_status: 'verified', legal_first_name: 'Zoë', legal_last_name: 'Ramdhanie', name_source: 'id' });
    expect(profile()).toMatchObject({ full_name: 'Zoë Ramdhanie', display_name: 'Zoë Ramdhanie' });
    // the yes/no for the admin compares the ID with what the teacher had typed
    expect(typeof row().identity_name_match).toBe('boolean');
  });

  it('a failed check changes no name', async () => {
    await applyProviderOutcome(h.db, 'didit', ev, { outcome: { kind: 'retryable_failure', reason: 'document_unreadable' }, providerCode: 'x', documentName: 'ZOË RAMDHANIE', documentFirstName: 'ZOË', documentLastName: 'RAMDHANIE' } as any);
    expect(row()).toMatchObject({ legal_first_name: 'Zoe', legal_last_name: 'Ramdhani', name_source: 'teacher' });
    expect(profile().full_name).toBe('zoe the tutor');
  });

  it('after the ID the name step is done and cannot be edited', async () => {
    await applyProviderOutcome(h.db, 'didit', ev, passed);
    const st = await (await stateGET()).json();
    expect(st.steps.name).toBe('done');
    expect(st.name).toMatchObject({ source: 'id', canEdit: false });
  });
});

describe('approval locks the name; verified teachers are asked once', () => {
  it('approving locks the name for good', async () => {
    seed({ status: 'IN_REVIEW', consent_at: 'x', identity_status: 'verified', identity_attempts: 1, legal_first_name: 'Zoë', legal_last_name: 'Ramdhanie', name_source: 'id' });
    h.db.tables.tutor_credentials_v2.push({ id: 'c1', tutor_id: T, kind: 'OTHER', title: 'Award', proof_path: `${T}/a.png`, pending_approval: false, created_at: '1' });
    const res = await approvePOST(new NextRequest('http://localhost/x', { method: 'POST', body: '{}' }), params);
    expect(res.status).toBe(200);
    expect(row().name_locked_at).toBeTruthy();
    const refused = await namePOST(body({ firstName: 'Other', lastName: 'Person' }));
    expect(refused.status).toBe(409);
  });

  it('a teacher verified under the old system is asked once to confirm their name, then it locks', async () => {
    seed({ status: 'VERIFIED', source: 'legacy', identity_status: null, decided_at: '2025-03-04T10:00:00Z' }, { tutor_verification_status: 'VERIFIED', full_name: 'Zozo The Tutor' });
    const before = await (await stateGET()).json();
    expect(before.name).toMatchObject({ prompt: true, canEdit: true });
    expect((await namePOST(body({ firstName: 'Zoë', lastName: 'Ramdhanie' }))).status).toBe(200);
    expect(profile()).toMatchObject({ full_name: 'Zoë Ramdhanie', tutor_verification_status: 'VERIFIED' });
    expect(row()).toMatchObject({ status: 'VERIFIED', name_locked_at: expect.any(String) });
    const after = await (await stateGET()).json();
    expect(after.name).toMatchObject({ prompt: false, canEdit: false });
    expect((await namePOST(body({ firstName: 'Again', lastName: 'Changed' }))).status).toBe(409);
    // the badge was never touched
    expect(profile().tutor_verification_status).toBe('VERIFIED');
  });
});

describe('what students and parents see', () => {
  it('the Verified teacher page shows the legal name, the ID verified date and the qualifications, and nothing else', async () => {
    seed(
      { status: 'VERIFIED', consent_at: 'x', identity_status: 'verified', identity_verified_at: '2026-10-01T10:00:00Z', decided_at: '2026-10-05T10:00:00Z', legal_first_name: 'Zoë', legal_last_name: 'Ramdhanie', name_source: 'id' },
      { tutor_verification_status: 'VERIFIED', full_name: 'Zoë Ramdhanie', display_name: 'Zozo' }
    );
    h.db.tables.tutor_credentials_v2.push({ id: 'c1', tutor_id: T, kind: 'DEGREE', title: 'BSc Chemistry, UWI (2023)', proof_path: `${T}/a.png`, proof_filename: 'a.png', pending_approval: false, created_at: '1' });
    const page = await loadVerificationDetailsPage(h.db, T);
    expect(page).toMatchObject({ name: 'Zoë Ramdhanie', verifiedAt: '2026-10-01T10:00:00Z' });
    expect(page!.credentials.map((c) => c.title)).toEqual(['BSc Chemistry, UWI (2023)']);
    expect(JSON.stringify(page)).not.toMatch(/zozo|proof|png|selfie/i);
  });
});

describe('no unverifiable name fields are left for teachers', () => {
  const fs = require('fs') as typeof import('fs');
  const text = (f: string) => fs.readFileSync(f, 'utf8');

  it('the teacher settings page no longer saves a username or a display name', () => {
    const settings = text('app/tutor/settings/page.tsx');
    expect(settings).not.toMatch(/label="Username/);
    expect(settings).not.toMatch(/label="Display name"/);
    expect(settings).not.toMatch(/username: username\.trim\(\)/);
    expect(settings).not.toMatch(/display_name: displayName/);
  });

  it('the get-listed page and the business profile panel no longer let a teacher type their name', () => {
    expect(text('app/tutor/get-listed/page.tsx')).not.toMatch(/placeholder="e\.g\. Kelon Rashad"/);
    expect(text('components/tutor/business/EditableProfilePanel.tsx')).not.toMatch(/display_name: nameInput/);
  });
});

describe('the step bar', () => {
  it('shows "Step X of N", a filled bar, and one tappable button per step with its state', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StepBar } = await import('@/components/tutor/verificationV2/ui');
    const out = renderToStaticMarkup(
      createElement(StepBar, {
        current: 1,
        onSelect: () => {},
        steps: [
          { key: 'name', label: 'Name', state: 'done' },
          { key: 'identity', label: 'ID', state: 'in_progress' },
          { key: 'credentials', label: 'Credentials', state: 'not_started' },
          { key: 'review', label: 'Review', state: 'needs_changes' },
        ],
      })
    );
    expect(out).toContain('Step 2 of 4');
    expect(out).toContain('width:50%');
    expect((out.match(/<button/g) ?? []).length).toBe(4);
    expect(out).toContain('aria-current="step"');
    for (const label of ['Done', 'In progress', 'Not started', 'Needs changes']) expect(out).toContain(label);
  });
});
