'use client';

/**
 * Feedback, new UI. Reached from Settings › Feedback.
 *
 * PROVISIONAL VISUALS: no Figma frame. Built from system parts.
 *
 * The request panel is a port of RequestFeedbackPanel (which stays for the
 * flag-off page) with the same endpoints and the same rules:
 * - §8.1 quota: one request per student + tutor + month, shared with the
 *   child. The child is picked first so every tutor row reads for that child.
 * - No timeframe anywhere: a sent request shows the date it was asked and when
 *   the next one opens, never when an answer is due.
 * - "Message" is never disabled by the quota.
 * The old panel cut tutor names off ("Jova…") in a three-across grid. Rows here
 * are full width and names wrap.
 *
 * Report cards keep every fact the old ones showed: the edited marker (§8.2),
 * attendance labelled as automatic, with its denominator (§6), participation
 * and each written section.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { markFeedbackSeen } from '@/lib/parent/feedbackSeen';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';

type Report = {
  id: string;
  childName: string;
  tutorName: string;
  date: string;
  edited: boolean;
  editedOn: string;
  answeredARequest: boolean;
  attendance: {
    label: string | null;
    attended: number | null;
    late: number | null;
    absent: number | null;
    cancelled: number | null;
    excluded: number | null;
  };
  attendanceNote: string | null;
  participationLabel: string;
  sections: Array<{ key: string; label: string; body: string }>;
};
type OpenRequest = { id: string; childName: string; tutorName: string; requestedOn: string; byYou: boolean };

const eyebrow = 'font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted';

export default function ParentFeedbackV2() {
  const [reports, setReports] = useState<Report[]>([]);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [hasChildren, setHasChildren] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/parent/feedback/reports', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        setReports(json.reports ?? []);
        setOpenRequests(json.openRequests ?? []);
        setHasChildren(Boolean(json.hasChildren));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void markFeedbackSeen();
  }, []);

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Feedback">
      {loading ? (
        <DetailSkeleton rows={2} />
      ) : !hasChildren ? (
        <EmptyCard title="No children linked yet" body="Feedback from your children’s tutors appears here once a child is linked." />
      ) : (
        <>
          <RequestPanelV2 onSent={load} />

          {openRequests.length > 0 ? (
            <section className="flex flex-col gap-ds-2">
              <h2 className="pt-ds-2 font-display text-[18px] font-extrabold text-ink">Asked</h2>
              {openRequests.map((r) => (
                <div key={r.id} className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
                  <p className="font-body text-[14px] text-ink">
                    {r.byYou ? 'You' : r.childName} asked {r.tutorName} on {r.requestedOn}.
                  </p>
                  <p className="font-body text-[13px] text-ink-muted">Tutors answer in their own time. Nothing chases them.</p>
                </div>
              ))}
            </section>
          ) : null}

          <h2 className="pt-ds-2 font-display text-[18px] font-extrabold text-ink">Reports</h2>
          {reports.length === 0 ? (
            <EmptyCard
              title="No feedback yet"
              body="Most classes produce none. Tutors write it when there is something worth saying, or when you ask. Attendance is tracked either way, on each child’s page."
            />
          ) : (
            reports.map((f) => <ReportCard key={f.id} f={f} />)
          )}
        </>
      )}
    </DetailScreen>
  );
}

function ReportCard({ f }: { f: Report }) {
  const [open, setOpen] = useState(false);
  const a = f.attendance;
  return (
    <article className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="flex flex-wrap items-baseline justify-between gap-ds-2">
        <h3 className="font-display text-[16px] font-extrabold leading-[20px] text-ink">
          {f.childName} · {f.tutorName}
        </h3>
        <span className="font-body text-[13px] text-ink-muted">{f.date}</span>
      </div>
      <div className="flex flex-wrap gap-ds-2">
        <Tag tone="outline">{f.answeredARequest ? 'You asked' : 'Sent unprompted'}</Tag>
        {f.edited ? <Tag tone="warning">Edited {f.editedOn}</Tag> : null}
      </div>

      {a.label ? (
        <div className="flex flex-col gap-[2px] rounded-ds-sm bg-surface-sunken p-ds-3">
          <span className={eyebrow}>Attendance · recorded automatically</span>
          <span className="font-display text-[18px] font-extrabold text-ink">{a.label}</span>
          <span className="font-body text-[13px] text-ink-muted">
            {a.attended ?? 0} attended · {a.late ?? 0} late · {a.absent ?? 0} absent
            {(a.cancelled ?? 0) > 0 ? ` · ${a.cancelled} cancelled` : ''}
          </span>
          {(a.excluded ?? 0) > 0 ? (
            <span className="font-body text-[13px] text-ink-muted">
              {a.excluded} {a.excluded === 1 ? 'session' : 'sessions'} not counted because the class did not run.
            </span>
          ) : null}
        </div>
      ) : null}

      {f.attendanceNote ? (
        <p className="font-body text-[14px] text-ink">
          <span className="text-ink-muted">Tutor’s note: </span>
          {f.attendanceNote}
        </p>
      ) : null}
      <p className="font-body text-[14px] text-ink">
        <span className="text-ink-muted">Participation: </span>
        {f.participationLabel}
      </p>

      {f.sections.length > 0 ? (
        <>
          {(open ? f.sections : f.sections.slice(0, 1)).map((s) => (
            <div key={s.key} className="flex flex-col gap-[2px] bw-t-hair border-line-soft pt-ds-2">
              <span className={eyebrow}>{s.label}</span>
              <p className={cn('font-body text-[14px] leading-[21px] text-ink', !open && 'line-clamp-3')}>{s.body}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="self-start border-0 bg-transparent p-0 font-display text-[14px] font-extrabold text-ink underline underline-offset-4 cursor-pointer"
          >
            {open ? 'Show less' : 'Read the full report'}
          </button>
        </>
      ) : null}

      <p className="font-body text-[13px] text-ink-muted">Sent to you and to {f.childName.split(' ')[0]}.</p>
    </article>
  );
}

/* ── Request panel: port of RequestFeedbackPanel (§8.1) ──────────────────── */

