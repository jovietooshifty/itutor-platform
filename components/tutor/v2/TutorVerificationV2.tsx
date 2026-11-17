'use client';

/**
 * Tutor Verification, new UI — /tutor/verification. Canvas m27 (and the
 * badge card on d11).
 *
 * REAL DATA: GET /api/verification/request (profile status + latest request),
 * mapped to the canvas's five steps in ./verificationSteps.
 *
 * Copy changed from the canvas, on purpose:
 * - The canvas asks for "a government ID and one teaching credential". The
 *   real upload takes one qualification document (CSEC / CAPE certificate or
 *   results slip, or another teaching credential). It never asks for an ID,
 *   so this screen does not say it does.
 * - "Our payment provider may still run its own checks before your first
 *   withdrawal" is dropped: payouts are bank transfers with no provider check.
 *
 * "Apply" opens the existing upload screen (?apply=1) inside the new shell.
 * It keeps its old look until that screen is redrawn. PROVISIONAL.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from '@phosphor-icons/react';
import { Button, Card, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorV2Shell from './TutorV2Shell';
import { TutorShellEmbedded } from '@/components/tutor/TutorShell';
import {
  VERIFY_STEPS,
  fetchVerification,
  verifyStep,
  verifyTone,
  type VerificationState,
  type VerifyStep,
} from './verificationSteps';

export default function TutorVerificationV2({ legacy }: { legacy: ReactNode }) {
  const [apply, setApply] = useState<boolean | null>(null);
  // Read ?apply=1 on mount AND on Back/Forward. Pushing the same route with a
  // new query does not remount this component, so a mount-only read left the
  // Apply button doing nothing but scrolling to the top.
  useEffect(() => {
    const read = () => setApply(new URLSearchParams(window.location.search).get('apply') === '1');
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const openApply = () => {
    window.history.pushState(null, '', '/tutor/verification?apply=1');
    setApply(true);
    window.scrollTo(0, 0);
  };

  if (apply === null) return <TutorV2Shell title="Verification">{null}</TutorV2Shell>;
  if (apply) {
    return (
      <TutorV2Shell title="Verification" width="wide">
        <TutorShellEmbedded.Provider value>{legacy}</TutorShellEmbedded.Provider>
      </TutorV2Shell>
    );
  }
  return (
    <TutorV2Shell title="Verification">
      <VerificationBody onApply={openApply} />
    </TutorV2Shell>
  );
}

function VerificationBody({ onApply }: { onApply: () => void }) {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [state, setState] = useState<VerificationState | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }
    let cancelled = false;
    fetchVerification().then((v) => {
      if (!cancelled) setState(v);
    });
    return () => {
      cancelled = true;
    };
  }, [profile, loading, router]);

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push('/tutor/profile');
  };

  if (state === undefined) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        <div className="h-[36px] w-[200px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[220px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  const step = verifyStep(state);
  const reason = state?.latestRequest?.reviewer_reason || state?.latestRequest?.system_reason || null;
  const canApply = step === 'Not applied' || step === 'Changes requested';
  const pending = state?.pendingCount ?? 0;

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex flex-col gap-ds-1">
        <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">Verified badge</span>
        <div className="flex flex-wrap items-center gap-ds-2">
          <h1 className="ds-page-title m-0">iTutor Verified</h1>
          <Tag tone="outline">Optional</Tag>
        </div>
        <p className="m-0 text-[15px] text-ink-muted">
          A badge families can trust. You can teach and get paid without it.
        </p>
      </div>

      {state === null ? (
        <p className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-4 text-[14px] font-bold text-ink">
          We couldn&apos;t load your verification status. Try again in a moment.
        </p>
      ) : null}

      <Card
        eyebrow="Status"
        title={step}
        body={
          step === 'Approved'
            ? 'Families see the Verified badge on your profile.'
            : step === 'Changes requested'
              ? reason ?? 'The review team could not approve your document. Upload a clearer copy or a different credential.'
              : step === 'Under review' || step === 'Submitted'
                ? `The review team is looking at ${pending > 1 ? `your ${pending} documents` : 'your document'}. This usually takes 1–2 business days.`
                : 'Not applied. Only an approved review shows the badge.'
        }
      >
        <StepList current={step} />
      </Card>

      <Card
        eyebrow="What we ask for"
        title="One teaching qualification"
        body="A CSEC or CAPE certificate or results slip, or another teaching credential, as a PDF, JPG or PNG. Only the review team sees it. It never appears on your profile."
      />
      <p className="m-0 text-[14px] text-ink-muted">Separate from payouts. You get paid with or without the badge.</p>

      <div className="flex flex-wrap gap-ds-3">
        <Button variant="outline" onClick={back}>
          {canApply ? 'Not now' : 'Back'}
        </Button>
        {canApply ? (
          <Button onClick={onApply}>
            {step === 'Changes requested' ? 'Upload again' : 'Apply'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The five steps as a vertical list; the current one is marked. */
export function StepList({ current, className }: { current: VerifyStep; className?: string }) {
  // "Changes requested" is a branch off "Under review", not a step after it, so
  // it only shows as reached when it is the current state.
  const order = VERIFY_STEPS.indexOf(current);
  return (
    <ol className={cn('m-0 mt-ds-3 flex list-none flex-col gap-ds-2 p-0', className)}>
      {VERIFY_STEPS.map((s, i) => {
        const isCurrent = s === current;
        const done =
          !isCurrent &&
          (current === 'Approved'
            ? s !== 'Changes requested' && s !== 'Not applied'
            : i < order && s !== 'Changes requested' && s !== 'Not applied');
        return (
          <li key={s} className="flex items-center gap-ds-2 text-[14px]">
            <span
              className={cn(
                'flex size-[22px] shrink-0 items-center justify-center rounded-ds-full bw-hair',
                isCurrent ? 'border-ink bg-ink text-on-ink' : done ? 'border-brand bg-brand text-ink' : 'border-line-soft text-ink-muted'
              )}
              aria-hidden
            >
              {done ? <Check size={12} weight="bold" /> : isCurrent ? <i className="size-[6px] rounded-ds-full bg-brand" /> : null}
            </span>
            <span className={cn(isCurrent ? 'font-extrabold text-ink' : 'text-ink-muted')}>{s}</span>
            {isCurrent ? (
              <Tag tone={verifyTone(s)} className="ml-auto">
                Now
              </Tag>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
