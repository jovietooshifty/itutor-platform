import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';
import { availableRoute, decideNextStep, routeFor } from '@/lib/identity/routing';
import { identityRouting } from '@/config/identityRouting';

// Didit is the only identity provider: one route, three attempts in total, then "contact support".

describe('the route', () => {
  it('is [didit] for every country, with no manual step and no second provider', () => {
    for (const c of [null, undefined, 'TT', 'GY', 'BB', 'OTHER']) expect(routeFor(c)).toEqual(['didit']);
    expect(identityRouting.fallbackChain).toEqual(['didit']);
    expect(identityRouting.maxTotalAttempts).toBe(3);
  });

  it('is empty when Didit is not configured', () => {
    expect(availableRoute(['didit'], () => false)).toEqual([]);
    expect(availableRoute(['didit'], () => true)).toEqual(['didit']);
  });
});

describe('decideNextStep', () => {
  const base = { route: ['didit'] as any, current: 'didit' as any, tried: ['didit'] as any };

  it('a verified teacher is done', () => {
    expect(decideNextStep({ ...base, status: 'verified', attempts: 1 })).toEqual({ action: 'done' });
  });

  it('no configured provider means no route', () => {
    expect(decideNextStep({ route: [], status: null, current: null, attempts: 0, tried: [] })).toEqual({ action: 'none', reason: 'no_route' });
  });

  it('a first start, then the same provider again after a failure, while attempts remain', () => {
    expect(decideNextStep({ route: ['didit'], status: null, current: null, attempts: 0, tried: [] })).toMatchObject({ action: 'start', provider: 'didit' });
    expect(decideNextStep({ ...base, status: 'retryable_failure', attempts: 1 })).toMatchObject({ action: 'retry_same' });
    expect(decideNextStep({ ...base, status: 'retryable_failure', attempts: 2 })).toMatchObject({ action: 'retry_same' });
  });

  it('after the third attempt there is nothing left: contact support', () => {
    expect(decideNextStep({ ...base, status: 'retryable_failure', attempts: 3 })).toEqual({ action: 'none', reason: 'attempt_limit' });
  });

  it('a check Didit cannot do (country, minor, document type) is not retried: contact support', () => {
    expect(decideNextStep({ ...base, status: 'not_supported', attempts: 1 })).toMatchObject({ action: 'none' });
  });

  it('a declined consent is final', () => {
    expect(decideNextStep({ ...base, status: 'consent_declined', attempts: 1 })).toEqual({ action: 'none', reason: 'consent_declined' });
  });
});

// ---------- startIdentityCheck with a fake Didit ----------
const h = vi.hoisted(() => ({ provider: null as any, configured: true }));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => { throw new Error('not used'); } }));
vi.mock('@/lib/identity/registry', async () => {
  const routing = await import('@/lib/identity/routing');
  return {
    getProvider: () => h.provider,
    routeForCountry: (country: string | null) => routing.availableRoute(routing.routeFor(country), () => h.configured),
  };
});

import { startIdentityCheck } from '@/lib/identity/start';

function fakeDidit(over: Record<string, any> = {}): any {
  const created: string[] = [];
  return {
    name: 'didit',
    created,
    isConfigured: () => true,
    webhookConfigured: () => true,
    createSession: vi.fn(async ({ attempt }: any) => {
      const ref = `didit_s${attempt}_${created.length + 1}`;
      created.push(ref);
      return { sessionRef: ref, url: `https://hosted.example/${ref}` };
    }),
    verifyWebhook: vi.fn(),
    getOutcome: vi.fn(async () => ({ outcome: { kind: 'pending' }, providerCode: null, resumeUrl: null })),
    redact: vi.fn(async () => ({ ok: true })),
    ...over,
  };
}

const T = 't1';
function seed(row: Record<string, any> = {}) {
  return makeFakeDb({
    tutor_verification_v2: [{
      tutor_id: T, status: 'IN_PROGRESS', consent_at: 'x', identity_status: null, identity_error_code: null, identity_attempts: 0,
      identity_provider: null, identity_provider_session_ref: null,
      identity_session_refs: [], identity_providers_tried: [], identity_country: null, ...row,
    }],
    profiles: [{ id: T, full_name: 'Test Teacher' }],
    notifications: [],
    identity_outcomes: [],
  });
}
const rowOf = (db: ReturnType<typeof seed>) => db.tables.tutor_verification_v2[0]!;
const start = (db: ReturnType<typeof seed>, country: string | null = 'TT') =>
  startIdentityCheck({ db: db as any, tutorId: T, row: rowOf(db) as any, country, returnUrl: 'http://localhost:3000/back' });

beforeEach(() => {
  h.configured = true;
  h.provider = fakeDidit();
});

