'use client';

/**
 * Tutor one-on-one settings, new UI — /tutor/availability. Canvas m12.
 *
 * Same data as the old weekly grid: profiles.pause_1on1 (inverted: false =
 * families can book) and tutor_availability_rules (day_of_week, start_time,
 * end_time, AST). Families book inside these windows.
 *
 * Changed from the canvas, on purpose:
 * - No "Lesson length" or single "Price per lesson". Families choose the
 *   length when they book, and the price is the subject's hourly rate
 *   (tutor_subjects.price_per_hour_ttd), kept with the subject in Get listed.
 *   The rates are listed here read-only with a link there.
 * - Times are windows (from / to), not single start times, because that is
 *   what a rule is. 30-minute steps.
 *
 * Saving keeps what it did not touch. The old grid worked in whole hours and
 * rewrote every rule on save, which rounded away half-hour times (38 of 232
 * rules on staging have them) and reset slot_minutes. Here only a day whose
 * windows changed is rewritten, and a time that is not on the 30-minute grid
 * stays selectable so an untouched window round-trips exactly.
 *
 * Changing times does not touch bookings already made.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash } from '@phosphor-icons/react';
import { Button, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { notifyCompletionUpdated } from '@/lib/hooks/useTutorCompletion';
import { Switch } from '@/components/parent/v2/accountKit';
import TutorV2Shell from './TutorV2Shell';

type Win = { start: string; end: string };
type Rule = { id: string; day_of_week: number; start_time: string; end_time: string; slot_minutes: number | null };

/** Mon first, as families read a week; values are day_of_week (0 = Sun). */
const DAYS: { dow: number; short: string; long: string }[] = [
  { dow: 1, short: 'Mon', long: 'Monday' },
  { dow: 2, short: 'Tue', long: 'Tuesday' },
  { dow: 3, short: 'Wed', long: 'Wednesday' },
  { dow: 4, short: 'Thu', long: 'Thursday' },
  { dow: 5, short: 'Fri', long: 'Friday' },
  { dow: 6, short: 'Sat', long: 'Saturday' },
  { dow: 0, short: 'Sun', long: 'Sunday' },
];

const GRID: string[] = Array.from({ length: 49 }, (_, i) => {
  const m = i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}); // 00:00 … 24:00

/** "17:30:00" → "17:30"; an end of 00:00 means midnight. */
function hhmm(t: string, isEnd = false): string {
  const v = t.slice(0, 5);
  return isEnd && v === '00:00' ? '24:00' : v;
}

