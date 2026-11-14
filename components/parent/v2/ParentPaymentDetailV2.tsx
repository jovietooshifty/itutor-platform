'use client';

/**
 * Payment detail — frames `160:6853` (active), `160:7546` (after pause),
 * `160:7607` (after cancel), with the Pause or cancel sheet `160:7285` and its
 * confirm sheets `160:7367` (pause) and `160:7457` (cancel). Billing › a class.
 *
 * WHY THIS EXISTS: the old Settings › Billing section was the only place a
 * parent could pause or cancel. That tabbed view is gone from the new UI, so
 * the frames' flow is built here, against the same API:
 * POST /api/parent/subscriptions/[enrolmentId] with pause | resume | cancel |
 * restart (payer check, Stripe first then DB — lib/payments/subscriptionPause).
 *
 * REAL DATA: the subscription from /api/parent/billing (found by id; the API
 * scopes it to this parent's children) and its payments from
 * useParentTransactions, filtered to this enrolment.
 *
 * Deviations from the frames, each because the frame states something the
 * system does not do:
 * - No "Card" or "Started" rows: neither is in the billing data (the card is
 *   on the Stripe subscription, not our row). A "For" row (the child) is shown.
 * - "Pause for a month" is "Pause payments": the API pauses until the parent
 *   resumes; it has no one-month timer. Confirm pause says the place is kept
 *   rather than describing class access, which pause does not change in code.
 * - Confirm cancel: "Cancellation date: Today" is "Takes effect: <end of paid
 *   month>", because cancel is scheduled for the period end.
 * - Cancel scheduled ("Ends soon") offers "Keep class" (restart). No frame —
 *   PROVISIONAL — but the API supports it and the old screen offered it.
 * - A tutor break shows its own note and no Resume, as the old screen did: it
 *   is not the parent's pause to end.
 * - Back link reads "Billing" with the class name as the title.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { Button, SubjectTile, SummaryRow, Tag } from '@/components/ui';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { Sheet } from './Sheet';
import { FormError } from './accountKit';
import { subjectCode, subjectColor } from './subjectTile';
import { useParentTransactions } from './useParentTransactions';

type Subscription = {
  id: string;
  groupId: string | null;
  childId: string;
  childName: string;
  className: string;
  tutorName: string | null;
  status: string;
  amount: number;
  cancelled: boolean;
  cancelScheduled: boolean;
  paused: boolean;
  pausedByTutor: boolean;
  pauseEnds: string | null;
  nextCharge: string | null;
};

type Action = 'pause' | 'resume' | 'cancel' | 'restart';

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 0 });
const money = (n: number) => `TT$${TT.format(Math.round(n))}`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function Rows({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">{children}</div>
  );
}

export default function ParentPaymentDetailV2({ enrolmentId }: { enrolmentId: string }) {
  const router = useRouter();
  const { profile } = useProfile();
  const { txns, loading: txnsLoading } = useParentTransactions(profile?.id);
  const [status, setStatus] = useState<'loading' | 'error' | 'missing' | 'ready'>('loading');
  const [sub, setSub] = useState<Subscription | null>(null);
  const [sheet, setSheet] = useState<null | 'choose' | 'pause' | 'cancel'>(null);
  const [choice, setChoice] = useState<'pause' | 'cancel'>('pause');
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/parent/billing', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const found = ((json.subscriptions ?? []) as Subscription[]).find((s) => s.id === enrolmentId) ?? null;
      setSub(found);
      setStatus(found ? 'ready' : 'missing');
    } catch {
      setStatus('error');
    }
  }, [enrolmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const history = useMemo(() => txns.filter((t) => t.enrollment_id === enrolmentId), [txns, enrolmentId]);

  const act = async (action: Action) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/parent/subscriptions/${encodeURIComponent(enrolmentId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.error === 'already_cancelled'
            ? 'This class is already cancelled.'
            : 'That did not go through, and nothing has changed. Try again in a moment.'
        );
        return false;
      }
      setSheet(null);
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  };

  if (status === 'loading') {
    return (
      <DetailScreen backLabel="Billing" fallbackHref="/parent/billing">
        <DetailSkeleton rows={2} />
      </DetailScreen>
    );
  }

  if (status !== 'ready' || !sub) {
    return (
      <DetailScreen backLabel="Billing" fallbackHref="/parent/billing" title="Payment">
        <EmptyCard
          title={status === 'missing' ? 'We could not find this class' : 'We could not load this payment'}
          body="Nothing has been charged or changed."
          action={
            <Button variant="outline" onClick={() => router.push('/parent/billing')}>
              Back to Billing
            </Button>
          }
        />
      </DetailScreen>
    );
  }

  const first = sub.childName.split(' ')[0] || 'Your child';
  const live = !sub.cancelled && !sub.cancelScheduled;
  const nextPayment =
    sub.cancelled || sub.cancelScheduled || sub.paused ? 'None' : sub.nextCharge ? `${sub.nextCharge} · automatic` : '—';

  return (
    <DetailScreen backLabel="Billing" fallbackHref="/parent/billing" title={sub.className}>
      {/* Class card */}
      <div className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
        <div className="flex items-center gap-ds-3">
          <SubjectTile code={subjectCode(sub.className)} color={subjectColor(sub.className)} size={48} />
          <div className="flex min-w-0 flex-col gap-[2px]">
            <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{sub.className}</span>
            <span className="font-body text-[13px] text-ink-muted">
              {[sub.tutorName, sub.childName].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        <div className="flex items-baseline gap-ds-6 bw-t-hair border-line-soft pt-ds-3">
          <span className="font-display text-[32px] font-extrabold leading-[34px] tabular-nums text-ink">
            {sub.amount > 0 ? money(sub.amount) : 'Free'}
          </span>
          {sub.amount > 0 ? <span className="font-body text-[14px] text-ink-muted">per month</span> : null}
        </div>
      </div>

      {/* State card: after pause / after cancel (frames 160:7546, 160:7607). */}
      {sub.cancelled ? (
        <div className="flex flex-col items-start gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <Tag tone="outline">Cancelled</Tag>
          <p className="font-body text-[14px] text-ink">No further charges.</p>
        </div>
      ) : sub.cancelScheduled ? (
        <div className="flex flex-col items-start gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <Tag tone="outline">Cancelled</Tag>
          <p className="font-body text-[14px] text-ink">
            No further charges.{sub.nextCharge ? ` ${first}’s access ends on ${sub.nextCharge}.` : ''}
          </p>
          {/* PROVISIONAL: no frame for undoing a scheduled cancel. */}
          <Button variant="outline" block="always" disabled={!!busy} onClick={() => void act('restart')}>
            {busy === 'restart' ? 'Keeping…' : 'Keep class'}
          </Button>
        </div>
      ) : sub.paused ? (
        <div className="flex flex-col items-start gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <Tag tone="warning">{sub.pausedByTutor ? 'Tutor break' : 'Paused'}</Tag>
          {sub.pausedByTutor ? (
            <p className="font-body text-[14px] text-ink">
              The tutor is on a break{sub.pauseEnds ? ` until ${sub.pauseEnds}` : ''}. The place is held and billing
              restarts on its own — nothing for you to do.
            </p>
          ) : (
            <>
              <p className="font-body text-[14px] text-ink">No charges while paused. Resume any time.</p>
              <Button block="always" disabled={!!busy} onClick={() => void act('resume')}>
                {busy === 'resume' ? 'Resuming…' : 'Resume class'}
              </Button>
            </>
          )}
        </div>
      ) : null}
      {error && !sheet ? <FormError>{error}</FormError> : null}

      <Rows>
        <SummaryRow label="Next payment" value={nextPayment} />
        <SummaryRow label="For" value={sub.childName} />
      </Rows>

      <h2 className="pt-ds-2 font-display text-[18px] font-extrabold text-ink">Payment history</h2>
      {txnsLoading && profile?.id ? (
        <div className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" />
      ) : history.length === 0 ? (
        <p className="font-body text-[14px] text-ink-muted">No payments for this class yet.</p>
      ) : (
        <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card">
          {history.map((t, i) => {
            const paid = /^(paid|succeeded|completed)$/i.test(t.status);
            const failed = /fail/i.test(t.status);
            return (
              <div key={t.id} className={cn('flex items-center justify-between gap-ds-3 py-ds-3', i > 0 && 'bw-t-hair border-line-soft')}>
                <span className="font-body text-[14px] text-ink">
                  {shortDate(t.created_at)} ·{' '}
                  <span className={cn('font-extrabold', paid ? 'text-brand-dark' : failed ? 'text-danger' : 'text-ink-muted')}>
                    {paid ? 'Paid' : failed ? 'Failed' : t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                  </span>
                </span>
                <span className="font-display text-[14px] font-extrabold tabular-nums text-ink">{money(t.amount_ttd)}</span>
              </div>
            );
          })}
        </div>
      )}

      {live && !sub.paused ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setChoice('pause');
            setSheet('choose');
          }}
          className="self-center border-0 bg-transparent p-ds-2 font-display text-[16px] font-extrabold text-danger cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Pause or cancel
        </button>
      ) : null}

      {/* 160:7285 — Pause or cancel. Pause is listed first and pre-selected. */}
      <Sheet
        open={sheet === 'choose'}
        onClose={() => setSheet(null)}
        title={sub.className}
        footer={
          <>
            <Button variant="outline" size="lg" block onClick={() => setSheet(choice)}>
              Continue
            </Button>
            <button
              type="button"
              onClick={() => setSheet(null)}
              className="self-center border-0 bg-transparent p-ds-2 font-display text-[15px] font-extrabold text-brand-dark cursor-pointer"
            >
              Keep class as it is
            </button>
          </>
        }
      >
        <div role="radiogroup" aria-label="Pause or cancel" className="flex flex-col gap-ds-3">
          {(
            [
              { id: 'pause', title: 'Pause payments', body: 'No charge on the next date. The place is kept until you resume.' },
              {
                id: 'cancel',
                title: 'Cancel subscription',
                body: 'Stops all future payments. Access continues to the end of this paid month.',
              },
            ] as const
          ).map((o) => {
            const on = choice === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(o.id)}
                className={cn(
                  'flex items-start gap-ds-3 rounded-ds-card bg-surface-card p-ds-card text-left cursor-pointer',
                  on ? 'bw-bold border-ink' : 'bw-hair border-border'
                )}
              >
                <span
                  className={cn(
                    'mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-ds-full bw-bold border-ink'
                  )}
                >
                  {on ? <span className="h-[10px] w-[10px] rounded-ds-full bg-brand" /> : null}
                </span>
                <span className="flex flex-col gap-[2px]">
                  <span className="font-display text-[15px] font-extrabold text-ink">{o.title}</span>
                  <span className="font-body text-[13px] text-ink-muted">{o.body}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* 160:7367 — Confirm pause. */}
      <Sheet
        open={sheet === 'pause'}
        onClose={() => (busy ? undefined : setSheet(null))}
        title={`Pause ${sub.className}?`}
        footer={
          <>
            <Button size="lg" block onClick={() => void act('pause')} disabled={!!busy}>
              {busy === 'pause' ? 'Pausing…' : 'Pause class'}
            </Button>
            <Button variant="outline" size="lg" block onClick={() => setSheet(null)} disabled={!!busy}>
              Keep class active
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-sunken p-ds-card">
          <SummaryRow label="Pause starts" value="Today" />
          <SummaryRow label="Next charge" value="None · resumes on request" />
          <SummaryRow label={`${first}’s place`} value="Kept" />
          <SummaryRow label="Resume" value="Any time from Billing" />
        </div>
        {error ? <FormError>{error}</FormError> : null}
      </Sheet>

      {/* 160:7457 — Confirm cancel. */}
      <Sheet
        open={sheet === 'cancel'}
        onClose={() => (busy ? undefined : setSheet(null))}
        title={`Cancel ${sub.className}?`}
        footer={
          <>
            <Button variant="danger" size="lg" block onClick={() => void act('cancel')} disabled={!!busy}>
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
            </Button>
            <Button variant="outline" size="lg" block onClick={() => setSheet(null)} disabled={!!busy}>
              Keep class
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-card">
          <SummaryRow label="Takes effect" value={sub.nextCharge ? `${sub.nextCharge}` : 'End of this paid month'} />
          <SummaryRow label="Next charge" value="Won’t happen" />
          <SummaryRow label={`${first}’s access`} value={sub.nextCharge ? `Until ${sub.nextCharge}` : 'To the end of this month'} />
          <SummaryRow label="Refund" value="None for this month" />
        </div>
        {error ? <FormError>{error}</FormError> : null}
      </Sheet>
    </DetailScreen>
  );
}