describe('startIdentityCheck', () => {
  it('needs a document country, and only a listed one', async () => {
    const db = seed();
    expect(await start(db, null)).toMatchObject({ ok: false, code: 'country_required', httpStatus: 400 });
    expect(await start(db, 'ZZ')).toMatchObject({ ok: false, code: 'invalid_country', httpStatus: 400 });
    expect(h.provider.createSession).not.toHaveBeenCalled();
  });

  it('the first start creates a Didit session and records provider, reference, country and the attempt', async () => {
    const db = seed();
    const r = await start(db, 'GY');
    expect(r).toMatchObject({ ok: true, kind: 'redirect', provider: 'didit' });
    expect(rowOf(db)).toMatchObject({ identity_status: 'pending', identity_provider: 'didit', identity_attempts: 1, identity_country: 'GY', identity_providers_tried: ['didit'] });
    const ref = rowOf(db).identity_provider_session_ref;
    expect(ref).toMatch(/^didit_/);
    expect(rowOf(db).identity_session_refs).toEqual([{ provider: 'didit', ref }]);
  });

  it('a failed check can be tried again on Didit, and every session is kept so it can be redacted later', async () => {
    const db = seed({ identity_status: 'retryable_failure', identity_error_code: 'document_unreadable', identity_provider: 'didit',
      identity_provider_session_ref: 'didit_old', identity_attempts: 1, identity_providers_tried: ['didit'],
      identity_session_refs: [{ provider: 'didit', ref: 'didit_old' }], identity_country: 'TT' });
    const r = await start(db, null);
    expect(r).toMatchObject({ ok: true, kind: 'redirect', provider: 'didit' });
    expect(rowOf(db)).toMatchObject({ identity_status: 'pending', identity_attempts: 2 });
    expect(rowOf(db).identity_session_refs).toHaveLength(2);
  });

  it('the fourth attempt is refused: 3 in total, then contact support', async () => {
    const db = seed({ identity_status: 'retryable_failure', identity_error_code: 'abandoned', identity_provider: 'didit',
      identity_provider_session_ref: 'didit_3', identity_attempts: 3, identity_providers_tried: ['didit'], identity_country: 'TT' });
    const r = await start(db, null);
    expect(r).toMatchObject({ ok: false, httpStatus: 409, extra: { support: true } });
    expect(h.provider.createSession).not.toHaveBeenCalled();
  });

  it('a check Didit cannot do ends at contact support with no second provider offered', async () => {
    const db = seed({ identity_status: 'not_supported', identity_error_code: 'country', identity_provider: 'didit',
      identity_provider_session_ref: 'didit_1', identity_attempts: 1, identity_providers_tried: ['didit'], identity_country: 'GY' });
    expect(await start(db, null)).toMatchObject({ ok: false, extra: { support: true } });
    expect(h.provider.createSession).not.toHaveBeenCalled();
  });

  it('a declined consent is final', async () => {
    const db = seed({ identity_status: 'consent_declined', identity_provider: 'didit', identity_provider_session_ref: 'didit_1', identity_attempts: 1, identity_country: 'TT' });
    expect(await start(db, null)).toMatchObject({ ok: false, code: 'consent_declined' });
  });

  it('with Didit not configured it says so plainly (503 not_configured) instead of failing quietly', async () => {
    h.configured = false;
    const db = seed();
    const r = await start(db);
    expect(r).toMatchObject({ ok: false, code: 'not_configured', httpStatus: 503, extra: { support: true } });
    expect((r as any).error).toBe('Verification setup is not finished yet.');
    expect(h.provider.createSession).not.toHaveBeenCalled();
  });

  it('reuses an unfinished session instead of creating another', async () => {
    h.provider.getOutcome = vi.fn(async () => ({ outcome: { kind: 'pending' }, providerCode: null, resumeUrl: 'https://hosted.example/resume' }));
    const db = seed({ identity_status: 'pending', identity_provider: 'didit', identity_provider_session_ref: 's1', identity_attempts: 1, identity_providers_tried: ['didit'], identity_country: 'TT' });
    const r = await start(db, null);
    expect(r).toMatchObject({ ok: true, kind: 'redirect', url: 'https://hosted.example/resume' });
    expect(h.provider.createSession).not.toHaveBeenCalled();
    expect(rowOf(db).identity_attempts).toBe(1);
  });

  it('a session that turned out verified is reported as verified, with no new session', async () => {
    h.provider.getOutcome = vi.fn(async () => ({ outcome: { kind: 'verified' }, providerCode: null }));
    const db = seed({ identity_status: 'pending', identity_provider: 'didit', identity_provider_session_ref: 's1', identity_attempts: 1, identity_providers_tried: ['didit'], identity_country: 'TT' });
    expect(await start(db, null)).toMatchObject({ ok: true, kind: 'verified' });
    expect(rowOf(db).identity_status).toBe('verified');
    expect(h.provider.createSession).not.toHaveBeenCalled();
  });

  it('a Didit error on create is a clean 502, not an exception', async () => {
    h.provider = fakeDidit({ createSession: vi.fn(async () => { throw new Error('Didit create session failed (500)'); }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await start(seed())).toMatchObject({ ok: false, httpStatus: 502, code: 'provider_error' });
  });
});
