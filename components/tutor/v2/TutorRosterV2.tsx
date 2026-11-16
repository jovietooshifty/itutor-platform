'use client';

/**
 * Tutor Roster, new UI — /tutor/classes/[id]/sessions/[occurrenceId]/attendance.
 * Canvas m24 ("Roster and feedback").
 *
 * The register keeps every rule of the old sheet (same GET/POST on
 * /api/groups/[id]/occurrences/[occ]/attendance):
 * - a route, not a modal, so it survives a refresh in the classroom;
 * - one Save, not a write per tap, and the button says whether it landed;
 * - students sit under Online or In person by evidence (a join click), and a
 *   room-seat student who joined the call is flagged, never corrected;
 * - marking Absent someone the join log shows as joined asks for a note.
 * The Online / In person switch only appears when the class has room seats.
 *
 * "After the lesson" opens the existing feedback composer (FeedbackComposer,
 * the §8.2 template) for a student, with the same once-a-month rule as
 * Clients: it can be written if none was sent this month or a family asked.
 * The composer keeps its old look inside the new screen. PROVISIONAL.
 *
 * Not drawn from the canvas: "On hold / Payment failed" and "Not enrolled /
 * Awaiting parent" rows. The register lists the seats this session counts;
 * payment state is on the class page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, WifiSlash } from '@phosphor-icons/react';
import { Button, Segmented, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AST_TIME_ZONE } from '@/lib/utils/scheduleFormat';
import FeedbackComposer, { type ComposerStudent } from '@/components/tutor/FeedbackComposer';
import TutorV2Shell from './TutorV2Shell';

type Mark = 'attended' | 'late' | 'absent';
type Mode = 'online' | 'in_person';
type Row = {
  student_id: string;
  name: string;
  avatar_url: string | null;
  seat_type: 'online' | 'physical';
  mode: Mode | null;
  status: Mark | null;
  joined_at: string | null;
  note: string | null;
};
type Client = ComposerStudent & { feedbackThisMonth: { id: string; at: string } | null };

const MARKS: { id: Mark; label: string }[] = [
  { id: 'attended', label: 'Present' },
  { id: 'late', label: 'Late' },
  { id: 'absent', label: 'Absent' },
];

const effective = (r: Row): Mode => r.mode ?? (r.seat_type === 'physical' ? 'in_person' : 'online');

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function TutorRosterV2() {
  const params = useParams<{ id: string; occurrenceId: string }>();
  const router = useRouter();
  const groupId = params?.id as string;
  const occurrenceId = params?.occurrenceId as string;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [tab, setTab] = useState<Mode>('online');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Map<string, Client> | null>(null);
  const [composing, setComposing] = useState<Client | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/occurrences/${occurrenceId}/attendance`, { cache: 'no-store' });
      if (!res.ok) {
        router.push(`/tutor/classes/${groupId}`);
        return;
      }
      const json = await res.json();
      const list: Row[] = json.students ?? [];
      setRows(list);
      setStart(json.occurrence?.scheduled_start_at ?? null);
      setGroupName(json.group?.name ?? '');
      setTab(list.some((s) => s.mode !== 'online' && s.seat_type === 'physical') ? 'in_person' : 'online');
    } catch {
      setError('We couldn’t load the register. Refresh to try again.');
      setRows([]);
    }
  }, [groupId, occurrenceId, router]);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/clients', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setClients(
        new Map(
          (json.students ?? []).map((c: any) => [
            c.id,
            {
              id: c.id,
              name: c.name,
              parentName: c.parent?.name ?? null,
              attendance: c.attendance ?? null,
              openRequest: c.openRequest ?? null,
              feedbackThisMonth: c.feedbackThisMonth ?? null,
            } as Client,
          ])
        )
      );
    } catch {
      setClients(new Map());
    }
  }, []);

  useEffect(() => {
    void load();
    void loadClients();
  }, [load, loadClients]);

  const hasRoom = useMemo(() => (rows ?? []).some((r) => r.seat_type === 'physical' || r.mode === 'in_person'), [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => !hasRoom || effective(r) === tab), [rows, tab, hasRoom]);
  const present = (rows ?? []).filter((r) => r.status === 'attended' || r.status === 'late');
  const inPerson = present.filter((r) => effective(r) === 'in_person').length;
  const unmarked = (rows ?? []).filter((r) => r.status === null).length;

  const setMark = (id: string, status: Mark) => {
    setSavedAt(null);
    setRows((prev) =>
      (prev ?? []).map((r) => (r.student_id === id ? { ...r, status, mode: r.mode ?? (hasRoom ? tab : 'online') } : r))
    );
  };
  const setNote = (id: string, note: string) => {
    setSavedAt(null);
    setRows((prev) => (prev ?? []).map((r) => (r.student_id === id ? { ...r, note } : r)));
  };

  const save = async () => {
    if (saving || !rows) return;
    setSaving(true);
    setError(null);
    try {
      const marks = rows
        .filter((r) => r.status !== null)
        .map((r) => ({ student_id: r.student_id, status: r.status as Mark, mode: r.mode ?? 'online', note: r.note ?? undefined }));
      const res = await fetch(`/api/groups/${groupId}/occurrences/${occurrenceId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks }),
      });
      if (!res.ok) throw new Error();
      setSavedAt(new Date().toISOString());
    } catch {
      setError('Not saved yet. Check your signal and press Save again.');
    } finally {
      setSaving(false);
    }
  };

  const whenText = start
    ? `${new Date(start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: AST_TIME_ZONE })} · ${new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: AST_TIME_ZONE })}`
    : '';

  const saveBar = (
    <div className="flex flex-col gap-[6px]">
      {error ? (
        <p className="m-0 flex items-center gap-[6px] text-[14px] font-bold text-danger" role="alert">
          <WifiSlash size={18} weight="bold" aria-hidden /> {error}
        </p>
      ) : null}
      <Button block="always" onClick={() => void save()} disabled={saving || !rows?.length}>
        {saving ? 'Saving…' : savedAt ? 'Saved' : 'Save attendance'}
      </Button>
      {unmarked > 0 && !savedAt && rows?.length ? (
        <p className="m-0 text-center text-[13px] text-ink-muted">{unmarked} still unmarked. You can save now and finish later.</p>
      ) : null}
    </div>
  );

  return (
    <TutorV2Shell title="Roster" bottomBar={<div className="lg:hidden">{saveBar}</div>}>
      <div className="flex flex-col gap-ds-4">
        <Link
          href={`/tutor/classes/${groupId}`}
          className="ds-press -ml-ds-1 inline-flex min-h-[44px] items-center gap-[6px] self-start px-ds-1 font-body text-[15px] font-extrabold text-ink no-underline"
        >
          <ArrowLeft size={20} weight="bold" aria-hidden /> {groupName || 'Class'}
        </Link>

        <div className="flex flex-col gap-ds-1">
          <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">{whenText || ' '}</span>
          <h1 className="ds-page-title m-0 break-words">{groupName || 'Roster'}</h1>
          {rows ? (
            <p className="m-0 text-[15px] font-bold text-ink">
              {present.length} of {rows.length} present
              {hasRoom && present.length > 0 ? (
                <span className="font-normal text-ink-muted">
                  {' '}
                  · {inPerson} in person, {present.length - inPerson} online
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {hasRoom ? (
          <div className="lg:max-w-[360px]">
            <Segmented
              label="Where"
              options={[
                { id: 'in_person', label: 'In person' },
                { id: 'online', label: 'Online' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
        ) : null}

        {rows === null ? (
          <div className="h-[240px] animate-pulse rounded-ds-card bg-surface-sunken" aria-busy />
        ) : shown.length === 0 ? (
          <p className="m-0 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-[14px] text-ink-muted">
            Nobody in this group for this session.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col rounded-ds-card bw-hair border-border bg-surface-card p-0">
            {shown.map((r, i) => {
              const mismatch = r.seat_type === 'physical' && r.mode === 'online';
              const contradicts = r.status === 'absent' && Boolean(r.joined_at);
              return (
                <li key={r.student_id} className={cn('flex flex-col gap-ds-2 px-ds-card py-ds-3', i > 0 && 'bw-t-hair border-line-soft')}>
                  <div className="flex items-center gap-ds-3">
                    <span className="flex size-[40px] shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-brand font-display text-[14px] font-extrabold text-ink">
                      {r.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatar_url} alt="" className="size-full object-cover" />
                      ) : (
                        initials(r.name)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[15px] font-extrabold text-ink">{r.name}</span>
                      <span className={cn('block text-[13px]', mismatch ? 'font-extrabold text-ink' : 'text-ink-muted')}>
                        {mismatch ? 'Has a room seat · joined online' : r.joined_at ? 'Joined the call' : 'Student'}
                      </span>
                    </span>
                    {r.status ? (
                      <Tag tone={r.status === 'absent' ? 'danger' : 'brand'}>{MARKS.find((m) => m.id === r.status)?.label}</Tag>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-3 gap-ds-2" role="group" aria-label={`Mark ${r.name}`}>
                    {MARKS.map((m) => {
                      const on = r.status === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setMark(r.student_id, m.id)}
                          className={cn(
                            'ds-press min-h-[44px] cursor-pointer rounded-ds-sm font-body text-[15px] font-extrabold',
                            on
                              ? m.id === 'absent'
                                ? 'bw-hair border-danger bg-danger-soft text-ink'
                                : 'bw-hair border-ink bg-brand text-ink'
                              : 'bw-hair border-border-strong bg-surface-card text-ink-muted'
                          )}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  {contradicts ? (
                    <input
                      value={r.note ?? ''}
                      onChange={(e) => setNote(r.student_id, e.target.value)}
                      placeholder="They show as joined. What happened?"
                      maxLength={500}
                      aria-label={`Note for ${r.name}`}
                      className="h-[44px] w-full rounded-ds-sm bw-hair border-accent-orange bg-surface-card px-ds-3 font-body text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="hidden lg:block lg:max-w-[360px]">{saveBar}</div>

        {rows && rows.length ? (
          <section className="flex flex-col gap-ds-2">
            <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">After the lesson</h2>
            <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card">
              <p className="m-0 px-ds-card pt-ds-3 text-[14px] text-ink-muted">
                Send a family a short note on how their child is doing. One a month per student, or whenever a family asks.
              </p>
              {rows.map((r, i) => {
                const c = clients?.get(r.student_id) ?? null;
                const canWrite = c ? !c.feedbackThisMonth || Boolean(c.openRequest) : false;
                return (
                  <div key={r.student_id} className={cn('flex flex-wrap items-center gap-ds-3 px-ds-card py-ds-3', i > 0 ? 'bw-t-hair border-line-soft' : 'mt-ds-2 bw-t-hair border-line-soft')}>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[15px] font-extrabold text-ink">{r.name}</span>
                      <span className="block text-[13px] text-ink-muted">
                        {clients === null
                          ? '…'
                          : !c
                            ? 'Not available for this student'
                            : c.openRequest
                              ? 'Their family asked for feedback'
                              : c.feedbackThisMonth
                                ? `Sent ${c.feedbackThisMonth.at}`
                                : c.parentName
                                  ? `Goes to ${c.parentName} and ${r.name.split(' ')[0]}`
                                  : `Goes to ${r.name.split(' ')[0]}`}
                      </span>
                    </span>
                    {canWrite && c ? (
                      <Button variant={c.openRequest ? 'primary' : 'outline'} size="sm" onClick={() => setComposing(c)}>
                        Write feedback
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {notice ? (
              <p className="m-0 rounded-ds-card bw-hair border-border bg-surface-card p-ds-3 text-[14px] font-bold text-ink" role="status">
                {notice}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      {composing ? (
        <FeedbackComposer
          student={composing}
          onClose={() => setComposing(null)}
          onSent={(message) => {
            setComposing(null);
            setNotice(message);
            window.setTimeout(() => setNotice(null), 6000);
            void loadClients();
          }}
        />
      ) : null}
    </TutorV2Shell>
  );
}