function mins(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function label(t: string) {
  if (t === '24:00') return 'Midnight';
  const [h, m] = t.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Sorted, with overlapping or touching windows joined. */
function normalise(wins: Win[]): Win[] {
  const s = wins.filter((w) => mins(w.end) > mins(w.start)).sort((a, b) => mins(a.start) - mins(b.start));
  const out: Win[] = [];
  for (const w of s) {
    const last = out[out.length - 1];
    if (last && mins(w.start) <= mins(last.end)) {
      if (mins(w.end) > mins(last.end)) last.end = w.end;
    } else out.push({ ...w });
  }
  return out;
}

const same = (a: Win[], b: Win[]) => a.length === b.length && a.every((w, i) => w.start === b[i].start && w.end === b[i].end);

function money(n: number) {
  return `TT$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export default function TutorOneOnOneV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [wins, setWins] = useState<Record<number, Win[]>>({});
  const [paused, setPaused] = useState<boolean | null>(null);
  const [accepting, setAccepting] = useState(true);
  const [rates, setRates] = useState<{ label: string; rate: number | null }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') router.push('/login');
  }, [profile, loading, router]);

  const load = async (tutorId: string) => {
    const [r, p, s] = await Promise.all([
      supabase
        .from('tutor_availability_rules')
        .select('id, day_of_week, start_time, end_time, slot_minutes')
        .eq('tutor_id', tutorId)
        .eq('is_active', true),
      supabase.from('profiles').select('pause_1on1').eq('id', tutorId).single(),
      supabase.from('tutor_subjects').select('price_per_hour_ttd, subjects(name, label)').eq('tutor_id', tutorId),
    ]);
    if (r.error) {
      setError('We couldn’t load your times. Refresh to try again.');
      return;
    }
    const list = (r.data ?? []) as Rule[];
    setRules(list);
    const byDay: Record<number, Win[]> = {};
    for (const x of list) (byDay[x.day_of_week] ??= []).push({ start: hhmm(x.start_time), end: hhmm(x.end_time, true) });
    for (const k of Object.keys(byDay)) byDay[Number(k)] = normalise(byDay[Number(k)]);
    setWins(byDay);
    const isPaused = Boolean((p.data as any)?.pause_1on1);
    setPaused(isPaused);
    setAccepting(!isPaused);
    setRates(
      (s.data ?? []).map((row: any) => {
        const sub = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
        return { label: (sub?.label || sub?.name || 'Subject') as string, rate: row.price_per_hour_ttd == null ? null : Number(row.price_per_hour_ttd) };
      })
    );
  };

  useEffect(() => {
    if (profile?.id && profile.role === 'tutor') void load(profile.id);
  }, [profile?.id, profile?.role]);

  /** Saved windows per day, for the dirty check and the per-day rewrite. */
  const savedByDay = useMemo(() => {
    const m: Record<number, Win[]> = {};
    for (const x of rules ?? []) (m[x.day_of_week] ??= []).push({ start: hhmm(x.start_time), end: hhmm(x.end_time, true) });
    for (const k of Object.keys(m)) m[Number(k)] = normalise(m[Number(k)]);
    return m;
  }, [rules]);

  const changedDays = DAYS.map((d) => d.dow).filter((dow) => !same(normalise(wins[dow] ?? []), savedByDay[dow] ?? []));
  const invalid = Object.values(wins).some((ws) => ws.some((w) => mins(w.end) <= mins(w.start)));
  const dirty = changedDays.length > 0 || (paused !== null && accepting === paused);
  const totalWindows = Object.values(wins).reduce((a, ws) => a + ws.length, 0);

  const touch = () => {
    setSaved(false);
    setError(null);
  };

  const toggleDay = (dow: number) => {
    touch();
    setWins((prev) => {
      const next = { ...prev };
      if (next[dow]?.length) delete next[dow];
      else next[dow] = savedByDay[dow]?.length ? savedByDay[dow].map((w) => ({ ...w })) : [{ start: '17:00', end: '19:00' }];
      return next;
    });
  };

  const setWin = (dow: number, i: number, patch: Partial<Win>) => {
    touch();
    setWins((prev) => ({ ...prev, [dow]: (prev[dow] ?? []).map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
  };

  const addWin = (dow: number) => {
    touch();
    setWins((prev) => {
      const ws = prev[dow] ?? [];
      const lastEnd = ws.length ? Math.max(...ws.map((w) => mins(w.end))) : 17 * 60;
      const start = Math.min(lastEnd + 60, 22 * 60);
      const t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return { ...prev, [dow]: [...ws, { start: t(start), end: t(Math.min(start + 60, 24 * 60)) }] };
    });
  };

  const removeWin = (dow: number, i: number) => {
    touch();
    setWins((prev) => {
      const ws = (prev[dow] ?? []).filter((_, j) => j !== i);
      const next = { ...prev };
      if (ws.length) next[dow] = ws;
      else delete next[dow];
      return next;
    });
  };

  const save = async () => {
    if (!profile || !rules) return;
    if (invalid) return setError('Each time needs to end after it starts.');
    setSaving(true);
    setError(null);
    try {
      if (paused !== null && accepting === paused) {
        const { error: e } = await supabase.from('profiles').update({ pause_1on1: !accepting } as any).eq('id', profile.id);
        if (e) throw e;
      }
      for (const dow of changedDays) {
        const old = rules.filter((r) => r.day_of_week === dow);
        const slot = old[0]?.slot_minutes ?? 60;
        if (old.length) {
          const { error: e } = await supabase.from('tutor_availability_rules').delete().in('id', old.map((r) => r.id));
          if (e) throw e;
        }
        const fresh = normalise(wins[dow] ?? []);
        if (fresh.length) {
          const { error: e } = await supabase.from('tutor_availability_rules').insert(
            fresh.map((w) => ({
              tutor_id: profile.id,
              day_of_week: dow,
              start_time: w.start,
              end_time: w.end,
              slot_minutes: slot,
              buffer_minutes: 0,
              is_active: true,
            }))
          );
          if (e) throw e;
        }
      }
      await load(profile.id);
      notifyCompletionUpdated();
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ? `That didn’t save: ${e.message}` : 'That didn’t save. Try again.');
      // Reload so the screen shows what is really stored after a partial save.
      await load(profile.id).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const ready = rules !== null && paused !== null;
  const saveLabel = saving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save';

  return (
    <TutorV2Shell
      title="One-on-one"
      bottomBar={
        <div className="flex gap-ds-3 lg:hidden">
          <Button block="always" onClick={() => void save()} disabled={!ready || saving || !dirty}>
            {saveLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-ds-4">
        <div className="flex flex-col gap-ds-1">
          <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">One-on-one</span>
          <h1 className="ds-page-title m-0">One-on-one lessons</h1>
          <p className="m-0 text-[15px] text-ink-muted">Families can only book times you have added. Times are Trinidad time (AST).</p>
        </div>

        {!ready ? (
          error ? (
            <p className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-3 text-[14px] font-bold text-ink" role="alert">
              {error}
            </p>
          ) : (
            <div className="h-[360px] animate-pulse rounded-ds-card bg-surface-sunken" aria-busy />
          )
        ) : (
          <>
            <div className="flex min-h-[72px] items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold text-ink">Accept bookings</div>
                <div className="text-[13px] text-ink-muted">
                  {!accepting
                    ? 'Off. You are hidden from one-on-one search. Group classes are not affected.'
                    : totalWindows === 0
                      ? 'On, but families have nothing to book until you add a time below.'
                      : 'Group classes are not affected'}
                </div>
              </div>
              <Switch on={accepting} onToggle={() => (touch(), setAccepting((v) => !v))} label="Accept one-on-one bookings" />
            </div>

            <section className="flex flex-col gap-ds-2">
              <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">Your rates</h2>
              <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card">
                {rates && rates.length ? (
                  rates.map((r, i) => (
                    <div key={`${r.label}-${i}`} className={cn('flex flex-wrap items-baseline justify-between gap-x-ds-3 px-ds-card py-ds-3', i > 0 && 'bw-t-hair border-line-soft')}>
                      <span className="min-w-0 break-words text-[15px] font-extrabold text-ink">{r.label}</span>
                      <span className="text-[14px] font-bold tabular-nums text-ink-muted">{r.rate != null ? `${money(r.rate)} an hour` : 'No rate set'}</span>
                    </div>
                  ))
                ) : (
                  <p className="m-0 px-ds-card py-ds-3 text-[14px] text-ink-muted">No subjects yet. Families cannot book you until you add one with a rate.</p>
                )}
                <div className="flex flex-col gap-ds-1 bw-t-hair border-line-soft px-ds-card py-ds-3">
                  <span className="text-[13px] text-ink-muted">Families choose the lesson length; the price follows your hourly rate.</span>
                  <Link href="/tutor/get-listed" className="ds-link self-start text-[14px] font-extrabold text-brand-edge">
                    Change subjects and rates
                  </Link>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-ds-3">
              <div className="flex flex-col gap-[2px]">
                <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">Available times</h2>
                <p className="m-0 text-[14px] text-ink-muted">Tap a day, then pick when you are free.</p>
              </div>
              <div className="flex flex-wrap gap-ds-2" role="group" aria-label="Days you teach">
                {DAYS.map((d) => {
                  const on = Boolean(wins[d.dow]?.length);
                  return (
                    <button
                      key={d.dow}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d.dow)}
                      className={cn(
                        'ds-press min-h-[44px] min-w-[56px] cursor-pointer rounded-ds-full px-ds-3 font-body text-[15px] font-extrabold',
                        on ? 'bw-hair border-ink bg-ink text-surface-card' : 'bw-hair border-border-strong bg-surface-card text-ink'
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>

              {totalWindows === 0 ? (
                <p className="m-0 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-[14px] text-ink-muted">
                  No times yet. Pick a day above to add one.
                </p>
              ) : (
                <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card">
                  {DAYS.filter((d) => wins[d.dow]?.length).map((d, di) => (
                    <div key={d.dow} className={cn('flex flex-col gap-ds-2 px-ds-card py-ds-3', di > 0 && 'bw-t-hair border-line-soft')}>
                      <span className="text-[15px] font-extrabold text-ink">{d.long}</span>
                      {wins[d.dow].map((w, i) => {
                        const bad = mins(w.end) <= mins(w.start);
                        return (
                          <div key={i} className="flex flex-wrap items-center gap-ds-2">
                            <TimeSelect label={`${d.long} from`} value={w.start} onChange={(v) => setWin(d.dow, i, { start: v })} max="23:30" />
                            <span className="text-[14px] font-bold text-ink-muted">to</span>
                            <TimeSelect label={`${d.long} to`} value={w.end} onChange={(v) => setWin(d.dow, i, { end: v })} min="00:30" bad={bad} />
                            <button
                              type="button"
                              onClick={() => removeWin(d.dow, i)}
                              aria-label={`Remove ${d.long} ${label(w.start)} to ${label(w.end)}`}
                              className="ds-press flex size-[44px] cursor-pointer items-center justify-center rounded-ds-full border-0 bg-transparent text-ink-muted"
                            >
                              <Trash size={20} weight="bold" aria-hidden />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => addWin(d.dow)}
                        className="ds-link inline-flex min-h-[36px] cursor-pointer items-center gap-[6px] self-start border-0 bg-transparent p-0 text-[14px] font-extrabold text-brand-edge"
                      >
                        <Plus size={16} weight="bold" aria-hidden /> Add another time
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="m-0 text-[13px] text-ink-muted">Changing your times never cancels lessons that are already booked.</p>
            </section>

            {error ? (
              <p className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-3 text-[14px] font-bold text-ink" role="alert">
                {error}
              </p>
            ) : null}

            <div className="hidden items-center gap-ds-3 lg:flex">
              <Button onClick={() => void save()} disabled={saving || !dirty}>
                {saveLabel}
              </Button>
              {dirty ? <Tag tone="warning">Not saved yet</Tag> : null}
            </div>
          </>
        )}
      </div>
    </TutorV2Shell>
  );
}

function TimeSelect({
  label: aria,
  value,
  onChange,
  min,
  max,
  bad,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  bad?: boolean;
}) {
  // Keep an off-grid stored time selectable so an untouched window saves as it was.
  const opts = GRID.filter((t) => (!min || mins(t) >= mins(min)) && (!max || mins(t) <= mins(max)));
  if (!opts.includes(value)) opts.push(value);
  opts.sort((a, b) => mins(a) - mins(b));
  return (
    <select
      aria-label={aria}
      aria-invalid={bad || undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-[44px] min-w-[124px] cursor-pointer rounded-ds-sm bw-hair bg-surface-card px-ds-2 font-body text-[16px] font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand',
        bad ? 'border-danger' : 'border-border-strong'
      )}
    >
      {opts.map((t) => (
        <option key={t} value={t}>
          {label(t)}
        </option>
      ))}
    </select>
  );
}
