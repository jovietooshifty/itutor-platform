import { describe, expect, it } from 'vitest';
import { DIDIT_VARIABLES, identitySetupProblems } from '@/lib/identity/configStatus';

const FULL = { DIDIT_API_KEY: 'secret-key-value-1', DIDIT_WORKFLOW_ID: 'wf-value-2', DIDIT_WEBHOOK_SECRET: 'whsec-value-3' };

describe('identity setup problems (admin screen)', () => {
  it('reads exactly three variables', () => {
    expect([...DIDIT_VARIABLES]).toEqual(['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET']);
  });

  it('nothing missing means no problems', () => {
    expect(identitySetupProblems(FULL)).toEqual([]);
  });

  it('a missing variable is reported by NAME, one problem for Didit', () => {
    const p = identitySetupProblems({ DIDIT_API_KEY: 'k', DIDIT_WORKFLOW_ID: 'w' });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ provider: 'didit', primary: true, missing: ['DIDIT_WEBHOOK_SECRET'] });
    expect(p[0].message).toContain('DIDIT_WEBHOOK_SECRET');
  });

  it('nothing set at all lists all three names, in every environment (there is no sandbox workflow default)', () => {
    for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production' }]) {
      expect(identitySetupProblems(env)[0].missing).toEqual(['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET']);
    }
  });

  it('blank values count as missing, and no value ever appears in the output', () => {
    const env = { DIDIT_API_KEY: '   ', DIDIT_WORKFLOW_ID: 'workflow-visible?', DIDIT_WEBHOOK_SECRET: 'super-secret-xyz' };
    const out = JSON.stringify(identitySetupProblems(env));
    expect(out).toContain('DIDIT_API_KEY');
    expect(out).not.toContain('workflow-visible');
    expect(out).not.toContain('super-secret');
  });

  it('other providers\' variables are not read: they are not part of the system', () => {
    expect(identitySetupProblems({ ...FULL, STRIPE_SECRET_KEY: 'x', VERIFF_API_KEY: 'y' })).toEqual([]);
  });
});
