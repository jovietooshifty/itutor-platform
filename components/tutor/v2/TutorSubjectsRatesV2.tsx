'use client';

/**
 * Subjects and rates, new UI — /tutor/subjects.
 *
 * Replaces the "Change subjects and rates" hop to the old setup page
 * (/tutor/get-listed) from 1:1 lessons and Edit profile. No canvas frame:
 * PROVISIONAL layout, built from the same pieces as the other tutor V2
 * screens.
 *
 * SAME WRITES AS THE OLD PAGE, rule for rule:
 * - tutor_subjects is the list; a subject is added with TT$100/hr, as the old
 *   page does, and removed by deleting its row.
 * - Rates save only once the tutor has a payout account (the old autosave was
 *   disabled without one), and only a rate above 0 is accepted.
 * - Before any tutor_subjects row exists, the subjects picked at sign-up
 *   (user_subjects) are shown, and saving a rate creates the row.
 * - notifyCompletionUpdated() after every change, so Home's checklist moves.
 * Differences: rates save on a button instead of a 900 ms autosave.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CaretRight, MagnifyingGlass, X } from '@phosphor-icons/react';
import { Button, Card } from '@/components/ui';
import { useProfile } from '@/lib/hooks/useProfile';
import { notifyCompletionUpdated } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import TutorV2Shell from './TutorV2Shell';

type Row = { subject_id: string; label: string; curriculum: string | null; rate: number | null; saved: boolean };
type Found = { id: string; label: string; curriculum: string | null };

const subjectLabel = (s: { name?: string | null; label?: string | null } | null) => s?.label || s?.name || 'Subject';

export default function TutorSubjectsRatesV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [hasPayout, setHasPayout] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  const load = useCallback(async (id: string) => {
    const [{ data: subs }, { data: payout }] = await Promise.all([
      supabase.from('tutor_subjects').select('subject_id, price_per_hour_ttd, subjects(name, label, curriculum)').eq('tutor_id', id),
      supabase.from('tutor_payout_accounts').select('payout_account_identifier').eq('tutor_id', id).maybeSingle(),
    ]);
    setHasPayout(Boolean(payout?.payout_account_identifier));
    let list: Row[] = ((subs ?? []) as any[]).map((s) => ({
      subject_id: s.subject_id,
      label: subjectLabel(s.subjects),
      curriculum: s.subjects?.curriculum ?? null,
      rate: s.price_per_hour_ttd ?? null,
      saved: true,
    }));
    if (list.length === 0) {
      const { data: picked } = await supabase.from('user_subjects').select('subject_id, subjects(name, label, curriculum)').eq('user_id', id);
      list = ((picked ?? []) as any[]).map((s) => ({
        subject_id: s.subject_id,
        label: subjectLabel(s.subjects),
        curriculum: s.subjects?.curriculum ?? null,
        rate: null,
        saved: false,
      }));
    }
    list.sort((a, b) => a.label.localeCompare(b.label));
    setRows(list);
    setInputs(Object.fromEntries(list.filter((r) => r.rate).map((r) => [r.subject_id, String(r.rate)])));
  }, []);

  useEffect(() => {
    if (profile?.id) void load(profile.id);
  }, [profile?.id, load]);

  // Subject search, same query as the old page.
  useEffect(() => {
    const term = q.trim().replace(/[%,]/g, '');
    if (!term) {
      setFound([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id, name, label, curriculum')
        .or(`name.ilike.%${term}%,label.ilike.%${term}%`)
        .order('name')
        .limit(10);
      const have = new Set((rows ?? []).map((r) => r.subject_id));
      setFound(((data ?? []) as any[]).filter((s) => !have.has(s.id)).map((s) => ({ id: s.id, label: subjectLabel(s), curriculum: s.curriculum ?? null })));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q, rows]);

  const changed = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      const t = (inputs[r.subject_id] ?? '').trim();
      return t !== (r.rate ? String(r.rate) : '');
    });
  }, [rows, inputs]);

  const add = async (s: Found) => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const { error: e } = await supabase
      .from('tutor_subjects')
      .upsert({ tutor_id: profile.id, subject_id: s.id, price_per_hour_ttd: 100, mode: 'either' }, { onConflict: 'tutor_id,subject_id' });
    setBusy(false);
    if (e) return setError(e.message);
    setQ('');
    setFound([]);
    notifyCompletionUpdated();
    await load(profile.id);
    setNote(`${s.label} added at TT$100 an hour. Change the rate below if you need to.`);
  };

  const remove = async (r: Row) => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const { error: e } = await supabase.from('tutor_subjects').delete().eq('tutor_id', profile.id).eq('subject_id', r.subject_id);
    setBusy(false);
    if (e) return setError(e.message);
    notifyCompletionUpdated();
    await load(profile.id);
  };

  const saveRates = async () => {
    if (!profile || !rows) return;
    setError(null);
    setNote(null);
    for (const r of changed) {
      const t = (inputs[r.subject_id] ?? '').trim();
      const n = Number(t);
      if (t === '' || !Number.isFinite(n) || n <= 0) {
        return setError(`Enter a rate above 0 for ${r.label}.`);
      }
    }
    const payload = changed.map((r) => ({
      tutor_id: profile.id,
      subject_id: r.subject_id,
      price_per_hour_ttd: Number((inputs[r.subject_id] ?? '').trim()),
      mode: 'either' as const,
    }));
    if (!payload.length) return;
    setBusy(true);
    const { error: e } = await supabase.from('tutor_subjects').upsert(payload, { onConflict: 'tutor_id,subject_id' });
    setBusy(false);
    if (e) return setError(e.message);
    notifyCompletionUpdated();
    await load(profile.id);
    setNote('Rates saved.');
  };

  const bar =
    changed.length > 0 && hasPayout ? (
      <div className="flex items-center gap-ds-3 bw-t-hair border-line-soft bg-surface-card px-ds-4 py-ds-3 lg:hidden">
        <span className="flex-1 text-[14px] font-bold text-ink-muted">Not saved yet</span>
        <Button variant="primary" size="md" disabled={busy} onClick={() => void saveRates()}>
          {busy ? 'Saving…' : 'Save rates'}
        </Button>
      </div>
    ) : undefined;

  return (
    <TutorV2Shell title="Subjects and rates" bottomBar={bar}>
      <div className="flex max-w-[640px] flex-col gap-ds-4">
        <Link
          href="/tutor/profile/edit"
          className="ds-press -ml-ds-1 inline-flex min-h-[44px] items-center gap-[6px] self-start px-ds-1 font-body text-[15px] font-extrabold text-ink no-underline"
        >
          <span className="rotate-180" aria-hidden>
            <CaretRight size={18} weight="bold" />
          </span>
          Edit profile
        </Link>
        <header className="flex flex-col gap-ds-1">
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-tight text-ink">Subjects and rates</h1>
          <p className="m-0 text-[15px] text-ink-muted">
            Families find you by these subjects. The rate is what a 1:1 lesson costs per hour; they choose how long it runs.
          </p>
        </header>

        {error ? (
          <p role="alert" className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-3 text-[14px] font-bold text-ink">
            {error}
          </p>
        ) : null}
        {note ? <p role="status" className="m-0 text-[14px] font-bold text-brand-edge">{note}</p> : null}

        {hasPayout === false ? (
          <Card
            tone="alert"
            title="Add a payout account to set rates"
            body="Rates can only be saved once we know where to pay you. Subjects can be added now."
          >
            <Button variant="outline" size="md" onClick={() => router.push('/tutor/wallet?payout=1')}>
              Add payout account
            </Button>
          </Card>
        ) : null}

        {rows === null ? (
          <div aria-busy className="flex flex-col gap-ds-2">
            <div className="h-16 animate-pulse rounded-ds-card bg-surface-sunken" />
            <div className="h-16 animate-pulse rounded-ds-card bg-surface-sunken" />
          </div>
        ) : rows.length === 0 ? (
          <Card title="No subjects yet" body="Search below to add the subjects you teach." />
        ) : (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card p-0">
            {rows.map((r, i) => (
              <li key={r.subject_id} className={cn('flex flex-wrap items-center gap-ds-3 px-ds-card py-ds-3', i > 0 && 'bw-t-hair border-line-soft')}>
                <span className="min-w-0 flex-1 basis-[160px]">
                  <span className="block text-[16px] font-extrabold text-ink">{r.label}</span>
                  <span className="block text-[13px] text-ink-muted">
                    {r.curriculum ? `${r.curriculum} · ` : ''}
                    {r.rate ? `TT$${r.rate}/hr now` : 'No rate yet'}
                  </span>
                </span>
                <label className="flex items-center gap-1 rounded-ds-btn bw-hair border-border-strong bg-surface-card pl-ds-3 pr-ds-2 focus-within:border-brand-edge">
                  <span className="text-[15px] font-bold text-ink-muted">TT$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    aria-label={`${r.label} rate per hour`}
                    value={inputs[r.subject_id] ?? ''}
                    disabled={!hasPayout || busy}
                    onChange={(e) => setInputs((m) => ({ ...m, [r.subject_id]: e.target.value }))}
                    className="h-[44px] w-[76px] border-0 bg-transparent p-0 text-right text-[16px] font-extrabold tabular-nums text-ink focus:outline-none disabled:text-ink-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-[14px] text-ink-muted">/hr</span>
                </label>
                {r.saved ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(r)}
                    aria-label={`Remove ${r.label}`}
                    className="ds-press grid size-11 place-items-center rounded-full text-ink hover:bg-surface-sunken disabled:opacity-45"
                  >
                    <X size={18} weight="bold" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {changed.length > 0 && hasPayout ? (
          <div className="hidden items-center gap-ds-3 lg:flex">
            <Button variant="primary" size="md" disabled={busy} onClick={() => void saveRates()}>
              {busy ? 'Saving…' : 'Save rates'}
            </Button>
            <span className="text-[14px] font-bold text-ink-muted">Not saved yet</span>
          </div>
        ) : null}

        <section className="flex flex-col gap-ds-2">
          <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Add a subject</h2>
          <label className="flex items-center gap-ds-2 rounded-ds-btn bw-hair border-ink bg-surface-card px-ds-3 focus-within:[outline-style:solid] focus-within:outline-2 focus-within:outline-ink">
            <MagnifyingGlass size={18} weight="bold" aria-hidden className="text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. CSEC Mathematics"
              aria-label="Search subjects"
              className="h-[48px] min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-ink placeholder:text-ink-muted focus:outline-none"
            />
          </label>
          {q.trim() ? (
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card p-0">
              {searching ? (
                <li className="px-ds-card py-ds-3 text-[14px] text-ink-muted">Searching…</li>
              ) : found.length === 0 ? (
                <li className="px-ds-card py-ds-3 text-[14px] text-ink-muted">No subject matches that, or you already teach it.</li>
              ) : (
                found.map((s, i) => (
                  <li key={s.id} className={cn(i > 0 && 'bw-t-hair border-line-soft')}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void add(s)}
                      className="flex min-h-[48px] w-full items-center justify-between gap-ds-3 px-ds-card text-left hover:bg-surface-sunken disabled:opacity-45"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-extrabold text-ink">{s.label}</span>
                        {s.curriculum ? <span className="block text-[13px] text-ink-muted">{s.curriculum}</span> : null}
                      </span>
                      <span className="shrink-0 text-[14px] font-extrabold text-brand-edge">Add</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </section>
      </div>
    </TutorV2Shell>
  );
}
