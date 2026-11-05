'use client';

/**
 * Parent Billing, new UI — Figma `160:4095` (payment failed) and `160:4257`
 * (all paid).
 *
 * DATA SOURCE CHANGED, AND THIS IS THE ONE THING TO REVIEW. The old
 * /parent/billing read the `notifications` table and rendered an enrolment
 * activity log. The frames are not an activity log: they are a monthly total,
 * a billing-period meter, one row per enrolment with its status, and two links
 * onward. None of that is in a notification row.
 *
 * So this reads `/api/parent/billing`, which already existed and already
 * returns exactly those fields (`subscriptions[]` with amount, status and
 * nextCharge, plus `transactions[]`), scoped to this parent's children by
 * `requireParentContext`. It is an existing query, not a new data path — but
 * it is a different existing query from the one this route used yesterday,
 * which is why it is called out here and in the PR rather than buried.
 *
 * THE METER IS DERIVED, NOT STORED. The frame shows a 28-segment bar and
 * "19 days left". The API gives a next-charge date and nothing else, so the
 * period is taken as the 30 days ending on it. If a pause moved the renewal the
 * API has already adjusted that date, so the bar follows the real charge.
 * When there is no next charge — everything cancelled or paused by a tutor —
 * the meter is not drawn at all rather than shown empty, because an empty bar
 * reads as "nothing paid" rather than "nothing due".
 */

import { useCallback, useEffect, useState } from 'react';
import { withRequest } from '@/components/parent/v2/attention';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  NavRow,
  QuestProgress,
  SubjectTile,
  SummaryRow,
  Tag,
} from '@/components/ui';
import { subjectCode, subjectColor } from './subjectTile';

type Subscription = {
  id: string;
  /**
   * The CLASS id, not the enrolment id. /parent/classes/[groupId] is keyed
   * on the group, so routing with `id` sent every row to a page that does
   * not exist and fell through to the catalogue.
   */
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

type AttentionItem = {
  kind: 'approval' | 'payment' | 'feedback';
  id: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 0 });
const money = (n: number) => `TT$${TT.format(Math.round(n))}`;

const PERIOD_DAYS = 30;

function daysUntil(label: string | null): number | null {
  if (!label) return null;
  const when = Date.parse(label);
  if (Number.isNaN(when)) return null;
  const diff = Math.ceil((when - Date.now()) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

function statusTag(s: Subscription) {
  if (s.cancelled) return <Tag tone="outline">Cancelled</Tag>;
  if (s.paused) return <Tag tone="warning">{s.pausedByTutor ? 'Tutor break' : 'Paused'}</Tag>;
  if (s.cancelScheduled) return <Tag tone="outline">Ends soon</Tag>;
  return <Tag tone="brand">Active</Tag>;
}

export default function ParentBillingV2() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [failed, setFailed] = useState<AttentionItem | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [billingRes, attentionRes] = await Promise.all([
        fetch('/api/parent/billing', { cache: 'no-store' }),
        fetch('/api/parent/attention', { cache: 'no-store' }),
      ]);
      if (!billingRes.ok) throw new Error('billing failed');
      const billing = await billingRes.json();
      setSubs(billing.subscriptions ?? []);

      // The failed-payment card is the same item Home shows. A failure to load
      // it hides the card but must not take the whole page down — the totals
      // below are still true and still worth showing.
      if (attentionRes.ok) {
        const attention = await attentionRes.json();
        const items: AttentionItem[] = attention.items ?? [];
        setFailed(items.find((i) => i.kind === 'payment') ?? null);
      }
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-ds-card" aria-busy>
        <div className="h-[30px] w-1/3 animate-pulse rounded-ds-sm bg-surface-sunken" />
        <div className="h-[190px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[80px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[80px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-ds-card">
        <h1 className="font-display text-[28px] font-extrabold leading-[29.4px] tracking-[-0.28px] text-ink">
          Billing
        </h1>
        <Card
          title="We could not load your billing"
          body="Nothing has been charged or changed. Try again in a moment."
        >
          <Button variant="primary" block onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const active = subs.filter((s) => !s.cancelled);
  const monthly = active
    .filter((s) => !s.paused)
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const nextCharge = active.map((s) => s.nextCharge).filter(Boolean)[0] ?? null;
  const left = daysUntil(nextCharge);
  const elapsed = left === null ? null : Math.max(0, Math.min(PERIOD_DAYS, PERIOD_DAYS - left));

  return (
    <div className="flex flex-col gap-ds-card">
      <h1 className="font-display text-[28px] font-extrabold leading-[29.4px] tracking-[-0.28px] text-ink">
        Billing
      </h1>

      {failed ? (
        <Card tone="alert" tag={<Tag tone="danger">Payment failed</Tag>} title={failed.title} body={failed.detail}>
          <Button variant="danger" block onClick={() => router.push(withRequest(failed))}>
            {failed.actionLabel}
          </Button>
        </Card>
      ) : null}

      {active.length === 0 ? (
        <Card
          title="No classes to bill"
          body="Once your child joins a class, what you pay and when appears here."
        >
          <Button variant="primary" block onClick={() => router.push('/parent/classes')}>
            Explore classes
          </Button>
        </Card>
      ) : (
        <Card tone="feature" eyebrow="Monthly total">
          <div className="font-display text-[36px] font-extrabold leading-[36px] text-on-ink">
            {money(monthly)}
          </div>
          <div className="pb-ds-2 pt-[2px] text-[13px] leading-[18px] text-on-ink-muted">
            across {active.length} {active.length === 1 ? 'class' : 'classes'}
          </div>

          {nextCharge ? (
            <>
              <div className="h-px w-full bg-ink-raised" />
              <SummaryRow
                tone="ink"
                emphasis="label"
                label={`Next charge ${nextCharge}`}
                value={left === null ? '' : `${left} ${left === 1 ? 'day' : 'days'} left`}
                className="pb-[5px] pt-[13px]"
              />
              {elapsed !== null ? (
                <QuestProgress
                  variant="meter"
                  total={PERIOD_DAYS}
                  done={elapsed}
                  label={`${left} days until the next charge`}
                  className="pt-[6px]"
                />
              ) : null}
            </>
          ) : null}
        </Card>
      )}

      {active.map((s) => (
        <NavRow
          key={s.id}
          tile={<SubjectTile code={subjectCode(s.className)} color={subjectColor(s.className)} />}
          title={s.className}
          meta={
            <>
              <span>
                {s.amount > 0 ? `${money(s.amount)}/month` : 'Free'} ·
              </span>
              {statusTag(s)}
            </>
          }
          // The class itself, not the old subscriptions list. Figma has a
          // payment-detail screen here; until that exists the class page is
          // the real destination rather than a list the parent just left.
          onClick={() =>
            router.push(s.groupId ? `/parent/classes/${s.groupId}` : '/parent/my-classes')
          }
        />
      ))}

      <NavRow title="Payment history and receipts" onClick={() => router.push('/parent/transactions')} />
      {/*
        NOT /help: that is the marketing site, which renders "Get started"
        and "Log in" to a parent who is already signed in. Figma has a
        Billing help screen; until it exists this goes to the billing
        section of settings, which is a real answer to "how do I change
        what I am paying".
      */}
      <NavRow
        title="Billing help"
        onClick={() => router.push('/parent/settings?section=billing')}
      />
    </div>
  );
}
