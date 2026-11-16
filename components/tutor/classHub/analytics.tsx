'use client';

// Class hub: analytics. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
// tab can be redrawn in the new UI on its own. Redrawn in the design system the
// same day; the figures are computed exactly as before.

// Real figures only. Enrollment is derived from each member's own joinedAt;
// money comes from the group's actual totals. There is deliberately no
// revenue-by-month chart: the client has a collected TOTAL but no per-month
// payment history, and a tutor's earnings are the last thing to guess at.

import { BarChart3 } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { GroupDetail, GroupMember, EmptyState, MomCard, StatCard, ChartCard } from './shared';

export function AnalyticsTab({ group, members }: { group: GroupDetail; members: GroupMember[] }) {
  const activeCount = members.filter((m) => ['active', 'approved'].includes(m.status)).length;
  const collected = group.earningsTtd ?? 0;
  const outstanding = members.reduce((s, m) => s + (m.paymentStatus === 'overdue' ? (m.outstandingTtd ?? 0) : 0), 0);

  // Trailing six months ending with the current one, from the real clock.
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      count: 0,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const m of members) {
    if (!m.joinedAt) continue;
    const d = new Date(m.joinedAt);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) bucket.count += 1;
  }

  const joins = buckets.map((b) => b.count);
  const maxJoins = Math.max(...joins, 1);
  const joinedInWindow = joins.reduce((s, v) => s + v, 0);
  const thisMonth = joins[joins.length - 1];
  const prevMonth = joins[joins.length - 2];
  // A percentage change off a zero baseline is meaningless — show nothing.
  const momE = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : null;
  // max bar height in px (ChartCard's plot is h-40 = 160px; ~32px reserved for
  // the count and month labels and their gaps)
  const BAR_MAX_PX = 112;

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="grid grid-cols-2 gap-ds-3 lg:grid-cols-4">
        {momE === null ? (
          <StatCard label="Enrollment MoM" value="—" hint="No joins last month to compare against" />
        ) : (
          <MomCard label="Enrollment MoM" value={`${momE > 0 ? '+' : ''}${momE}%`} positive={momE >= 0} />
        )}
        <StatCard label="Active members" value={`${activeCount}${group.capacity ? ` / ${group.capacity}` : ''}`} />
        <StatCard label="Collected (TTD)" value={fmtTTD(collected)} />
        <StatCard label="Outstanding (TTD)" value={fmtTTD(outstanding)} />
      </div>
      {joinedInWindow === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No enrolments yet"
          body="Once students join this class, their sign-ups will show up here month by month."
        />
      ) : (
        <ChartCard title="New members by month" caption={`${joinedInWindow} in the last 6 months`}>
          {joins.map((v, i) => (
            <div key={buckets[i].key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-ds-1 self-stretch">
              <div className="text-[12px] font-extrabold tabular-nums text-ink">{v > 0 ? v : ''}</div>
              {/* Empty track to the full height, filled from the bottom. */}
              <div className="flex w-full max-w-[56px] shrink-0 items-end overflow-hidden rounded-t-ds-xs bg-surface-sunken" style={{ height: `${BAR_MAX_PX}px` }}>
                <div
                  className="w-full rounded-t-ds-xs bg-brand"
                  style={{ height: `${Math.round((v / maxJoins) * BAR_MAX_PX)}px` }}
                />
              </div>
              <div className="shrink-0 text-[12px] font-bold text-ink-muted">{buckets[i].label}</div>
            </div>
          ))}
        </ChartCard>
      )}
    </div>
  );
}
