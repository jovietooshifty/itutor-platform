'use client';

/**
 * Class ratings, new UI — shared by the Ratings page, the enrolled class page
 * (card on wide screens, star button + sheet on phones) and the read-only
 * summaries on tutor and class profiles.
 *
 * The three categories are the ones group_reviews has carried since mig 192
 * (patience / explanation / class material). The overall score stays the
 * rounded average, computed by the API on write.
 *
 * PROVISIONAL: no Figma frame draws the rating card or the summary.
 */

import { useEffect, useState } from 'react';
import { Star } from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

export const CATEGORIES = [
  { key: 'patience', label: 'Patience', hint: "Stays calm and takes time when you're stuck." },
  { key: 'explanation', label: 'Explanation', hint: 'Makes hard ideas clear and easy to follow.' },
  { key: 'classMaterial', label: 'Class material', hint: 'Notes, slides and practice that actually help.' },
] as const;
export type CatKey = (typeof CATEGORIES)[number]['key'];
export type CatScores = Record<CatKey, number>;

export function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-[2px]" role="img" aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          weight={n <= Math.round(value) ? 'fill' : 'regular'}
          className={n <= Math.round(value) ? 'text-accent-orange' : 'text-ink-faint'}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** Five 44px tap targets; a radio group so arrow-key users get the right semantics. */
