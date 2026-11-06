'use client';

/**
 * Family calendar, new UI. Reached from Settings › Calendar.
 *
 * PROVISIONAL VISUALS: no Figma frame. An agenda grouped by date, each day
 * under a dark date tile, built from system parts.
 *
 * Changes from the old page: the seven-column week strip is gone (it panned
 * sideways on a phone and its labels were 10px). What a parent opens this for
 * is "what is next", which the agenda answers. Child colours stay, but only as
 * an accent beside a name, never as the only thing identifying a child.
 *
 * Rules carried over unchanged:
 * - Upcoming classes carry no attendance value. Only past ones are marked.
 * - Every attendance figure carries its denominator (§6): the server's
 *   rateLabel is shown as given, never recomputed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';

type Child = { id: string; name: string; color: string };
type PerChild = { childId: string; rateLabel: string; counted: number };
type Outcome = 'attended' | 'late' | 'absent' | 'cancelled' | 'excluded';
type Event = {
  key: string;
  childId: string;
  title: string;
  tutorName: string | null;
  start: string;
  end: string | null;
  type: '1:1' | 'group';
  past: boolean;
  outcome: Outcome | null;
  lateMinutes: number | null;
};

const TZ = 'America/Port_of_Spain';
const OUTCOME: Record<Outcome, { label: string; tone: 'brand' | 'warning' | 'danger' | 'outline' }> = {
  attended: { label: 'Attended', tone: 'brand' },
  late: { label: 'Late', tone: 'warning' },
  absent: { label: 'Absent', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'outline' },
  excluded: { label: 'Didn’t run', tone: 'outline' },
};

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });

function DateTile({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <span className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-ds-sm bg-ink text-on-ink">
      <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-on-ink-muted">
        {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: TZ })}
      </span>
      <span className="font-display text-[20px] font-extrabold leading-[22px]">
        {d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: TZ })}
      </span>
    </span>
  );
}

function dayHeading(iso: string): string {
  const k = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000).toISOString());
  const label = new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TZ });
  if (k === today) return `Today · ${label}`;
  if (k === tomorrow) return `Tomorrow · ${label}`;
  return label;
}

export default function ParentCalendarV2() {
  const [children, setChildren] = useState<Child[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [perChild, setPerChild] = useState<PerChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [only, setOnly] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    fetch('/api/parent/calendar', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setChildren(j.children ?? []);
        setEvents(j.events ?? []);
        setPerChild(j.perChild ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const byId = useMemo(() => new Map(children.map((c) => [c.id, c])), [children]);
  const shown = events.filter((e) => !only || e.childId === only);

  const group = (list: Event[]) => {
    const out: { key: string; first: string; items: Event[] }[] = [];
    for (const e of list) {
      const k = dayKey(e.start);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(e);
      else out.push({ key: k, first: e.start, items: [e] });
    }
    return out;
  };

  const upcoming = group(
    shown.filter((e) => !e.past).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  );
  const past = group(
    shown.filter((e) => e.past).sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
  );

  const rates = perChild.filter((p) => p.counted > 0 && (!only || p.childId === only));

  const renderDay = (d: { key: string; first: string; items: Event[] }) => (
    <section key={d.key} className="flex gap-ds-3">
      <DateTile iso={d.first} />
      <div className="flex min-w-0 flex-1 flex-col gap-ds-2">
        <h2 className="pt-[2px] font-display text-[15px] font-extrabold text-ink">{dayHeading(d.first)}</h2>
        {d.items.map((e) => {
          const child = byId.get(e.childId);
          const out = e.past && e.outcome ? OUTCOME[e.outcome] : null;
          return (
            <div
              key={e.key}
              className="flex flex-col gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card p-ds-card"
            >
              <p className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{e.title}</p>
              <p className="font-body text-[13px] text-ink-muted">
                {time(e.start)}
                {e.end ? ` to ${time(e.end)}` : ''}
                {e.tutorName ? ` · ${e.tutorName}` : ''}
                {e.type === '1:1' ? ' · 1:1' : ''}
              </p>
              <div className="flex flex-wrap items-center gap-ds-2 pt-[2px]">
                {child && children.length > 1 ? (
                  <span className="inline-flex items-center gap-ds-1 font-body text-[13px] font-extrabold text-ink">
                    <span className="h-[10px] w-[10px] rounded-ds-full" style={{ background: child.color }} aria-hidden />
                    {child.name.split(' ')[0]}
                  </span>
                ) : null}
                {out ? (
                  <Tag tone={out.tone}>
                    {out.label}
                    {e.outcome === 'late' && e.lateMinutes ? ` · ${e.lateMinutes} min` : ''}
                  </Tag>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Calendar">
      {loading ? (
        <DetailSkeleton rows={3} />
      ) : events.length === 0 ? (
        <EmptyCard title="Nothing on the calendar" body="Classes and 1:1 sessions your children are booked into show up here." />
      ) : (
        <>
          {children.length > 1 ? (
            <div role="tablist" aria-label="Child" className="flex flex-wrap gap-ds-2">
              {[{ id: null as string | null, name: 'Everyone', color: '' }, ...children].map((c) => {
                const active = only === c.id;
                return (
                  <button
                    key={c.id ?? 'all'}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setOnly(c.id)}
                    className={cn(
                      'inline-flex items-center gap-ds-2 rounded-ds-full bw-bold border-ink px-ds-4 py-ds-2 font-display text-[14px] font-extrabold cursor-pointer',
                      active ? 'bg-ink text-on-ink' : 'bg-surface-card text-ink'
                    )}
                  >
                    {c.color ? <span className="h-[10px] w-[10px] rounded-ds-full" style={{ background: c.color }} aria-hidden /> : null}
                    {c.id ? c.name.split(' ')[0] : c.name}
                  </button>
                );
              })}
            </div>
          ) : null}

          {rates.length > 0 ? (
            <div className="flex flex-col gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
              <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">Attendance</span>
              {rates.map((r) => (
                <span key={r.childId} className="font-body text-[14px] text-ink">
                  {children.length > 1 ? <strong>{byId.get(r.childId)?.name.split(' ')[0]} · </strong> : null}
                  {r.rateLabel}
                </span>
              ))}
            </div>
          ) : null}

          {upcoming.length === 0 ? (
            <EmptyCard title="Nothing coming up" body="No classes or sessions are booked ahead." />
          ) : (
            upcoming.map(renderDay)
          )}

          {past.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="self-start border-0 bg-transparent p-0 font-display text-[15px] font-extrabold text-ink underline underline-offset-4 cursor-pointer"
              >
                {showPast ? 'Hide past sessions' : `Show past sessions · ${past.reduce((n, d) => n + d.items.length, 0)}`}
              </button>
              {showPast ? past.map(renderDay) : null}
            </>
          ) : null}
        </>
      )}
    </DetailScreen>
  );
}