type Child = { id: string; name: string };
type Teacher = { tutorId: string; tutorName: string; tutorAvatar: string | null };
type Quota = { used: boolean; usedBy: 'parent' | 'student' | null; usedOn: string | null; nextOpens: string | null };

function RequestPanelV2({ onSent }: { onSent: () => void }) {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [quotas, setQuotas] = useState<Record<string, Quota>>({});
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/parent/children/summary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list: Child[] = (j?.children ?? []).map((c: Child) => ({ id: c.id, name: c.name }));
        setChildren(list);
        if (list.length) setChildId(list[0].id);
      })
      .catch(() => undefined);
  }, []);

  const loadTeachers = useCallback(async (id: string) => {
    setLoadingTeachers(true);
    setTeachers([]);
    setQuotas({});
    try {
      const res = await fetch(`/api/parent/children/${id}/messages`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const list: Teacher[] = (json.threads ?? [])
        .filter((t: { tutorId?: string }) => Boolean(t.tutorId))
        .map((t: Teacher) => ({ tutorId: t.tutorId, tutorName: t.tutorName, tutorAvatar: t.tutorAvatar }));
      setTeachers(list);
      const entries = await Promise.all(
        list.map(async (t) => {
          try {
            const q = await fetch(
              `/api/feedback/requests?childId=${encodeURIComponent(id)}&tutorId=${encodeURIComponent(t.tutorId)}`,
              { cache: 'no-store' }
            );
            return [t.tutorId, q.ok ? ((await q.json()) as Quota) : null] as const;
          } catch {
            return [t.tutorId, null] as const;
          }
        })
      );
      const map: Record<string, Quota> = {};
      for (const [k, q] of entries) if (q) map[k] = q;
      setQuotas(map);
    } finally {
      setLoadingTeachers(false);
    }
  }, []);

  useEffect(() => {
    if (childId) void loadTeachers(childId);
  }, [childId, loadTeachers]);

  const request = async (tutorId: string) => {
    setSending(tutorId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/feedback/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, tutorId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'That request did not go through.');
        return;
      }
      setNote(json.message ?? 'Requested.');
      await loadTeachers(childId);
      onSent();
    } catch {
      setError('That request did not go through.');
    } finally {
      setSending(null);
    }
  };

  if (children.length === 0) return null;
  const first = children.find((c) => c.id === childId)?.name.split(' ')[0] ?? 'your child';

  return (
    <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="flex flex-col gap-ds-1">
        <h2 className="font-display text-[18px] font-extrabold text-ink">Ask a tutor for feedback</h2>
        <p className="font-body text-[13px] text-ink-muted">
          One request a month for each child and tutor, shared with your child. If they already asked this
          month, that request is the one that counts. Asking for one child does not use up another’s.
        </p>
      </div>

      {children.length > 1 ? (
        <div role="tablist" aria-label="Feedback for" className="flex flex-wrap gap-ds-2">
          {children.map((c) => {
            const active = c.id === childId;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setChildId(c.id)}
                className={cn(
                  'rounded-ds-full bw-bold border-ink px-ds-4 py-ds-2 font-display text-[14px] font-extrabold cursor-pointer',
                  active ? 'bg-ink text-on-ink' : 'bg-surface-card text-ink'
                )}
              >
                {c.name.split(' ')[0]}
              </button>
            );
          })}
        </div>
      ) : null}

      {note ? <p role="status" className="font-body text-[13px] font-extrabold text-ink">{note}</p> : null}
      {error ? <p role="alert" className="font-body text-[13px] font-extrabold text-danger">{error}</p> : null}

      {loadingTeachers ? (
        <div className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" />
      ) : teachers.length === 0 ? (
        <p className="font-body text-[13px] text-ink-muted">
          {first} has no tutors yet. Once they join a class or book a session, their tutors appear here.
        </p>
      ) : (
        teachers.map((t) => {
          const q = quotas[t.tutorId];
          const used = q?.used === true;
          return (
            <div key={t.tutorId} className="flex flex-col gap-ds-2 bw-t-hair border-line-soft pt-ds-3">
              <div className="flex items-center gap-ds-3">
                <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-surface-sunken font-display text-[14px] font-extrabold text-ink">
                  {t.tutorAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.tutorAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    t.tutorName.charAt(0).toUpperCase()
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-display text-[15px] font-extrabold leading-[19px] text-ink">{t.tutorName}</p>
                  {used ? (
                    <p className="font-body text-[13px] text-ink-muted">
                      {q?.usedBy === 'student' ? `${first} asked this month` : 'You asked this month'}
                      {q?.usedOn ? ` · ${q.usedOn}` : ''}
                      {q?.nextOpens ? ` · opens again in ${q.nextOpens}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-ds-2">
                <Button size="sm" block disabled={used || sending === t.tutorId} onClick={() => request(t.tutorId)}>
                  {sending === t.tutorId ? 'Sending…' : used ? 'Asked this month' : 'Ask for feedback'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  block
                  onClick={() => router.push(`/parent/messages?tutor=${encodeURIComponent(t.tutorId)}`)}
                >
                  Message
                </Button>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
