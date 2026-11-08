import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }));

import IdentityStep from '@/components/tutor/verificationV2/IdentityStep';

const render = (identity: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(IdentityStep, {
      state: {
        consentAt: '2026-10-01T00:00:00Z',
        steps: { identity: 'needs_changes', credentials: 'not_started', details: 'not_started' },
        stepNotes: { identity: null, credentials: null },
        identity: { status: null, reason: null, country: 'TT', attempts: 0, maxAttempts: 3, canRetry: false, furtherRoute: false, countries: [{ code: 'TT', name: 'Trinidad and Tobago' }], available: true, ...identity },
      } as any,
      onChange: async () => {},
    })
  );

describe('identity step copy when attempts run out', () => {
  it('a cancelled check with no attempt left shows only the contact-us message', () => {
    const out = render({ status: 'canceled', attempts: 3, canRetry: false, furtherRoute: false });
    expect(out).toContain('You have used all identity check attempts.');
    expect(out).toContain('Please contact us at');
    expect(out).not.toContain('That check was cancelled');
    expect(out).not.toContain('You can start a new one');
    expect(out).not.toContain('Start identity check');
  });

  it('a cancelled check with attempts left still says it can be started again', () => {
    const out = render({ status: 'canceled', attempts: 1, canRetry: true });
    expect(out).toContain('That check was cancelled. You can start a new one.');
    expect(out).not.toContain('You have used all identity check attempts');
  });
});
