'use client';

// The teacher's verification page. It copies the "Complete your profile" checklist
// (app/tutor/get-listed/page.tsx): back link, title, progress card, then one card per step with a
// status pill. The steps can be done in ANY order: nothing is locked or greyed out because another
// step is unfinished. Progress is saved as the teacher goes, so they can leave and come back.
// "Send for review" is enabled once every required step is done.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SETUP_CODE, SETUP_MESSAGE, type VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { pollIntervalMs, stateSignature } from '@/lib/verificationV2/poll';
import IdentityStep from './IdentityStep';
import CredentialsStep from './CredentialsStep';
import ExtrasStep from './ExtrasStep';
import StatusView from './StatusView';
import { Card, ErrorBanner, Notice, PrimaryButton, ProgressCard, readError } from './ui';

type StepKey = 'identity' | 'credentials' | 'details';

export default function VerificationV2Flow() {
  const router = useRouter();
  const [state, setState] = useState<VerificationV2StateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [open, setOpen] = useState<Record<StepKey, boolean>>({ identity: false, credentials: false, details: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const latest = useRef<VerificationV2StateDto | null>(null);
  latest.current = state;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/verification-v2/state', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        router.push('/login');
        return;
      }
      if (res.status === 404) {
        setError('This page is not available.');
        return;
      }
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        if (body?.code === SETUP_CODE) {
          setSetupMissing(true);
          return;
        }
      }
      if (!res.ok) throw new Error();
      const next = (await res.json()) as VerificationV2StateDto;
      setSetupMissing(false);
      setState(next);
      setError(null);
      // The first time only: open the first step that still needs the teacher. After that they decide.
      if (firstLoad.current) {
        firstLoad.current = false;
        const first = (['identity', 'credentials'] as StepKey[]).find((k) => next.steps[k] !== 'done');
        if (first) setOpen((o) => ({ ...o, [first]: true }));
      }
    } catch {
      setError('Could not load your verification. Please refresh.');
    }
  }, [router]);

  useEffect(() => {
    void load();
    // Back from Didit: drop the marker so a refresh does not look like a return.
    if (typeof window !== 'undefined' && window.location.search.includes('identity=return')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [load]);

  // Live status: while a change can still arrive from outside (in review, in progress), ask again
  // every few seconds, only while the tab is visible, and apply the answer only if something the
  // teacher cares about changed. It stops by itself once the status is final.
  const status = state?.status ?? null;
  useEffect(() => {
    const every = pollIntervalMs(status);
    if (!every) return;
    let stopped = false;
    const poll = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/tutor/verification-v2/state', { cache: 'no-store' });
        if (!res.ok || stopped) return;
        const next = (await res.json()) as VerificationV2StateDto;
        const cur = latest.current;
        if (!cur || stateSignature(next) !== stateSignature(cur)) setState(next);
      } catch {
        /* offline: try again on the next tick */
      }
    };
    const timer = setInterval(() => void poll(), every);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/tutor/verification-v2/submit', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Could not send your application'));
      await load();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <header>
      <Link href="/tutor/dashboard" className="text-xs text-muted-foreground hover:text-ink">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 text-2xl lg:text-3xl font-bold text-ink">Get verified</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Do the steps in any order. Your progress is saved, so you can leave and come back.
      </p>
    </header>
  );

  if (setupMissing) {
    return (
      <div className="max-w-4xl space-y-6">
        {header}
        <Notice role="status">
          <p className="font-semibold">{SETUP_MESSAGE}</p>
          <p className="mt-1">Nothing is wrong with your account. Please check back soon.</p>
        </Notice>
      </div>
    );
  }
  if (error && !state) {
    return (
      <div className="max-w-4xl space-y-6">
        {header}
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!state) {
    return (
      <div className="max-w-4xl space-y-6">
        {header}
        <div className="min-h-[200px] flex items-center justify-center" role="status" aria-label="Loading">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
        </div>
      </div>
    );
  }

  const toggle = (k: StepKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const editable = state.editable;
  const requiredDone = (['identity', 'credentials'] as StepKey[]).filter((k) => state.steps[k] === 'done').length;

  return (
    <div className="max-w-4xl space-y-6">
      {header}
      {error && <ErrorBanner message={error} />}

      {/* The decision, when there is one to show (in review, verified, not approved, removed). */}
      {state.status !== 'IN_PROGRESS' && state.status !== 'NOT_STARTED' && <StatusView state={state} />}

      {editable && (
        <>
          <ProgressCard
            completed={requiredDone}
            total={2}
            hint={state.canSubmit ? 'Ready to send for review' : `${2 - requiredDone} more to go`}
          />

          {state.status === 'IN_PROGRESS' && state.decisionReason && (
            <Notice>
              <p className="font-semibold">We need more information</p>
              <p className="mt-1">{state.decisionReason}</p>
              <p className="mt-1">Update that step, then send your application again.</p>
            </Notice>
          )}

          <IdentityStep state={state} onChange={load} open={open.identity} onToggle={() => toggle('identity')} />
          <CredentialsStep state={state} onChange={load} open={open.credentials} onToggle={() => toggle('credentials')} />
          <ExtrasStep state={state} onChange={load} open={open.details} onToggle={() => toggle('details')} />

          <Card>
            <h2 className="font-semibold text-ink">Send for review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.canSubmit
                ? 'Everything required is done. We aim to decide within 14 days and will tell you here.'
                : `Still to do: ${state.missing.join(' and ')}.`}
            </p>
            <div className="mt-4">
              <ErrorBanner message={submitError} />
              <PrimaryButton onClick={submit} busy={submitting} disabled={!state.canSubmit}>
                Send for review
              </PrimaryButton>
            </div>
          </Card>
        </>
      )}

      {/* A verified teacher can keep their profile up to date. New credentials wait for an admin; the
          Verified badge stays. */}
      {state.status === 'VERIFIED' && state.canAddCredentials && (
        <>
          <CredentialsStep state={{ ...state, editable: true }} onChange={load} afterVerified />
          <ExtrasStep state={{ ...state, editable: true }} onChange={load} afterVerified />
        </>
      )}
    </div>
  );
}
