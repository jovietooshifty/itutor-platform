'use client';

/**
 * TutorReviewsV2 — Reviews in the new tutor UI (owner, 2026-11-16: "revamp
 * the review page"). No canvas frame: PROVISIONAL layout, built from the
 * design system's own pieces (Segmented, Card, Tag, Button, the filter pills
 * used on Classes).
 *
 * Same data and actions as the old page (app/tutor/reviews/page.tsx):
 * 1:1 `ratings` and group `group_reviews` for this tutor, public replies via
 * /api/reviews/[id]/reply. Two things changed on purpose:
 * - The 6-month trend is REAL. The old chart drew five hard-coded averages
 *   (4.6, 4.7, 4.5, 4.8, 4.9) and only the last bar was this tutor's.
 * - "Response rate" became "Replied", with the count it comes from.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Segmented } from '@/components/ui';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { AST_TIME_ZONE } from '@/lib/utils/scheduleFormat';
import { cn } from '@/lib/utils';

type Review = {
  id: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  name: string;
  avatar: string | null;
  /** Class name for a group review. */
  about: string | null;
  reply: string | null;
  repliedAt: string | null;
};

type Kind = 'group' | '1on1';
type Filter = 'all' | 'unreplied' | '5' | '4' | '3' | '2' | '1';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unreplied', label: 'Needs a reply' },
  { id: '5', label: '5★' },
  { id: '4', label: '4★' },
  { id: '3', label: '3★' },
  { id: '2', label: '2★' },
  { id: '1', label: '1★' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: AST_TIME_ZONE });

function Stars({ value, size = 16, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-[2px]', className)} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <path
            d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.9z"
            className={value >= s - 0.25 ? 'fill-accent-yellow' : 'fill-ink/15'}
          />
        </svg>
      ))}
    </span>
  );
}

