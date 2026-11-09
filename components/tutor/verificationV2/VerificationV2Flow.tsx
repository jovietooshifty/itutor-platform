'use client';

// The teacher's verification page: a step-by-step flow. "Step X of N" with a filled bar at the top and
// one tappable button per step, then ONE focused screen at a time with Save and Home side by side.
// The steps can be done in ANY order: tap any of them at any time, nothing is locked because another
// step is unfinished. Progress is saved as the teacher goes. Review and submit is enabled once every
// required step is done.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SETUP_CODE, SETUP_MESSAGE, type StepStatus, type VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { pollIntervalMs, stateSignature } from '@/lib/verificationV2/poll';
import NameStep from './NameStep';
import IdentityStep from './IdentityStep';
import CredentialsStep from './CredentialsStep';
import StatusView from './StatusView';
import { Card, ErrorBanner, Notice, PrimaryButton, StatePill, StepBar, readError, type StepHandle, type StepState } from './ui';

type StepKey = 'name' | 'identity' | 'credentials' | 'review';
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'identity', label: 'ID' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'review', label: 'Review' },
];

const homeClass =
  'inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:bg-muted sm:flex-none';

export default function VerificationV2Flow() {
  const router = useRouter();
  const [state, setState] = useState<VerificationV2StateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const latest = useRef<VerificationV2StateDto | null>(null);
  latest.current = state;
  const nameRef = useRef<StepHandle>(null);
  const credRef = useRef<StepHandle>(null);

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
        const states: StepStatus[] = [next.steps.name, next.steps.identity, next.steps.credentials];
        const first = states.findIndex((s) => s !== 'done');
        setCurrent(first === -1 ? 3 : first);
      }
    } catch {
      setError('Could not load your verification. Please refresh.');
    }
  }, [router]);

  useEffect(() => {
    void load();
    // Back from Didit: open the ID step and drop the marker so a refresh does not look like a return.
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
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/tutor/verification-v2/submit', { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Could not send your application'));
      await load();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(key: StepKey) {
    setBusy(true);
    setSaved(false);
    try {
      const handle = key === 'name' ? nameRef.current : key === 'credentials' ? credRef.current : null;
      const ok = handle ? await handle.save() : true;
      if (!ok) return;
      await load();
      setSaved(true);
      setCurrent((c) => Math.min(c + 1, STEPS.length - 1));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <header>
      <Link href="/tutor/dashboard" className="text-xs text-muted-foreground hover:text-ink">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-ink lg:text-3xl">Get verified</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Do the steps in any order. Your progress is saved, so you can leave and come back.
      </p>
    </header>
  );

  if (setupMissing) {
    return (
      <div className="max-w-3xl space-y-6">
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
      <div className="max-w-3xl space-y-6">
        {header}
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!state) {
    return (
      <div className="max-w-3xl space-y-6">
        {header}
        <div className="flex min-h-[200px] items-center justify-center" role="status" aria-label="Loading">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand" />
        </div>
      </div>
    );
  }

  const key = STEPS[current].key;
  const reviewState: StepState =
    state.status === 'IN_REVIEW' || state.status === 'VERIFIED' ? 'done' : state.canSubmit ? 'in_progress' : 'not_started';
  const barSteps = STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    state: (s.key === 'review' ? reviewState : state.steps[s.key]) as StepState,
  }));

  return (
    <div className="max-w-3xl space-y-5">
      {header}
      {error && <ErrorBanner message={error} />}

      {/* The decision, when there is one to show (in review, verified, not approved, removed). */}
      {state.status !== 'IN_PROGRESS' && state.status !== 'NOT_STARTED' && <StatusView state={state} />}

      {/* A teacher verified before names were checked is asked, once, to confirm their name. */}
      {state.name.prompt && (
        <div className="space-y-3">
          <NameStep ref={nameRef} state={state} onChange={load} prompt />
          <div className="flex gap-3">
            <PrimaryButton onClick={() => void nameRef.current?.save()} className="flex-1 sm:flex-none">
              Save
            </PrimaryButton>
            <Link href="/tutor/dashboard" className={homeClass}>
              Home
            </Link>
          </div>
        </div>
      )}

      {state.editable && (
        <>
          <StepBar steps={barSteps} current={current} onSelect={(i) => { setSaved(false); setCurrent(i); }} />

          {state.status === 'IN_PROGRESS' && state.decisionReason && (
            <Notice>
              <p className="font-semibold">We need more information</p>
              <p className="mt-1">{state.decisionReason}</p>
              <p className="mt-1">Update that step, then send your application again.</p>
            </Notice>
          )}

          {key === 'name' && <NameStep ref={nameRef} state={state} onChange={load} />}
          {key === 'identity' && <IdentityStep state={state} onChange={load} />}
          {key === 'credentials' && <CredentialsStep ref={credRef} state={state} onChange={load} />}
          {key === 'review' && (
            <Card title="Review and submit" subtitle="Check each step, then send your application for review.">
              <ul className="divide-y divide-border rounded-xl border border-border">
                {STEPS.filter((s) => s.key !== 'review').map((s, i) => (
                  <li key={s.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <button type="button" className="min-h-[44px] text-left font-medium text-ink hover:underline" onClick={() => setCurrent(i)}>
                      {s.key === 'name' ? 'Name on your ID' : s.key === 'identity' ? 'Upload your ID' : 'Credentials'}
                    </button>
                    <StatePill state={state.steps[s.key as 'name' | 'identity' | 'credentials']} />
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                {state.canSubmit
                  ? 'Everything required is done. We aim to decide within 14 days and will tell you here.'
                  : `Still to do: ${state.missing.join(', ')}.`}
              </p>
              <div className="mt-3">
                <ErrorBanner message={submitError} />
              </div>
            </Card>
          )}

          {/* Save and Home, side by side. Pinned to the bottom of the screen on a phone. */}
          <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            {key === 'review' ? (
              <PrimaryButton onClick={submit} busy={busy} disabled={!state.canSubmit} className="flex-1 sm:flex-none">
                Send for review
              </PrimaryButton>
            ) : (
              <PrimaryButton onClick={() => void save(key)} busy={busy} className="flex-1 sm:flex-none">
                Save
              </PrimaryButton>
            )}
            <Link href="/tutor/dashboard" className={homeClass}>
              Home
            </Link>
          </div>
          {saved && key !== 'name' && (
            <p role="status" className="text-xs text-muted-foreground">
              Saved.
            </p>
          )}
        </>
      )}

      {/* A verified teacher can keep their credentials up to date. New ones wait for an admin; the
          Verified badge stays. */}
      {state.status === 'VERIFIED' && state.canAddCredentials && (
        <CredentialsStep ref={credRef} state={{ ...state, editable: true }} onChange={load} afterVerified />
      )}
    </div>
  );
}
