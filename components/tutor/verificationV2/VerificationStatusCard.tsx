'use client';

// The teacher's verification status, as a card on the dashboard and the "Get listed"
// checklist. It copies the checklist's section card (components/tutor/verificationV2/ui.tsx).
// It shows NOTHING until the state has loaded, and nothing at all when the feature is off,
// the teacher is not signed in as a tutor, or verification setup is not finished on this
// environment, so it can never break the page it sits on.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SETUP_CODE, type VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { expectedBy } from './StatusView';
import { Card, type StepState } from './ui';

interface View {
  line: string;
  cta: string;
  state: StepState;
}

/** Pure, so it can be tested: what the card says for a given state. */
export function describeCard(s: VerificationV2StateDto): View {
  const done = [s.steps.name, s.steps.identity, s.steps.credentials].filter((x) => x === 'done').length;
  switch (s.status) {
    case 'VERIFIED':
      if (s.name?.prompt) return { line: 'You are verified. Please confirm your name so it matches your ID.', cta: 'Confirm name', state: 'needs_changes' };
      return { line: 'You are verified. Your Verified badge shows on your profile.', cta: 'View', state: 'done' };
    case 'IN_REVIEW': {
      const by = expectedBy(s.submittedAt);
      return { line: `In review.${by ? ` We aim to decide by ${by}.` : ''}`, cta: 'View', state: 'in_progress' };
    }
    case 'REJECTED':
      return { line: 'Your application needs changes before it can be approved.', cta: 'See why', state: 'needs_changes' };
    case 'REVERIFICATION_REQUIRED':
      return { line: 'Please verify again. This is not a rejection.', cta: 'Verify again', state: 'needs_changes' };
    case 'REVOKED':
      return { line: 'Your verification was removed. You can apply again.', cta: 'Apply again', state: 'not_started' };
    case 'IN_PROGRESS':
      // A zero is never shown: with nothing done yet the card just says it is not finished.
      return {
        line: done > 0 ? `In progress: ${done} of 3 required steps done.` : 'Started, not finished yet.',
        cta: 'Continue',
        state: done > 0 ? 'in_progress' : 'not_started',
      };
    default:
      return { line: 'Verify your identity and qualifications so students and parents can trust your profile.', cta: 'Get verified', state: 'not_started' };
  }
}

export default function VerificationStatusCard({ className = '' }: { className?: string }) {
  const [state, setState] = useState<VerificationV2StateDto | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/tutor/verification-v2/state', { cache: 'no-store' });
        if (res.status === 503) {
          // SETUP_CODE: migrations not run here. Stay invisible.
          void SETUP_CODE;
          return;
        }
        if (!res.ok) return; // 404 flag off, 401/403 not a tutor, 500: stay invisible
        const body = (await res.json()) as VerificationV2StateDto;
        if (live) setState(body);
      } catch {
        /* offline: stay invisible */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!state) return null;
  const view = describeCard(state);

  return (
    <Card title="Verification" subtitle="Shown to students and parents as a Verified badge." state={view.state} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink">{view.line}</p>
        <Link
          href="/tutor/verification-v2"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-deep"
        >
          {view.cta}
        </Link>
      </div>
    </Card>
  );
}
