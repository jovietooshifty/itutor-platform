'use client';

/**
 * Student Billing, new UI — Figma `2:1535` (Subscriptions) and `2:1684`
 * (cancel sheet); states E1 cancelled, E2 renewal failed, E5 none.
 *
 * DATA: /api/subscriptions/my, the same read as the old page. Every action
 * calls the endpoint the old page calls:
 *   cancel          POST /api/subscriptions/[id]/cancel (cancels at period end)
 *   undo            POST /api/subscriptions/[id]/undo-cancellation
 *   pay / continue  POST /api/groups/[groupId]/subscribe -> checkout_url
 *   seat            POST /api/subscriptions/[id]/seat (hybrid classes only)
 * Renewal credits keep the existing RenewalCreditsControl (old styling, no
 * frame), which renders nothing unless credits apply.
 *
 * MONEY. The fee is Stripe's gross-up (lib/payments/grossUp), exactly as the
 * old page computes it: subscriptions bill through Stripe, so the "service
 * fee" is what is actually charged on top of the class price.
 *
 * Wide screens — PROVISIONAL: bill card in a sticky right column, classes on
 * the left.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CaretRight, Lifebuoy } from '@phosphor-icons/react';
import { Button, SubjectTile, SummaryRow, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import { Sheet } from '@/components/parent/v2/Sheet';
import RenewalCreditsControl from '@/components/credits/RenewalCreditsControl';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';

type Sub = {
  id: string;
  group_id: string;
  status: string;
  plan_price_ttd: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_due_at: string | null;
  cancel_at_period_end: boolean;
  last_paid_at: string | null;
  release_date: string | null;
  next_cycle_paid: boolean;
  seat_type?: 'online' | 'physical' | null;
  billing_provider?: string | null;
  group: {
    id: string;
    name: string;
    subject: string | null;
    end_date?: string | null;
    class_format?: 'online' | 'physical' | 'hybrid' | null;
    price_online_ttd?: number | null;
    price_physical_ttd?: number | null;
  } | null;
};

const TZ = 'America/Port_of_Spain';
const LIVE = ['ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT', 'ACTIVATION_FAILED', 'SECURED'];
const CELLS = 30;

const money = (n: number) => `TT$${n.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso)) : '';
const releaseIso = (d: string) => `${d}T23:59:59-04:00`;

function gross(base: number) {
  const { grossAmount, processingFee } = calculateGrossAmountForProvider(base, 'stripe');
  return { gross: grossAmount, fee: processingFee };
}

/** What a class card says about itself, and its one money action if any. */
function describe(s: Sub): { line: string; tone: 'ok' | 'warn' | 'bad' | 'muted'; pay?: string } {
  const paid = s.last_paid_at ? `Paid ${day(s.last_paid_at)}` : null;
  if (s.cancel_at_period_end) return { line: `Ends ${day(s.current_period_end)} · Cancelled`, tone: 'muted' };
  switch (s.status) {
    case 'ACTIVE': {
      const due = !!s.next_payment_due_at && new Date(s.next_payment_due_at) <= new Date() && !s.next_cycle_paid;
      return due
        ? { line: 'Payment due now', tone: 'warn', pay: 'Pay now' }
        : { line: [paid, 'Active'].filter(Boolean).join(' · '), tone: 'ok' };
    }
    case 'GRACE':
      return { line: 'Renewal payment failed', tone: 'bad', pay: 'Update payment' };
    case 'SUSPENDED':
      return { line: 'Paused until payment', tone: 'bad', pay: 'Pay to continue' };
    case 'PENDING_PAYMENT':
      return { line: 'Payment not finished', tone: 'warn', pay: 'Finish payment' };
    case 'ACTIVATION_FAILED':
      return { line: 'Payment did not go through', tone: 'bad', pay: 'Try again' };
    case 'SECURED':
      return {
        line: s.release_date ? `Spot secured · paid to ${day(releaseIso(s.release_date))}` : 'Spot secured',
        tone: 'ok',
        pay: 'Continue monthly',
      };
    default:
      return { line: s.status.toLowerCase().replace(/_/g, ' '), tone: 'muted' };
  }
}