export function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className="ds-press flex size-11 items-center justify-center rounded-ds-sm border-0 bg-transparent p-0 cursor-pointer"
        >
          <Star size={30} weight={n <= value ? 'fill' : 'regular'} className={n <= value ? 'text-accent-orange' : 'text-ink-faint'} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function CategoryPickers({ value, onChange }: { value: CatScores; onChange: (v: CatScores) => void }) {
  return (
    <div className="flex flex-col">
      {CATEGORIES.map((c, i) => (
        <div key={c.key} className={cn('flex flex-col gap-ds-1 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
          <span className="font-body text-[15px] font-extrabold text-ink">{c.label}</span>
          <span className="font-body text-[13px] text-ink-muted">{c.hint}</span>
          <StarPicker label={c.label} value={value[c.key]} onChange={(n) => onChange({ ...value, [c.key]: n })} />
        </div>
      ))}
    </div>
  );
}

export type ExistingClassReview = {
  id: string;
  patience: number | null;
  explanation: number | null;
  classMaterial: number | null;
  rating: number;
  comment: string | null;
};

/**
 * The two-step rating: the three categories first, then (optional) a few words
 * about the tutor. Creates through POST /api/groups/[id]/reviews, edits through
 * PATCH /api/student/ratings/group/[id].
 */
export function ClassRatingFlow({
  groupId,
  tutorFirstName,
  existing,
  onDone,
  onCancel,
}: {
  groupId: string;
  tutorFirstName: string;
  existing?: ExistingClassReview | null;
  onDone: (message: string) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<'stars' | 'words'>('stars');
  const [cats, setCats] = useState<CatScores>(() =>
    existing
      ? {
          patience: existing.patience ?? existing.rating,
          explanation: existing.explanation ?? existing.rating,
          classMaterial: existing.classMaterial ?? existing.rating,
        }
      : { patience: 0, explanation: 0, classMaterial: 0 }
  );
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = cats.patience > 0 && cats.explanation > 0 && cats.classMaterial > 0;

  useEffect(() => setErr(null), [step]);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    const text = comment.trim();
    const body: Record<string, unknown> = {
      patience_rating: cats.patience,
      explanation_rating: cats.explanation,
      class_material_rating: cats.classMaterial,
    };
    let url = `/api/groups/${groupId}/reviews`;
    let method: 'POST' | 'PATCH' = 'POST';
    if (existing) {
      url = `/api/student/ratings/group/${existing.id}`;
      method = 'PATCH';
      body.comment = text || null;
    } else if (text) {
      body.comment = text;
    }
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? json?.message ?? 'Something went wrong. Try again.');
      onDone(existing ? 'Rating updated.' : `Thanks — your rating for ${tutorFirstName} is in.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-ds-3">
      {step === 'stars' ? (
        <>
          <CategoryPickers value={cats} onChange={setCats} />
          <div className="flex gap-ds-2">
            {onCancel ? (
              <Button variant="outline" size="lg" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button size="lg" className="flex-1" disabled={!ready} onClick={() => setStep('words')}>
              Next
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-ds-2 rounded-ds-sm bg-surface-sunken px-ds-3 py-ds-2">
            {CATEGORIES.map((c) => (
              <span key={c.key} className="flex min-w-0 flex-1 flex-col items-center gap-[2px]">
                <span className="text-[12px] font-extrabold text-ink-muted">{c.label}</span>
                <Stars value={cats[c.key]} size={13} />
              </span>
            ))}
          </div>
          <label className="flex flex-col gap-ds-1">
            <span className="font-body text-[15px] font-extrabold text-ink">
              Tell other students about {tutorFirstName} <span className="font-bold text-ink-muted">(optional)</span>
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={`What is ${tutorFirstName} like to learn from?`}
              className="min-h-[104px] w-full resize-y rounded-ds-sm bw-hair border-border-strong bg-surface-card p-[12px] font-body text-[16px] text-ink placeholder:text-[#757575] focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="font-body text-[13px] text-ink-muted">Shown on {tutorFirstName}&apos;s profile and this class.</span>
          </label>
          {err ? (
            <p role="alert" className="m-0 font-body text-[14px] font-bold text-danger">
              {err}
            </p>
          ) : null}
          <div className="flex gap-ds-2">
            <Button variant="outline" size="lg" className="flex-1" disabled={busy} onClick={() => setStep('stars')}>
              Back
            </Button>
            <Button size="lg" className="flex-1" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Saving…' : existing ? 'Save changes' : comment.trim() ? 'Submit' : 'Submit without words'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only summary for tutor and class profiles.

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  patience_rating: number | null;
  explanation_rating: number | null;
  class_material_rating: number | null;
  reviewer?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
  group?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const firstName = (n: string | null | undefined) => (n || 'A student').split(/\s+/)[0];

/**
 * "Class ratings": the overall average, the three category averages with
 * their one-line meaning, and the latest written reviews. Fetches its own
 * data: a tutor's reviews (all their classes) or one class's.
 */
export function ClassRatingsSection({
  source,
  title = 'Class ratings',
  limit = 3,
  className,
  headingClassName,
}: {
  source: { kind: 'tutor' | 'group'; id: string };
  title?: string;
  limit?: number;
  className?: string;
  headingClassName?: string;
}) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = source.kind === 'tutor' ? `/api/tutors/${source.id}/reviews` : `/api/groups/${source.id}/reviews?limit=50`;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const data = j?.data ?? j;
        const items: ReviewRow[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setRows(items);
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [source.kind, source.id]);

  if (!rows || rows.length === 0) return null;

  const withCats = rows.filter((r) => r.patience_rating != null && r.explanation_rating != null && r.class_material_rating != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const overall = avg(rows.map((r) => r.rating));
  const cat: Record<CatKey, number> = {
    patience: avg(withCats.map((r) => r.patience_rating as number)),
    explanation: avg(withCats.map((r) => r.explanation_rating as number)),
    classMaterial: avg(withCats.map((r) => r.class_material_rating as number)),
  };
  const written = rows.filter((r) => r.comment && r.comment.trim());
  const shown = showAll ? written : written.slice(0, limit);

  return (
    <section className={cn('flex flex-col gap-ds-3', className)} aria-label={title}>
      <h2 className={headingClassName ?? 'm-0 font-display text-[20px] font-extrabold leading-[23px] text-ink'}>{title}</h2>
      <div className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
        <div className="flex items-center gap-ds-3">
          <span className="font-display text-[36px] font-black leading-none tabular-nums text-ink">{overall.toFixed(1)}</span>
          <span className="flex flex-col gap-[2px]">
            <Stars value={overall} size={18} />
            <span className="text-[13px] text-ink-muted">
              {rows.length} {rows.length === 1 ? 'rating' : 'ratings'} from students in class
            </span>
          </span>
        </div>
        {withCats.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {CATEGORIES.map((c) => (
              <li key={c.key} className="flex items-center gap-ds-3 bw-t-hair border-line-soft py-ds-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold text-ink">{c.label}</span>
                  <span className="block text-[13px] text-ink-muted">{c.hint}</span>
                </span>
                <span className="flex shrink-0 items-center gap-ds-2">
                  <Stars value={cat[c.key]} size={14} />
                  <span className="w-7 text-right text-[14px] font-extrabold tabular-nums text-ink">{cat[c.key].toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {shown.map((r) => (
        <article key={r.id} className="flex flex-col gap-ds-1 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <div className="flex items-center justify-between gap-ds-2">
            <span className="min-w-0 truncate text-[15px] font-extrabold text-ink">
              {firstName(one(r.reviewer)?.full_name)}
              {source.kind === 'tutor' && one(r.group)?.name ? (
                <span className="font-bold text-ink-muted"> · {one(r.group)?.name}</span>
              ) : null}
            </span>
            <Stars value={r.rating} size={13} />
          </div>
          <p className="m-0 whitespace-pre-line text-[15px] leading-[21px] text-ink">{r.comment}</p>
          <span className="text-[12px] text-ink-muted">
            {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(r.created_at))}
          </span>
        </article>
      ))}
      {written.length > limit ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="ds-link min-h-[44px] self-start border-0 bg-transparent p-0 text-[15px] font-extrabold text-brand-edge cursor-pointer"
        >
          {showAll ? 'Show fewer' : `Show all ${written.length} reviews`}
        </button>
      ) : null}
    </section>
  );
}
