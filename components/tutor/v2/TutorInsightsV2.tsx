'use client';

/**
 * Tutor Insights, new UI — /tutor/analytics. Canvas m21 (phone) and d09
 * (desktop). Data: GET /api/tutor/insights?period=day|week|month (definitions
 * in that route).
 *
 * Changed from the canvas, on purpose:
 * - "Time saved" is not shipped (no source; owner decision). Its tile is
 *   "Renewals", which the canvas's own legend defines.
 * - "Class views" is left out: link tracking exists on staging only, not on
 *   this branch's base. Add it when the branch meets staging.
 * - "2 via your link" under New students needs the same link tracking; the
 *   hint says where the figure comes from instead.
 * - The "?" bubbles are folded into "What these mean" at the foot.
 * Export downloads a CSV of exactly what is on screen.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DownloadSimple } from '@phosphor-icons/react';
import { Button, Segmented, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorV2Shell from './TutorV2Shell';

type Period = 'day' | 'week' | 'month';
type Insights = {
  period: Period;
  start: string;
  end: string;
  newStudents: number;
  lessons: { group: number; oneToOne: number };
  collected: number;
  renewals: number;
  revenue: { label: string; amount: number; share: number }[];
  days: { date: string; newStudents: number }[];
};

const TZ = 'America/Port_of_Spain';

function money(n: number) {
  return `TT$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function rangeLabel(d: Insights) {
  const f = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }).format(new Date(iso));
  if (d.period === 'day') return f(d.start, { weekday: 'long', day: 'numeric', month: 'short' });
  if (d.period === 'month') return f(d.start, { month: 'long', year: 'numeric' });
  // Monday to Sunday of this week.
  const last = d.days[d.days.length - 1]?.date;
  const sunday = last ? `${last}T16:00:00Z` : d.end;
  return `${f(d.start, { day: 'numeric' })} – ${f(sunday, { day: 'numeric', month: 'short' })}`;
}

function dayLabel(date: string, period: Period) {
  const dt = new Date(`${date}T12:00:00Z`);
  return period === 'week'
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(dt)
    : String(dt.getUTCDate());
}

export default function TutorInsightsV2() {
  return (
    <TutorV2Shell title="Insights" width="wide">
      <InsightsBody />
    </TutorV2Shell>
  );
}

function InsightsBody() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') router.push('/login');
  }, [profile, loading, router]);

  const load = useCallback(async (p: Period) => {
    setData(null);
    setError(false);
    try {
      const res = await fetch(`/api/tutor/insights?period=${p}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.data) throw new Error();
      setData(json.data as Insights);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'tutor') void load(period);
  }, [profile?.role, period, load]);

  const exportCsv = () => {
    if (!data) return;
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ['Insights', rangeLabel(data)],
      [],
      ['New students', data.newStudents],
      ['Lessons taught (group)', data.lessons.group],
      ['Lessons taught (one-on-one)', data.lessons.oneToOne],
      ['Collected before fees (TTD)', data.collected],
      ['Renewals', data.renewals],
      [],
      ['Class', 'Collected (TTD)', 'Share %'],
      ...data.revenue.map((r) => [r.label, r.amount, r.share]),
      ...(data.days.length ? [[], ['Date', 'New students'], ...data.days.map((d) => [d.date, d.newStudents])] : []),
    ];
    const csv = lines.map((l) => l.map(q).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `itutor-insights-${data.period}-${data.start.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lessonsTotal = data ? data.lessons.group + data.lessons.oneToOne : 0;
  const maxDay = data ? Math.max(1, ...data.days.map((d) => d.newStudents)) : 1;

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex flex-wrap items-end justify-between gap-ds-3">
        <div className="flex flex-col gap-ds-1">
          <div className="flex items-center gap-ds-2">
            <h1 className="ds-page-title m-0">Insights</h1>
            <Tag tone="outline">Private to you</Tag>
          </div>
          <p className="m-0 text-[15px] text-ink-muted">{data ? `Your ${period === 'day' ? 'day' : period}: ${rangeLabel(data)}` : ' '}</p>
        </div>
        <div className="hidden lg:block">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <span className="inline-flex items-center gap-ds-1">
              <DownloadSimple size={18} weight="bold" aria-hidden /> Export
            </span>
          </Button>
        </div>
      </div>

      <div className="lg:max-w-[420px]">
        <Segmented
          label="Period"
          options={[
            { id: 'day', label: 'Day' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-ds-2 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-4">
          <p className="m-0 text-[15px] font-bold text-ink">We couldn&apos;t load your insights.</p>
          <Button variant="outline" size="sm" onClick={() => void load(period)}>
            Try again
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-ds-3 lg:grid-cols-4">
        <Stat label="New students" value={data ? String(data.newStudents) : null} hint="Joined your classes" />
        <Stat
          label="Lessons taught"
          value={data ? String(lessonsTotal) : null}
          hint={data ? `${data.lessons.group} group, ${data.lessons.oneToOne} one-on-one` : ' '}
        />
        <Stat label="Collected" value={data ? money(data.collected) : null} hint="Before fees" />
        <Stat label="Renewals" value={data ? String(data.renewals) : null} hint="Paid again for a class" />
      </div>

      <div className="grid gap-ds-4 xl:grid-cols-2 xl:items-start">
        {period !== 'day' ? (
          <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
            <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">New students per day</h2>
            {data ? (
              data.newStudents === 0 ? (
                <p className="m-0 text-[14px] text-ink-muted">No new students this {period}.</p>
              ) : (
                <div
                  role="img"
                  aria-label={`New students per day: ${data.days
                    .filter((d) => d.newStudents > 0)
                    .map((d) => `${dayLabel(d.date, period)} ${d.newStudents}`)
                    .join(', ')}`}
                  className="flex h-[160px] items-end gap-[3px]"
                >
                  {data.days.map((d) => (
                    <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[4px]">
                      {d.newStudents > 0 ? <span className="text-[12px] font-extrabold text-ink">{d.newStudents}</span> : null}
                      <div
                        className={cn('w-full max-w-[36px] rounded-t-[4px]', d.newStudents > 0 ? 'bg-brand' : 'bg-line-soft')}
                        style={{ height: d.newStudents > 0 ? `${Math.max(6, (d.newStudents / maxDay) * 110)}px` : '3px' }}
                      />
                      <span
                        className={cn(
                          'text-[11px] font-bold text-ink-muted',
                          period === 'month' && Number(dayLabel(d.date, period)) % 5 !== 1 && 'invisible'
                        )}
                      >
                        {dayLabel(d.date, period)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="h-[160px] animate-pulse rounded-ds-card bg-surface-sunken" />
            )}
          </section>
        ) : null}

        <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Revenue by class</h2>
          {data ? (
            data.revenue.length === 0 ? (
              <p className="m-0 text-[14px] text-ink-muted">Nothing collected this {period === 'day' ? 'day' : period} yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-ds-3 p-0">
                {data.revenue.map((r) => (
                  <li key={r.label} className="flex flex-col gap-[6px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-ds-3">
                      <span className="min-w-0 break-words text-[15px] font-extrabold text-ink">{r.label}</span>
                      <span className="text-[14px] font-bold tabular-nums text-ink-muted">
                        {money(r.amount)} · {r.share}%
                      </span>
                    </div>
                    <div className="h-[8px] w-full overflow-hidden rounded-ds-full bg-surface-sunken">
                      <div className="h-full rounded-ds-full bg-brand" style={{ width: `${Math.max(2, r.share)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="h-[120px] animate-pulse rounded-ds-card bg-surface-sunken" />
          )}
        </section>
      </div>

      <section className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
        <h2 className="m-0 font-display text-[16px] font-extrabold text-ink">What these mean</h2>
        <dl className="m-0 grid gap-ds-2 text-[14px] text-ink-muted">
          <Def term="New students">students whose seat in one of your classes started in this period.</Def>
          <Def term="Lessons taught">class sessions that ended and were not cancelled, plus completed one-on-one lessons.</Def>
          <Def term="Collected">what families paid, before fees.</Def>
          <Def term="Renewals">students who paid again for a class they had already paid for.</Def>
        </dl>
      </section>

      <div className="lg:hidden">
        <Button variant="outline" block onClick={exportCsv} disabled={!data}>
          <span className="inline-flex items-center gap-ds-1">
            <DownloadSimple size={18} weight="bold" aria-hidden /> Export
          </span>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | null; hint: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <span className="text-[13px] font-extrabold text-ink-muted">{label}</span>
      {value === null ? (
        <span className="my-[4px] h-[28px] w-[70%] animate-pulse rounded-ds-sm bg-surface-sunken" />
      ) : (
        <span className="break-words font-display text-[26px] font-extrabold leading-[34px] tabular-nums text-ink">{value}</span>
      )}
      <span className="text-[13px] text-ink-muted">{hint}</span>
    </div>
  );
}

function Def({ term, children }: { term: string; children: string }) {
  return (
    <div>
      <dt className="inline font-extrabold text-ink">{term}: </dt>
      <dd className="inline m-0">{children}</dd>
    </div>
  );
}