const TONE: Record<'ok' | 'warn' | 'bad' | 'muted', string> = {
  ok: 'text-brand-edge',
  warn: 'text-[#8a5f00]',
  bad: 'text-danger',
  muted: 'text-ink-muted',
};

export default function StudentBillingV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sub | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'student') router.push(nonStudentRedirect(profile));
  }, [profile, loading, router]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/subscriptions/my', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setSubs((await r.json()).subscriptions ?? []);
      setError(false);
    } catch {
      setError(true);
      setSubs([]);
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'student') void load();
  }, [profile?.role, load]);

  const post = async (key: string, url: string, body?: unknown) => {
    setBusy(key);
    setNote(null);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await r.json().catch(() => ({}));
      return { ok: r.ok, json };
    } catch {
      return { ok: false, json: { error: 'Check your connection and try again.' } };
    } finally {
      setBusy(null);
    }
  };

  const pay = async (s: Sub) => {
    const { json } = await post(`${s.id}-pay`, `/api/groups/${s.group_id}/subscribe`);
    if (json.checkout_url) {
      window.location.href = json.checkout_url;
      return;
    }
    setNote(
      json.parent_approval_required
        ? 'Sent to your parent. Paying for this class is theirs to approve.'
        : json.error || 'Could not start the payment. Please try again.'
    );
  };

  const cancel = async (s: Sub) => {
    const { ok, json } = await post(`${s.id}-cancel`, `/api/subscriptions/${s.id}/cancel`);
    setCancelTarget(null);
    setNote(ok ? `Cancelled. You keep access until ${day(s.current_period_end)}.` : json.error || 'Could not cancel.');
    await load();
  };

  const undo = async (s: Sub) => {
    const { ok, json } = await post(`${s.id}-undo`, `/api/subscriptions/${s.id}/undo-cancellation`);
    setNote(ok ? 'Your subscription carries on as before.' : json.error || 'Could not undo the cancellation.');
    await load();
  };

  const switchSeat = async (s: Sub) => {
    const target = s.seat_type === 'physical' ? 'online' : 'physical';
    const { ok, json } = await post(`${s.id}-seat`, `/api/subscriptions/${s.id}/seat`, { seatType: target });
    setNote(ok ? `Switched to an ${target === 'physical' ? 'in-person' : 'online'} seat.` : json.error || 'Could not change your seat.');
    await load();
  };

  const live = (subs ?? []).filter((s) => LIVE.includes(s.status));
  const past = (subs ?? []).filter((s) => !LIVE.includes(s.status));
  // The bill is what renews: active subscriptions not set to cancel.
  const renewing = live.filter((s) => (s.status === 'ACTIVE' || s.status === 'GRACE') && !s.cancel_at_period_end);
  // Each subscription is its own Stripe charge with its own fixed fee, so
  // gross up per subscription and add — grossing up the SUM would undercount
  // the fixed part, and a TT$0 base must carry no fee at all.
  const base = renewing.reduce((n, s) => n + (s.plan_price_ttd ?? 0), 0);
  const { total, fee } = renewing.reduce(
    (acc, s) => {
      const p = s.plan_price_ttd ?? 0;
      if (p <= 0) return acc;
      const g = gross(p);
      return { total: acc.total + g.gross, fee: acc.fee + g.fee };
    },
    { total: 0, fee: 0 }
  );
  const nextCharge = renewing
    .map((s) => s.next_payment_due_at || s.current_period_end)
    .filter(Boolean)
    .sort()[0] as string | undefined;
  const cycle = renewing.find((s) => (s.next_payment_due_at || s.current_period_end) === nextCharge);
  const start = cycle?.last_paid_at || cycle?.current_period_start || null;
  const elapsed =
    start && nextCharge
      ? Math.min(1, Math.max(0, (Date.now() - new Date(start).getTime()) / (new Date(nextCharge).getTime() - new Date(start).getTime())))
      : 0;
  const daysLeft = nextCharge ? Math.max(0, Math.ceil((new Date(nextCharge).getTime() - Date.now()) / 86_400_000)) : 0;

  const bill = (
    <section className="flex flex-col gap-ds-3 rounded-ds-card bg-ink p-ds-4 text-on-ink">
      <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-brand">Monthly bill</span>
      <p className="m-0 font-display text-[36px] font-black leading-[38px] tabular-nums">{money(total)}</p>
      <div className="flex flex-col gap-ds-1h text-[15px]">
        <div className="flex justify-between">
          <span className="text-on-ink-muted">Class fee</span>
          <span className="font-extrabold tabular-nums">{money(base)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-ink-muted">Service fee</span>
          <span className="font-extrabold tabular-nums">{money(fee)}</span>
        </div>
      </div>
      {nextCharge ? (
        <div className="flex flex-col gap-ds-2 border-t border-solid border-ink-raised pt-ds-3">
          <div className="flex justify-between text-[15px]">
            <span className="font-extrabold">{`Next charge ${day(nextCharge)}`}</span>
            <span className="text-on-ink-muted tabular-nums">{`${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</span>
          </div>
          <div className="flex gap-[2px]" aria-hidden>
            {Array.from({ length: CELLS }, (_, i) => (
              <span key={i} className={cn('h-[14px] flex-1 rounded-[2px]', i < Math.round(elapsed * CELLS) ? 'bg-ink-raised' : 'bg-brand')} />
            ))}
          </div>
          <div className="flex justify-between text-[13px] text-on-ink-muted">
            <span>{day(start)}</span>
            <span>{day(nextCharge)}</span>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-on-ink-muted">Nothing renews this month.</p>
      )}
    </section>
  );

  const help = (
    <div className="flex flex-col gap-ds-3">
      {/* Payment history removed (owner, 14 Nov): /student/transactions repeated
          what this screen already shows, and now redirects here. */}
      <a
        href="mailto:support@myitutor.com?subject=Billing%20help"
        className="ds-press flex items-center justify-between rounded-ds-card bg-surface-card bw-hair border-border p-ds-4 text-[16px] font-extrabold text-ink"
      >
        <span className="flex items-center gap-ds-2">
          <Lifebuoy size={20} aria-hidden />
          Billing help
        </span>
        <CaretRight size={20} weight="bold" aria-hidden />
      </a>
      <div className="flex gap-ds-4 px-[2px] text-[14px] font-bold text-ink-muted">
        <Link href="/terms" className="ds-link underline underline-offset-4">Terms of Service</Link>
        <Link href="/privacy" className="ds-link underline underline-offset-4">Privacy Policy</Link>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-ds-4">
      <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Subscriptions</h1>

      {error ? (
        <div className="flex flex-col items-start gap-ds-3 rounded-ds-card bg-danger-soft bw-hair border-danger p-ds-4">
          <p className="m-0 text-[15px] font-bold text-ink">We couldn&apos;t load your subscriptions.</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      ) : null}
      {note ? (
        <p className="m-0 rounded-ds-card bg-surface-card bw-hair border-brand px-ds-4 py-ds-3 text-[14px] text-ink" role="status">{note}</p>
      ) : null}

      {subs === null ? (
        <div className="h-[220px] animate-pulse rounded-ds-card bg-surface-sunken" aria-hidden />
      ) : (
        <div className="flex flex-col gap-ds-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-ds-4">
            <div className="lg:hidden">{bill}</div>

            {live.length === 0 ? (
              // E5 — no subscriptions.
              <section className="flex flex-col items-start gap-ds-2 rounded-ds-card bg-surface-card bw-hair border-border p-ds-4">
                <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">No subscriptions</h2>
                <p className="m-0 text-[14px] text-ink-muted">When you join a paid class, its monthly payment shows here.</p>
                <Link href="/student/find-tutors" className="ds-link text-[15px] font-extrabold text-brand-edge">Explore classes</Link>
              </section>
            ) : (
              live.map((s) => {
                const d = describe(s);
                const label = s.group?.subject || s.group?.name || 'Class';
                const hybrid = s.group?.class_format === 'hybrid' && ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'].includes(s.status);
                return (
                  <section key={s.id} className="flex flex-col gap-ds-card rounded-ds-card bg-surface-card bw-hair border-border p-ds-4">
                    <div className="flex items-center gap-ds-3">
                      <SubjectTile code={subjectCode(label)} color={subjectColor(label)} size={52} />
                      <div className="min-w-0">
                        <p className="m-0 text-[17px] font-extrabold leading-[21px] text-ink">{s.group?.name ?? 'Class'}</p>
                        <p className={cn('m-0 mt-[2px] text-[14px] font-bold', TONE[d.tone])}>{d.line}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-ds-3">
                      {d.pay ? (
                        <Button size="lg" className="flex-1" disabled={busy === `${s.id}-pay`} onClick={() => void pay(s)}>
                          {d.pay}
                        </Button>
                      ) : (
                        <Button variant="outline" size="lg" className="flex-1" onClick={() => router.push(`/student/classes/${s.group_id}`)}>
                          Open class
                        </Button>
                      )}
                      {s.cancel_at_period_end ? (
                        <button
                          type="button"
                          disabled={busy === `${s.id}-undo`}
                          onClick={() => void undo(s)}
                          className="ds-link min-h-[44px] shrink-0 border-0 bg-transparent px-ds-2 text-[15px] font-extrabold text-brand-edge cursor-pointer"
                        >
                          Undo
                        </button>
                      ) : s.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(s)}
                          className="ds-link min-h-[44px] shrink-0 border-0 bg-transparent px-ds-2 text-[15px] font-extrabold text-danger cursor-pointer"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    {hybrid ? (
                      <button
                        type="button"
                        disabled={busy === `${s.id}-seat`}
                        onClick={() => void switchSeat(s)}
                        className="ds-link self-start border-0 bg-transparent p-0 text-[14px] font-extrabold text-ink underline underline-offset-4 cursor-pointer"
                      >
                        {s.seat_type === 'physical' ? 'Switch to an online seat' : 'Switch to an in-person seat'}
                      </button>
                    ) : null}
                    <RenewalCreditsControl
                      enrollmentId={s.id}
                      billingProvider={s.billing_provider}
                      status={s.status}
                      cancelling={s.cancel_at_period_end}
                    />
                  </section>
                );
              })
            )}

            {past.length > 0 ? (
              <section className="flex flex-col gap-ds-2">
                <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">Ended</h2>
                {past.map((s) => (
                  <Link
                    key={s.id}
                    href={`/student/explore/${s.group_id}`}
                    className="ds-press flex items-center justify-between gap-ds-3 rounded-ds-card bg-surface-card bw-hair border-border px-ds-4 py-ds-3"
                  >
                    <span className="min-w-0 truncate text-[15px] font-bold text-ink">{s.group?.name ?? 'Class'}</span>
                    <Tag tone="outline">{s.status === 'COMPLETED' ? 'Ended' : 'Cancelled'}</Tag>
                  </Link>
                ))}
              </section>
            ) : null}

            <div className="lg:hidden">{help}</div>
          </div>

          <aside className="hidden flex-col gap-ds-4 lg:sticky lg:top-[80px] lg:flex">
            {bill}
            {help}
          </aside>
        </div>
      )}

      {/* Figma 2:1684 — the cancel sheet. Copy is the cancel-at-period-end
          behaviour the endpoint actually has. */}
      <Sheet
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel subscription?"
        footer={
          <div className="flex flex-col gap-ds-3 lg:flex-row-reverse">
            <Button size="lg" block onClick={() => setCancelTarget(null)}>Keep subscription</Button>
            <button
              type="button"
              disabled={!!cancelTarget && busy === `${cancelTarget.id}-cancel`}
              onClick={() => cancelTarget && void cancel(cancelTarget)}
              className="ds-press mb-[3px] inline-flex h-12 items-center justify-center rounded-ds-btn bw-bold border-danger bg-surface-card px-ds-4 text-[15px] font-extrabold text-danger cursor-pointer lg:w-auto"
            >
              Confirm cancellation
            </button>
          </div>
        }
      >
        {cancelTarget ? (
          <p className="m-0 -mt-ds-2 mb-ds-3 text-[14px] text-ink-muted">{cancelTarget.group?.name}</p>
        ) : null}
        {cancelTarget ? (
          <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
            <SummaryRow label="Access" value={`Until ${day(cancelTarget.current_period_end)}`} />
            <SummaryRow label="Future charges" value="None" />
            <SummaryRow label="This month" value={<span className="text-danger">Not refunded</span>} />
            <SummaryRow label="Change your mind" value={`Undo before ${day(cancelTarget.current_period_end)}`} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