export default function TutorReviewsV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [kind, setKind] = useState<Kind>('group');
  const [oneOnOne, setOneOnOne] = useState<Review[] | null>(null);
  const [group, setGroup] = useState<Review[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      setFailed(false);
      const { data: ratings, error } = await supabase
        .from('ratings')
        .select('id, stars, comment, created_at, tutor_reply, tutor_replied_at, student:profiles!ratings_student_id_fkey(full_name, avatar_url)')
        .eq('tutor_id', profile.id)
        .order('created_at', { ascending: false });

      // Separate, so an environment without group_reviews still shows 1:1s.
      let groupRows: any[] = [];
      try {
        const { data } = await supabase
          .from('group_reviews')
          .select(
            'id, rating, comment, created_at, tutor_reply, tutor_replied_at, group_id, reviewer:profiles!group_reviews_reviewer_id_fkey(full_name, avatar_url), group:groups!group_reviews_group_id_fkey(id, name)'
          )
          .eq('tutor_id', profile.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
        groupRows = data ?? [];
      } catch {
        /* table missing on this environment */
      }
      if (cancelled) return;
      if (error) setFailed(true);

      const one = (ratings ?? []).map((r: any): Review => {
        const s = Array.isArray(r.student) ? r.student[0] : r.student;
        return {
          id: r.id,
          stars: Number(r.stars) || 0,
          comment: r.comment,
          createdAt: r.created_at,
          name: s?.full_name || 'A student',
          avatar: s?.avatar_url ?? null,
          about: '1:1 session',
          reply: r.tutor_reply ?? null,
          repliedAt: r.tutor_replied_at ?? null,
        };
      });
      const grp = groupRows.map((r: any): Review => {
        const rev = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer;
        const g = Array.isArray(r.group) ? r.group[0] : r.group;
        return {
          id: r.id,
          stars: Number(r.rating) || 0,
          comment: r.comment,
          createdAt: r.created_at,
          name: rev?.full_name || 'A student',
          avatar: rev?.avatar_url ?? null,
          about: g?.name || 'Class',
          reply: r.tutor_reply ?? null,
          repliedAt: r.tutor_replied_at ?? null,
        };
      });
      setOneOnOne(one);
      setGroup(grp);
      // Open on whichever side actually has reviews.
      if (grp.length === 0 && one.length > 0) setKind('1on1');
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const all = (kind === 'group' ? group : oneOnOne) ?? [];
  const loaded = group !== null && oneOnOne !== null;

  const stats = useMemo(() => {
    const total = all.length;
    const avg = total ? all.reduce((s, r) => s + r.stars, 0) / total : 0;
    const dist = [5, 4, 3, 2, 1].map((star) => {
      const count = all.filter((r) => r.stars === star).length;
      return { star, count, pct: total ? (count / total) * 100 : 0 };
    });
    const replied = all.filter((r) => r.reply).length;

    // Real monthly averages for the last six calendar months (AST).
    const key = (d: Date) => d.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', timeZone: AST_TIME_ZONE });
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 15);
      const inMonth = all.filter((r) => key(new Date(r.createdAt)) === key(d));
      return {
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
        count: inMonth.length,
        avg: inMonth.length ? inMonth.reduce((s, r) => s + r.stars, 0) / inMonth.length : null,
      };
    });
    return { total, avg, dist, replied, months };
  }, [all]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === 'unreplied' && r.reply) return false;
      if (filter !== 'all' && filter !== 'unreplied' && r.stars !== Number(filter)) return false;
      if (q && !(r.comment?.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.about?.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [all, filter, search]);

  const setReply = (id: string, reply: string | null) => {
    const patch = (rs: Review[] | null) =>
      rs?.map((r) => (r.id === id ? { ...r, reply, repliedAt: reply ? new Date().toISOString() : null } : r)) ?? rs;
    if (kind === 'group') setGroup(patch);
    else setOneOnOne(patch);
  };

  const unreplied = all.filter((r) => !r.reply).length;

  return (
    <div className="flex flex-col gap-ds-4">
      <header className="flex flex-col gap-ds-1">
        <h1 className="m-0 font-display text-[clamp(28px,5vw,40px)] font-extrabold leading-tight text-ink">Reviews</h1>
        <p className="m-0 text-[15px] text-ink-muted">What students say about your classes and sessions. Replies are public.</p>
      </header>

      <Segmented<Kind>
        label="Review type"
        className="max-w-[420px]"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setFilter('all');
          setSearch('');
        }}
        options={[
          { id: 'group', label: `Group classes${group ? ` · ${group.length}` : ''}` },
          { id: '1on1', label: `1:1 sessions${oneOnOne ? ` · ${oneOnOne.length}` : ''}` },
        ]}
      />

      {failed ? (
        <Card title="Reviews didn't load" body="Check your connection and refresh the page." />
      ) : !loaded ? (
        <div aria-busy className="grid gap-ds-3 lg:grid-cols-[280px_1fr]">
          <div className="h-44 animate-pulse rounded-ds-card bg-surface-sunken" />
          <div className="h-44 animate-pulse rounded-ds-card bg-surface-sunken" />
        </div>
      ) : (
        <>
          {/* Summary: score, distribution, real trend. */}
          <section className="grid gap-ds-3 lg:grid-cols-[280px_1fr] lg:gap-ds-4">
            <div className="flex flex-col justify-center gap-ds-2 rounded-ds-card bg-ink p-ds-5 text-on-ink">
              <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-on-ink-muted">Average rating</span>
              <span className="font-display text-[56px] font-extrabold leading-none tabular-nums">
                {stats.total ? stats.avg.toFixed(1) : '—'}
              </span>
              <Stars value={stats.avg} size={20} />
              <span className="text-[14px] font-bold text-on-ink-muted">
                {stats.total} review{stats.total === 1 ? '' : 's'} · {stats.replied} replied
              </span>
            </div>

            <Card className="grid gap-ds-5 sm:grid-cols-2">
              <div className="flex flex-col gap-ds-2">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">Distribution</span>
                {stats.dist.map((d) => (
                  <button
                    key={d.star}
                    type="button"
                    onClick={() => setFilter(String(d.star) as Filter)}
                    className="flex items-center gap-ds-2 border-0 bg-transparent p-0 text-left font-body cursor-pointer"
                    aria-label={`Show ${d.star}-star reviews (${d.count})`}
                  >
                    <span className="w-8 text-[13px] font-extrabold tabular-nums text-ink">{d.star}★</span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                      <span className="block h-full rounded-full bg-accent-yellow" style={{ width: `${d.pct}%` }} />
                    </span>
                    <span className="w-6 text-right text-[13px] font-extrabold tabular-nums text-ink">{d.count}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-ds-2">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">Last 6 months</span>
                <div className="flex h-28 items-end gap-ds-2">
                  {stats.months.map((m) => (
                    <div key={m.label} className="flex h-full flex-1 flex-col items-center justify-end gap-[4px]">
                      <span className="text-[11px] font-extrabold tabular-nums text-ink">{m.avg != null ? m.avg.toFixed(1) : ''}</span>
                      <span
                        className={cn('w-full rounded-t-ds-xs', m.avg != null ? 'bg-brand' : 'bg-surface-sunken')}
                        style={{ height: m.avg != null ? `${Math.max(8, (m.avg / 5) * 80)}%` : '6%' }}
                        title={m.count ? `${m.count} review${m.count === 1 ? '' : 's'}` : 'No reviews'}
                      />
                      <span className="text-[11px] font-bold text-ink-muted">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </section>

          {/* Search + filter pills. */}
          <div className="flex flex-col gap-ds-2 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search reviews</span>
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-ds-3 top-1/2 -translate-y-1/2 fill-none stroke-ink-muted"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student, class or words"
                className="h-11 w-full rounded-ds-btn bw-hair border-border bg-surface-card pl-10 pr-ds-3 font-body text-[15px] text-ink outline-none focus:border-ink"
              />
            </label>
            <div role="tablist" aria-label="Filter reviews" className="flex flex-wrap gap-ds-2">
              {FILTERS.map((f) => {
                const on = f.id === filter;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'ds-press inline-flex items-center gap-[6px] rounded-full bw-hair px-ds-3 py-[6px] font-body text-[13px] font-extrabold cursor-pointer',
                      on ? 'border-ink bg-ink text-on-ink' : 'border-border bg-surface-card text-ink'
                    )}
                  >
                    {f.label}
                    {f.id === 'unreplied' && unreplied > 0 ? (
                      <span className={cn('tabular-nums', on ? 'text-brand' : 'text-ink-muted')}>{unreplied}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {shown.length === 0 ? (
            <Card
              title={all.length === 0 ? 'No reviews yet' : 'Nothing matches'}
              body={
                all.length === 0
                  ? kind === 'group'
                    ? 'Students can review a class after attending it. Their reviews will show up here.'
                    : 'Students review 1:1 sessions after they finish. Those reviews will show up here.'
                  : 'Try another filter or clear the search.'
              }
            />
          ) : (
            <div className="flex flex-col gap-ds-3">
              {shown.map((r) => (
                <ReviewCard key={r.id} review={r} onReply={setReply} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewCard({ review, onReply }: { review: Review; onReply: (id: string, reply: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = () => {
    setText(review.reply ?? '');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    const reply = text.trim();
    if (!reply || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      });
      if (!res.ok) throw new Error();
      onReply(review.id, reply);
      setEditing(false);
    } catch {
      setError("Your reply didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete your public reply?')) return;
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onReply(review.id, null);
    } catch {
      setError("Your reply couldn't be deleted. Try again.");
    }
  };

  return (
    <Card as="article" className="gap-ds-3">
      <div className="flex items-start gap-ds-3">
        {review.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.avatar} alt="" className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand font-display text-[14px] font-extrabold text-ink">
            {initials(review.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-ds-3 gap-y-[2px]">
            <span className="truncate text-[16px] font-extrabold text-ink">{review.name}</span>
            <Stars value={review.stars} />
          </div>
          <span className="block text-[13px] text-ink-muted">
            {[review.about, longDate(review.createdAt)].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>

      {review.comment ? (
        <p className="m-0 whitespace-pre-wrap text-[15px] leading-6 text-ink">{review.comment}</p>
      ) : (
        <p className="m-0 text-[14px] italic text-ink-muted">Rated without a comment.</p>
      )}

      {editing ? (
        <div className="flex flex-col gap-ds-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={3}
            autoFocus
            placeholder="Thank them, or answer what they raised. Everyone can see this."
            className="w-full rounded-ds-btn bw-hair border-border bg-surface-card p-ds-3 font-body text-[15px] text-ink outline-none focus:border-ink"
          />
          <div className="flex flex-wrap items-center justify-between gap-ds-2">
            <span className="text-[12px] tabular-nums text-ink-muted">{text.length}/1000</span>
            <div className="flex gap-ds-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="dark" size="sm" disabled={!text.trim() || saving} onClick={save}>
                {saving ? 'Saving…' : review.reply ? 'Save reply' : 'Post reply'}
              </Button>
            </div>
          </div>
        </div>
      ) : review.reply ? (
        <div className="flex flex-col gap-ds-1 rounded-ds-sm bg-surface-sunken p-ds-3">
          <div className="flex items-center justify-between gap-ds-2">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
              Your reply{review.repliedAt ? ` · ${longDate(review.repliedAt)}` : ''}
            </span>
            <span className="flex gap-ds-3">
              <button type="button" onClick={open} className="border-0 bg-transparent p-0 font-body text-[13px] font-extrabold text-ink underline cursor-pointer">
                Edit
              </button>
              <button type="button" onClick={remove} className="border-0 bg-transparent p-0 font-body text-[13px] font-extrabold text-danger underline cursor-pointer">
                Delete
              </button>
            </span>
          </div>
          <p className="m-0 whitespace-pre-wrap text-[14px] leading-5 text-ink">{review.reply}</p>
        </div>
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={open}>
            Reply publicly
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="m-0 text-[13px] font-bold text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
