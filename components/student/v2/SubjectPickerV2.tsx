'use client';

/**
 * Subject search + chips, new UI. Same search as the old SubjectMultiSelect
 * (subjects table, name or label, 15 results), drawn with DS tokens.
 *
 * The results list sits IN FLOW under the field, not as an absolute dropdown.
 * Inside a sheet's scrolling body an absolute dropdown was cut off at the
 * panel's edge (worst with the phone keyboard up); in flow it pushes the
 * content down and the body scrolls.
 */

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Subject = { id: string; name: string; curriculum: string; level: string | null; label: string };

export default function SubjectPickerV2({
  selected,
  onChange,
  showChips = true,
  autoFocus = false,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Off when the caller already lists the chosen subjects itself. */
  showChips?: boolean;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Subject[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, '');
    if (!term) {
      setResults(null);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('subjects')
        .select('id, name, curriculum, level, label')
        .or(`name.ilike.%${term}%,label.ilike.%${term}%`)
        .order('name', { ascending: true })
        .limit(15);
      if (id !== seq.current) return;
      setLoading(false);
      setResults(
        ((data ?? []) as Array<{ id: string; name: string; curriculum: string; level: string | null; label: string | null }>).map((s) => ({
          ...s,
          label: s.label || `${s.name} (${s.curriculum})`,
        }))
      );
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const add = (label: string) => {
    if (!selected.includes(label)) onChange([...selected, label]);
    setQ('');
    setResults(null);
  };
  const shown = (results ?? []).filter((s) => !selected.includes(s.label));

  return (
    <div className="flex flex-col gap-ds-3">
      <label className="flex h-[52px] items-center gap-ds-2 rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[14px] focus-within:ring-2 focus-within:ring-brand">
        <MagnifyingGlass size={18} weight="bold" className="shrink-0 text-ink-muted" aria-hidden />
        <span className="sr-only">Search subjects</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a subject, e.g. Maths"
          autoFocus={autoFocus}
          autoComplete="off"
          className="h-full min-w-0 flex-1 border-0 bg-transparent font-body text-[16px] text-ink placeholder:text-ink-muted focus:outline-none"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Clear search"
            className="flex size-8 items-center justify-center rounded-ds-xs border-0 bg-transparent text-ink cursor-pointer"
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
        ) : null}
      </label>

      {q.trim() ? (
        <div className="flex flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card" aria-live="polite">
          {loading && results === null ? (
            <p className="m-0 px-ds-3 py-ds-3 text-[14px] text-ink-muted">Searching…</p>
          ) : shown.length === 0 ? (
            <p className="m-0 px-ds-3 py-ds-3 text-[14px] text-ink-muted">No subjects match “{q.trim()}”.</p>
          ) : (
            shown.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => add(s.label)}
                className={cn(
                  'ds-press flex min-h-[52px] w-full items-center gap-ds-3 border-0 bg-transparent px-ds-3 text-left cursor-pointer',
                  i > 0 && 'bw-t-hair border-line-soft'
                )}
              >
                <span className="min-w-0 flex-1 font-body text-[15px] font-bold text-ink">{s.name}</span>
                <span className="shrink-0 rounded-ds-xs bg-surface-sunken px-ds-2 py-[3px] text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink">
                  {Array.from(new Set([s.curriculum, s.level].filter(Boolean))).join(' ')}
                </span>
                <Plus size={16} weight="bold" className="shrink-0 text-ink" aria-hidden />
              </button>
            ))
          )}
        </div>
      ) : null}

      {showChips && selected.length > 0 ? (
        <div className="flex flex-wrap gap-ds-2">
          {selected.map((s) => (
            <span key={s} className="inline-flex h-[42px] items-center gap-ds-1 rounded-ds-sm bw-hair border-border bg-surface-card pl-[12px] pr-[4px]">
              <span className="font-body text-[14px] font-bold text-ink">{s}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== s))}
                aria-label={`Remove ${s}`}
                className="flex size-8 items-center justify-center rounded-ds-xs border-0 bg-transparent text-ink cursor-pointer"
              >
                <X size={14} weight="bold" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
