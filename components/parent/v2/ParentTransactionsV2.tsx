'use client';

/**
 * Payment history, new UI. Reached from Billing › "Payment history and
 * receipts".
 *
 * PROVISIONAL VISUALS: there is no Figma frame for this screen. It is built
 * from the system's own parts (NavRow rows, SummaryRow receipt) in the shape
 * the Billing frames use, and should be checked against a frame when one exists.
 *
 * What changed from the old page: the "Total paid / Transactions" tiles are
 * gone (Billing already shows this month's total, and a lifetime sum with no
 * period beside it answered no question a parent asked), and every row now
 * opens a receipt.
 */

import { useMemo, useState } from 'react';
import { useProfile } from '@/lib/hooks/useProfile';
import { NavRow, SubjectTile, SummaryRow, Tag } from '@/components/ui';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { Sheet } from './Sheet';
import { subjectCode, subjectColor } from './subjectTile';
import { useParentTransactions, type TxnRow } from './useParentTransactions';

const TT = new Intl.NumberFormat('en-TT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (n: number) => `TT$${TT.format(n)}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const monthKey = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const STATUS: Record<string, { label: string; tone: 'brand' | 'warning' | 'danger' | 'outline' }> = {
  PAID: { label: 'Paid', tone: 'brand' },
  PENDING: { label: 'Pending', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'outline' },
};
const statusOf = (s: string) => STATUS[s] ?? STATUS.PENDING;

/**
 * The history itself, with its receipt sheet. Used by this screen and, from
 * lg up, inline on Billing, so the two can never list different payments.
 */
export function PaymentHistory({ limit }: { limit?: number } = {}) {
  const { profile } = useProfile();
  const { txns, loading } = useParentTransactions(profile?.id);
  const [open, setOpen] = useState<TxnRow | null>(null);

  const groups = useMemo(() => {
    const out: { month: string; rows: TxnRow[] }[] = [];
    for (const t of txns) {
      const m = monthKey(t.created_at);
      const last = out[out.length - 1];
      if (last && last.month === m) last.rows.push(t);
      else out.push({ month: m, rows: [t] });
    }
    return out;
  }, [txns]);

  const shownGroups = useMemo(() => {
    if (!limit) return groups;
    let left = limit;
    const out: typeof groups = [];
    for (const g of groups) {
      if (left <= 0) break;
      out.push({ month: g.month, rows: g.rows.slice(0, left) });
      left -= g.rows.length;
    }
    return out;
  }, [groups, limit]);

  return (
    <>
      {loading && profile?.id ? (
        <DetailSkeleton rows={4} />
      ) : txns.length === 0 ? (
        <EmptyCard
          title="No payments yet"
          body="Receipts appear here once one of your children joins a paid class."
        />
      ) : (
        shownGroups.map((g) => (
          <section key={g.month} className="flex flex-col gap-ds-2">
            <h2 className="font-display text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">
              {g.month}
            </h2>
            {g.rows.map((t) => {
              const st = statusOf(t.status);
              const refund = t.status === 'REFUNDED';
              return (
                <NavRow
                  key={t.id}
                  onClick={() => setOpen(t)}
                  tile={<SubjectTile code={subjectCode(t.class_name)} color={subjectColor(t.class_name)} size={44} />}
                  title={
                    <span className="flex items-baseline justify-between gap-ds-2">
                      <span className="truncate">{t.class_name}</span>
                      <span className="shrink-0 tabular-nums">{refund ? '−' : ''}{money(t.amount_ttd)}</span>
                    </span>
                  }
                  meta={
                    <span className="flex flex-wrap items-center gap-ds-2">
                      <span>{t.student_name} · {day(t.created_at)}</span>
                      {t.status !== 'PAID' ? <Tag tone={st.tone}>{st.label}</Tag> : null}
                    </span>
                  }
                />
              );
            })}
          </section>
        ))
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title="Receipt">
        {open ? (
          <>
            <div className="flex items-center gap-ds-3">
              <SubjectTile code={subjectCode(open.class_name)} color={subjectColor(open.class_name)} size={44} />
              <div className="min-w-0">
                <p className="truncate font-display text-[16px] font-extrabold text-ink">{open.class_name}</p>
                <p className="font-body text-[13px] text-ink-muted">For {open.student_name}</p>
              </div>
            </div>
            <div className="flex flex-col rounded-ds-card bw-hair border-border">
              <SummaryRow label="Amount" value={`${open.status === 'REFUNDED' ? '−' : ''}${money(open.amount_ttd)}`} emphasis="value" />
              <SummaryRow label="Status" value={statusOf(open.status).label} />
              <SummaryRow label="Date" value={`${day(open.created_at)} · ${time(open.created_at)}`} />
              <SummaryRow label="What for" value="Monthly class fee" />
              <SummaryRow label="Reference" value={<span className="font-mono text-[12px]">{open.id.slice(0, 8).toUpperCase()}</span>} />
            </div>
            <p className="font-body text-[13px] text-ink-muted">
              The amount is what you paid in cash. Any part covered by iTutor credits is not included.
              {open.status === 'FAILED' ? ' This payment did not go through and nothing was taken.' : ''}
            </p>
          </>
        ) : null}
      </Sheet>
    </>
  );
}

export default function ParentTransactionsV2() {
  return (
    <DetailScreen backLabel="Billing" fallbackHref="/parent/billing" title="Payment history">
      <PaymentHistory />
    </DetailScreen>
  );
}
