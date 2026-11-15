'use client';

/**
 * Tutor Wallet, new UI — /tutor/wallet. Canvas: m20 (wallet), m20b (no payout
 * account), d08 (desktop), m31 (payout account sheet).
 *
 * DATA. Everything comes from the existing endpoints; no new money logic:
 * - GET /api/tutor/wallet: balances (pending = escrow, available = queued for
 *   the next bank transfer, held, debt) and up to 200 ledger rows. Class rows
 *   now carry the charged amount, the list price and the platform fee from
 *   subscription_payments, so each row shows the REAL commission, never the
 *   design's illustrative "10%".
 * - GET/POST /api/tutor/payout-account: the bank account (TTD only here).
 *
 * MAPPED FROM THE DESIGN
 * - "Next payout" = available_ttd (release_ready, in the next transfer batch).
 *   The design's "Paid automatically Fri 13 Nov" needs payout cycles, which
 *   exist only on staging (mig 266), not on this branch. The line says "on the
 *   next payout cycle" until they land.
 * - "Pending" = pending_ttd (escrow; clears 7 days after a lesson, as the old
 *   page said). Secured-spot money and admin holds are itemised under it.
 * - "Paid this month" = released rows with released_at this month.
 * - "Refunded" = reversed rows created this month; hidden at zero.
 * - Payments: phone list / desktop table with Price, Discount, Fee, You receive.
 *
 * KEPT FROM THE OLD PAGE, not in the design: the platform-debt card (money the
 * next payout batch will deduct). Hiding it is how a short payout becomes a
 * support ticket.
 *
 * NOT BUILT: the USD payout currency (m31b; USD payouts are staging-only), the
 * "Coupons & scholarships" row (Grow is Insights only), failed-charge rows and
 * the "Needs your attention" card (the ledger only holds money that arrived),
 * the old per-student breakdown, projected/tentative figures and the
 * "Statements coming soon" tab.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Bank } from '@phosphor-icons/react';
import { Button, Card, Segmented, Tag } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';
import { TT_BANKS } from '@/components/tutor/PayoutSetupModal';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorV2Shell from './TutorV2Shell';

const TZ = 'America/Port_of_Spain';

type RowStatus = 'in_escrow' | 'awaiting_transfer' | 'paid' | 'reversed' | 'under_review' | 'unknown';

type Row = {
  ledger_id: string;
  amount_ttd: number;
  status: RowStatus;
  created_at: string;
  released_at: string | null;
  scheduled_start_at: string | null;
  charge_amount_ttd: number | null;
  platform_fee_ttd: number | null;
  list_price_ttd?: number | null;
  student_name: string | null;
  subject_name: string | null;
  source_type: 'session' | 'subscription';
};

type Wallet = {
  balances: {
    pending_ttd: number;
    available_ttd: number;
    lifetime_paid_ttd: number;
    held_ttd: number;
    pending_deductions_ttd: number;
  };
  secured_held?: { totalTtd: number; students: number; earliestRelease: string | null };
  pending_deductions: { id: string; amount_ttd: number; reason: string; created_at: string }[];
  history: Row[];
};

type Account = {
  payout_name: string | null;
  payout_account_identifier: string | null;
  bank_name: string | null;
  branch: string | null;
  account_type: string | null;
  verified_at: string | null;
};

const STATUS: Record<RowStatus, { label: string; tone: 'brand' | 'warning' | 'outline' | 'danger' | 'dark' }> = {
  paid: { label: 'Paid', tone: 'brand' },
  awaiting_transfer: { label: 'Next payout', tone: 'dark' },
  in_escrow: { label: 'Pending', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'warning' },
  reversed: { label: 'Refunded', tone: 'danger' },
  unknown: { label: 'Processing', tone: 'outline' },
};

const DEBT_REASON: Record<string, string> = {
  student_removal_refund: 'Student removal refund',
  chargeback: 'Chargeback',
  cash_commission: 'iTutor share of a cash payment',
};

function ttd(n: number): string {
  return `TT$${n.toLocaleString('en-TT', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
}

function rowDate(r: Row): string {
  return r.scheduled_start_at ?? r.created_at;
}

function last4(n: string | null | undefined): string {
  const d = (n ?? '').replace(/\s+/g, '');
  return d.length > 4 ? d.slice(-4) : d;
}

function monthStart(): number {
  // Month boundary in Trinidad time (AST, UTC-4, no DST).
  const now = new Date(Date.now() - 4 * 3600e3);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) + 4 * 3600e3;
}

export default function TutorWalletV2() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState(false);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [sheet, setSheet] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!profileLoading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [profile, profileLoading, router]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [w, a] = await Promise.all([
        fetch('/api/tutor/wallet', { cache: 'no-store' }),
        fetch('/api/tutor/payout-account', { cache: 'no-store' }),
      ]);
      if (!w.ok) throw new Error('wallet');
      setWallet((await w.json()) as Wallet);
      setAccount(a.ok ? (((await a.json()) as { account: Account | null }).account ?? null) : null);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (profile?.id) void load();
  }, [profile?.id, load]);

  const history = useMemo(() => wallet?.history ?? [], [wallet]);
  const b = wallet?.balances;

  const { paidThisMonth, refunded, lastRefund } = useMemo(() => {
    const start = monthStart();
    let paid = 0;
    let ref = 0;
    let last: Row | null = null;
    for (const r of history) {
      if (r.status === 'paid' && r.released_at && new Date(r.released_at).getTime() >= start) paid += r.amount_ttd;
      if (r.status === 'reversed' && new Date(r.created_at).getTime() >= start) {
        ref += r.amount_ttd;
        if (!last) last = r;
      }
    }
    return { paidThisMonth: Math.round(paid * 100) / 100, refunded: Math.round(ref * 100) / 100, lastRefund: last };
  }, [history]);

  const loading = profileLoading || !profile || (!wallet && !error) || account === undefined;
  const shown = showAll ? history : history.slice(0, 8);

  /* ---------- pieces ---------- */

  const accountLine = account ? (
    <>
      to {account.bank_name}
      {last4(account.payout_account_identifier) ? ` ····${last4(account.payout_account_identifier)}` : ''} (TTD)
    </>
  ) : null;

  const hero = (
    <Card tone="feature" eyebrow="Next payout" className="gap-ds-3">
      <p className="m-0 font-display text-[40px] font-extrabold leading-[44px] tabular-nums text-on-ink">
        {ttd(b?.available_ttd ?? 0)}
      </p>
      {account ? (
        <>
          <p className="m-0 font-body text-[14px] leading-[20px] text-on-ink-muted">
            Sent by bank transfer on the next payout cycle {accountLine}.
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => setSheet(true)} className="lg:hidden">
              Edit payout account
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 font-body text-[14px] leading-[20px] text-on-ink-muted">
            No payout account yet. Add one to get paid.
          </p>
          <div>
            <Button variant="primary" size="md" onClick={() => setSheet(true)}>
              Add payout account
            </Button>
          </div>
        </>
      )}
    </Card>
  );

  const secured = wallet?.secured_held;
  const stats = (
    <div className="grid grid-cols-2 gap-ds-3 lg:grid-cols-3">
      <Stat label="Pending" value={ttd(b?.pending_ttd ?? 0)} hint="Clears 7 days after each lesson">
        {secured && secured.totalTtd > 0 ? (
          <p className="m-0 text-[12px] leading-[16px] text-ink-muted">
            {ttd(secured.totalTtd)} of it is from {secured.students} secured spot{secured.students === 1 ? '' : 's'}, released
            {secured.earliestRelease ? ` from ${day(`${secured.earliestRelease}T12:00:00Z`)}` : ' once the first month is taught'}.
          </p>
        ) : null}
        {(b?.held_ttd ?? 0) > 0 ? (
          <p className="m-0 text-[12px] font-extrabold leading-[16px] text-ink">{ttd(b!.held_ttd)} under review by iTutor.</p>
        ) : null}
      </Stat>
      <Stat label="Paid this month" value={ttd(paidThisMonth)} hint="After commission" />
      {refunded > 0 ? (
        <Stat
          label="Refunded"
          value={ttd(refunded)}
          hint={lastRefund ? `${lastRefund.student_name ?? 'A student'} · ${day(lastRefund.created_at)}` : 'This month'}
        />
      ) : null}
    </div>
  );

  const debts = wallet?.pending_deductions ?? [];
  const debtCard =
    debts.length > 0 ? (
      <Card tone="alert" eyebrow="Owed to iTutor" title={`${ttd(b?.pending_deductions_ttd ?? 0)} comes off your next payout`}>
        <ul className="m-0 flex list-none flex-col gap-ds-2 p-0">
          {debts.map((d) => (
            <li key={d.id} className="flex items-baseline justify-between gap-ds-3 text-[14px]">
              <span className="min-w-0 text-ink">
                {DEBT_REASON[d.reason] ?? 'Adjustment'} <span className="text-ink-muted">· {day(d.created_at)}</span>
              </span>
              <span className="shrink-0 font-extrabold tabular-nums text-danger">−{ttd(Number(d.amount_ttd))}</span>
            </li>
          ))}
        </ul>
      </Card>
    ) : null;

  const empty = (
    <div className="flex flex-col items-center gap-ds-2 px-ds-4 py-ds-6 text-center">
      <p className="m-0 font-display text-[16px] font-extrabold text-ink">No payments yet</p>
      <p className="m-0 max-w-[320px] text-[13px] text-ink-muted">
        Payments from your students will show here once a family joins a class.
      </p>
    </div>
  );

  const phoneList = (
    <ul className="m-0 flex list-none flex-col p-0 lg:hidden">
      {shown.map((r) => {
        const st = STATUS[r.status] ?? STATUS.unknown;
        const fee = r.platform_fee_ttd;
        return (
          <li key={r.ledger_id} className="flex items-center gap-ds-3 bw-b-hair border-line-soft py-ds-3 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[15px] font-extrabold text-ink">{r.student_name ?? 'Student'}</span>
              <span className="block truncate text-[13px] text-ink-muted">
                {[r.subject_name ?? (r.source_type === 'session' ? '1:1 lesson' : 'Class'), day(rowDate(r)), fee != null ? `after ${ttd(fee)} fee` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-[4px]">
              <span className="font-display text-[15px] font-extrabold tabular-nums text-ink">{ttd(r.amount_ttd)}</span>
              <Tag tone={st.tone}>{st.label}</Tag>
            </span>
          </li>
        );
      })}
    </ul>
  );

  const cell = 'bw-b-hair border-line-soft py-ds-3 pr-ds-3 align-middle';
  const table = (
    <table className="hidden w-full border-collapse text-left text-[14px] lg:table">
      <thead>
        <tr className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
          {['Date', 'Learner', 'Price', 'Discount', 'Fee', 'You receive', 'Status'].map((h) => (
            <th key={h} className="bw-b-hair border-line-soft py-ds-2 pr-ds-3 font-extrabold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => {
          const st = STATUS[r.status] ?? STATUS.unknown;
          const list = r.list_price_ttd ?? r.charge_amount_ttd;
          const discount = r.list_price_ttd != null && r.charge_amount_ttd != null ? r.list_price_ttd - r.charge_amount_ttd : 0;
          return (
            <tr key={r.ledger_id}>
              <td className={cn(cell, 'whitespace-nowrap text-ink-muted')}>{day(rowDate(r))}</td>
              <td className={cell}>
                <span className="font-extrabold text-ink">{r.student_name ?? 'Student'}</span>
                <span className="text-ink-muted"> · {r.subject_name ?? (r.source_type === 'session' ? '1:1 lesson' : 'Class')}</span>
              </td>
              <td className={cn(cell, 'tabular-nums')}>{list != null ? ttd(list) : '—'}</td>
              <td className={cn(cell, 'tabular-nums')}>{discount > 0 ? `−${ttd(discount)}` : '—'}</td>
              <td className={cn(cell, 'tabular-nums')}>{r.platform_fee_ttd != null ? ttd(r.platform_fee_ttd) : '—'}</td>
              <td className={cn(cell, 'font-extrabold tabular-nums text-ink')}>{ttd(r.amount_ttd)}</td>
              <td className={cell}>
                <Tag tone={st.tone}>{st.label}</Tag>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const payments = (
    <Card className="gap-ds-2">
      <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Payments</h2>
      {history.length === 0 ? (
        empty
      ) : (
        <>
          {phoneList}
          {table}
          {history.length > shown.length ? (
            <div>
              <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
                Show all {history.length}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );

  const accountCard = (
    <Card eyebrow="Payout account" className="hidden gap-ds-3 lg:flex">
      {account ? (
        <>
          <div className="flex items-center gap-ds-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-full bg-surface-sunken text-ink" aria-hidden>
              <Bank size={20} weight="bold" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[16px] font-extrabold text-ink">{account.bank_name}</span>
              <span className="block text-[13px] text-ink-muted">
                Ending {last4(account.payout_account_identifier) || '—'} · paid in TTD
              </span>
            </span>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={() => setSheet(true)}>
              Edit payout account
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[14px] text-ink-muted">Add a bank account so iTutor can pay you.</p>
          <div>
            <Button variant="primary" size="sm" onClick={() => setSheet(true)}>
              Add payout account
            </Button>
          </div>
        </>
      )}
    </Card>
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex flex-col gap-ds-3" aria-busy>
        <div className="h-[180px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[96px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[240px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  } else if (error || !wallet) {
    body = (
      <Card title="Your wallet didn’t load" body="Check your connection and try again.">
        <div>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  } else {
    body = (
      <div className="grid gap-ds-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-ds-4">
          {hero}
          {stats}
          {debtCard}
          {payments}
        </div>
        <div className="flex min-w-0 flex-col gap-ds-4">{accountCard}</div>
      </div>
    );
  }

  return (
    <TutorV2Shell width="wide" title="Wallet">
      <div className="flex flex-col gap-ds-4">
        <h1 className="ds-page-title">Wallet</h1>
        {body}
      </div>
      <PayoutAccountSheet
        open={sheet}
        account={account ?? null}
        fallbackName={profile?.full_name ?? ''}
        onClose={() => setSheet(false)}
        onSaved={() => {
          setSheet(false);
          void load();
        }}
      />
    </TutorV2Shell>
  );
}

function Stat({ label, value, hint, children }: { label: string; value: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-[4px] rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">{label}</span>
      <span className="font-display text-[24px] font-extrabold leading-[28px] tabular-nums text-ink">{value}</span>
      {hint ? <span className="text-[12px] leading-[16px] text-ink-muted">{hint}</span> : null}
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-ds-btn bw-hair border-border bg-surface-card px-ds-3 py-[10px] font-body text-[16px] text-ink placeholder:text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-60';

/**
 * m31 — the same fields and POST as PayoutSetupModal (bank, branch, holder,
 * account number, account type). TTD only on this branch, so there is no
 * currency switch. Saving clears verified_at server-side, as before.
 */
function PayoutAccountSheet({
  open,
  account,
  fallbackName,
  onClose,
  onSaved,
}: {
  open: boolean;
  account: Account | null;
  fallbackName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [bank, setBank] = useState('');
  const [branch, setBranch] = useState('');
  const [type, setType] = useState<'chequing' | 'savings'>('chequing');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(account?.payout_name ?? fallbackName);
    setNumber(account?.payout_account_identifier ?? '');
    setBank(account?.bank_name ?? '');
    setBranch(account?.branch ?? '');
    setType(account?.account_type === 'savings' ? 'savings' : 'chequing');
    setErr(null);
  }, [open, account, fallbackName]);

  const branches = TT_BANKS[bank]?.branches ?? [];
  const ready = name.trim() && number.trim() && bank && branch;

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/tutor/payout-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payout_name: name.trim(),
          payout_account_identifier: number.trim(),
          bank_name: bank,
          branch,
          account_type: type,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'That did not save. Try again.');
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Payout account"
      footer={
        <Button variant="primary" size="lg" block disabled={!ready || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <div className="flex flex-col gap-ds-4">
        <p className="m-0 text-[14px] leading-[20px] text-ink-muted">
          Where we send your payouts. Payouts are paid in TTD by bank transfer.
        </p>
        <label className="flex flex-col gap-ds-2">
          <span className="text-[14px] font-extrabold text-ink">Bank</span>
          <select
            value={bank}
            onChange={(e) => {
              setBank(e.target.value);
              setBranch('');
            }}
            className={inputCls}
          >
            <option value="">Choose your bank</option>
            {Object.keys(TT_BANKS).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {bank && !TT_BANKS[bank] ? <option value={bank}>{bank}</option> : null}
          </select>
        </label>
        <label className="flex flex-col gap-ds-2">
          <span className="text-[14px] font-extrabold text-ink">Branch</span>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} disabled={!bank} className={inputCls}>
            <option value="">{bank ? 'Choose a branch' : 'Choose a bank first'}</option>
            {branches.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {branch && !branches.includes(branch) ? <option value={branch}>{branch}</option> : null}
          </select>
        </label>
        <label className="flex flex-col gap-ds-2">
          <span className="text-[14px] font-extrabold text-ink">Account holder</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="As it appears on your bank statement"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-ds-2">
          <span className="text-[14px] font-extrabold text-ink">Account number</span>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className={cn(inputCls, 'tabular-nums')}
          />
        </label>
        <div className="flex flex-col gap-ds-2">
          <span className="text-[14px] font-extrabold text-ink">Account type</span>
          <Segmented
            label="Account type"
            options={[
              { id: 'chequing', label: 'Chequing' },
              { id: 'savings', label: 'Savings' },
            ]}
            value={type}
            onChange={setType}
          />
        </div>
        <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
          Your payout account is separate from the optional Verified badge.
        </p>
        {err ? (
          <p role="alert" className="m-0 text-[13px] font-extrabold text-danger">
            {err}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
