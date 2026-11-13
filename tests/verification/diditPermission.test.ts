// A Didit key that may only READ sessions gets a 403 when a session is created. That must be reported in
// plain words (for the logs and the admin), and the teacher must not be invited to retry.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diditProvider } from '@/lib/identity/providers/didit';

beforeEach(() => {
  vi.stubEnv('DIDIT_API_KEY', 'test-key');
  vi.stubEnv('DIDIT_WORKFLOW_ID', 'wf-1');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"forbidden"}', { status: 403 })));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('creating a Didit session with a read-only key', () => {
  it('fails with a permissions error that says what is missing', async () => {
    const err: any = await diditProvider.createSession({ tutorId: 't1', attempt: 1, returnUrl: 'https://example.test/back', country: null } as any).catch((e) => e);
    expect(err.providerStatus).toBe(403);
    expect(err.message).toMatch(/read AND write/);
    expect(err.message).not.toMatch(/test-key/);
  });
});
