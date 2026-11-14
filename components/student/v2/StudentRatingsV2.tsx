'use client';

/**
 * Student Ratings, new UI — PROVISIONAL: no Figma frame exists for this
 * screen. Built from the system's parts (page title, Segmented, cards, Tag,
 * Button, the shared bottom Sheet) to match Notifications and Credits.
 *
 * Two halves:
 *  - "To rate": tutors the student has had an ended, non-cancelled 1:1
 *    session with and never rated, and classes they are enrolled in and have
 *    not reviewed. A class inside its 30-day tenure window shows when it opens.
 *  - "Your ratings": what they have left, with Edit.
 *
 * DATA: GET /api/student/ratings (own rows only). Writes go through the
 * existing create routes — POST /api/feedback/student (1:1, one score) and
 * POST /api/groups/[groupId]/reviews (class, three category scores whose
 * rounded average is the overall) — and edits through
 * PATCH /api/student/ratings/{session|group}/[id].
 *
 * Wide screens (PROVISIONAL): cards in two columns from lg.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChalkboardTeacher, ChatCircleText, Star, UsersThree } from '@phosphor-icons/react';
import { Button, Segmented, Tag } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';

type Person = { id: string; name: string; avatar: string | null };

type SessionToRate = { kind: 'session'; tutor: Person; sessionId: string; lastAt: string; sessionCount: number };
type ClassToRate = { kind: 'group'; groupId: string; className: string; tutor: Person; opensAt: string | null };
type SessionRated = {
  kind: 'session';
  id: string;
  tutor: Person;
  stars: number;
  comment: string | null;
  createdAt: string;
  tutorReply: string | null;
  systemIssued: boolean;
  removed: boolean;
  sessionCount: number;
  canEdit: boolean;
};
type ClassRated = {
  kind: 'group';
  id: string;
  groupId: string;
  className: string;
  tutor: Person;
  rating: number;
  patience: number | null;
  explanation: number | null;
  classMaterial: number | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string | null;
  tutorReply: string | null;
  canEdit: boolean;
};
type Data = {
  toRate: { sessions: SessionToRate[]; classes: ClassToRate[] };
  rated: { sessions: SessionRated[]; classes: ClassRated[] };
};

/** What the sheet is open on. */
type Target =
  | { mode: 'create'; item: SessionToRate }
  | { mode: 'create'; item: ClassToRate }
  | { mode: 'edit'; item: SessionRated }
  | { mode: 'edit'; item: ClassRated };

const TZ = 'America/Port_of_Spain';
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(iso));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const CATEGORIES = [
  { key: 'patience', label: 'Patience', hint: 'Takes time when you are stuck' },
  { key: 'explanation', label: 'Explanation', hint: 'Makes things make sense' },
  { key: 'classMaterial', label: 'Class material', hint: 'Notes, slides and practice' },
] as const;
type CatKey = (typeof CATEGORIES)[number]['key'];

function Avatar({ person }: { person: Person }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-ds-sm bg-ink font-display text-[16px] font-black text-brand">
      {person.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatar} alt="" className="size-12 object-cover" />
      ) : (
        initials(person.name) || '?'
      )}
    </span>
  );
}

function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-[2px]" role="img" aria-label={label ?? `${value} out of 5 stars`}>
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
function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
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
          <Star
            size={30}
            weight={n <= value ? 'fill' : 'regular'}
            className={n <= value ? 'text-accent-orange' : 'text-ink-faint'}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

function KindTag({ kind }: { kind: 'session' | 'group' }) {
  return <Tag tone={kind === 'group' ? 'warning' : 'outline'}>{kind === 'group' ? 'Class' : '1:1'}</Tag>;
}

const card = 'flex min-w-0 flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card';

export default function StudentRatingsV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'rate' | 'rated' | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'student') router.push(nonStudentRedirect(profile));
  }, [profile, loading, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/ratings', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data) throw new Error(json?.error ?? 'load failed');
      setData(json.data as Data);
      setError(false);
    } catch {
      setError(true);
      setData((prev) => prev ?? { toRate: { sessions: [], classes: [] }, rated: { sessions: [], classes: [] } });
    }
  }, []);

  useEffect(() => {
    if (profile?.id && profile.role === 'student') void load();
  }, [profile?.id, profile?.role, load]);

  const toRate: Array<SessionToRate | ClassToRate> = data
    ? [
        ...data.toRate.sessions,
        // Classes open for review first; ones still inside the 30 days after.
        ...data.toRate.classes.filter((c) => !c.opensAt),
        ...data.toRate.classes.filter((c) => c.opensAt),
      ]
    : [];
  const rated: Array<SessionRated | ClassRated> = data
    ? [...data.rated.sessions, ...data.rated.classes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    : [];
  const openCount = toRate.filter((t) => t.kind === 'session' || !t.opensAt).length;

  // Land on whichever half has something to do.
  const current = tab ?? (data && openCount === 0 && rated.length > 0 ? 'rated' : 'rate');

  const title = <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Ratings</h1>;

  if (!data) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        {title}
        <div className="h-[52px] animate-pulse rounded-ds-card bg-surface-sunken lg:max-w-[420px]" />
        <div className="grid gap-ds-3 lg:grid-cols-2">
          <div className="h-[132px] animate-pulse rounded-ds-card bg-surface-sunken" />
          <div className="h-[132px] animate-pulse rounded-ds-card bg-surface-sunken" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-ds-4">
      <div className="flex flex-col gap-ds-1">
        {title}
        <p className="m-0 font-body text-[15px] text-ink-muted">
          Your ratings help other students choose, and help your tutors get better.
        </p>
      </div>

      <div className="lg:max-w-[420px]">
        <Segmented
          label="Ratings"
          options={[
            { id: 'rate', label: openCount > 0 ? `To rate · ${openCount}` : 'To rate' },
            { id: 'rated', label: rated.length > 0 ? `Your ratings · ${rated.length}` : 'Your ratings' },
          ]}
          value={current}
          onChange={setTab}
        />
      </div>

      {error ? (
        <p role="alert" className="m-0 rounded-ds-card bg-danger-soft bw-hair border-danger p-ds-4 font-body text-[15px] font-bold text-ink">
          We couldn&apos;t load your ratings. Try again in a moment.
        </p>
      ) : null}
      {flash ? (
        <p role="status" className="m-0 rounded-ds-card bg-brand bw-hair border-ink p-ds-4 font-body text-[15px] font-extrabold text-ink">
          {flash}
        </p>
      ) : null}

      {current === 'rate' ? (
        toRate.length === 0 ? (
          <Empty
            title="Nobody to rate right now"
            body="After a 1:1 session ends, or once you've been in a class for 30 days, your tutor shows up here."
          />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-ds-3 lg:grid-cols-2">
            {toRate.map((t) => (
              <ToRateCard
                key={t.kind === 'session' ? `s-${t.tutor.id}` : `g-${t.groupId}`}
                item={t}
                onRate={() => setTarget({ mode: 'create', item: t } as Target)}
              />
            ))}
          </div>
        )
      ) : rated.length === 0 ? (
        <Empty title="No ratings yet" body="Ratings you leave for your tutors and classes show up here, and you can change them any time." />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-ds-3 lg:grid-cols-2">
          {rated.map((r) => (
            <RatedCard key={`${r.kind}-${r.id}`} item={r} onEdit={() => setTarget({ mode: 'edit', item: r } as Target)} />
          ))}
        </div>
      )}

      {target ? (
        <RateSheet
          key={target.mode === 'edit' ? target.item.id : target.item.kind === 'session' ? target.item.tutor.id : target.item.groupId}
          target={target}
          onClose={() => setTarget(null)}
          onDone={(msg) => {
            setTarget(null);
            setFlash(msg);
            setTab('rated');
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card px-ds-4 py-ds-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-ds-sm bg-surface-sunken text-ink">
        <Star size={24} aria-hidden />
      </span>
      <p className="m-0 font-display text-[18px] font-extrabold text-ink">{title}</p>
      <p className="m-0 max-w-[40ch] font-body text-[14px] text-ink-muted">{body}</p>
    </div>
  );
}

function ToRateCard({ item, onRate }: { item: SessionToRate | ClassToRate; onRate: () => void }) {
  const locked = item.kind === 'group' && Boolean(item.opensAt);
  return (
    <article className={card}>
      <div className="flex min-w-0 items-start gap-ds-3">
        <Avatar person={item.tutor} />
        <div className="flex min-w-0 flex-1 flex-col gap-ds-1">
          <div className="flex min-w-0 items-center gap-ds-2">
            <span className="min-w-0 truncate font-body text-[16px] font-extrabold text-ink">
              {item.kind === 'group' ? item.className : item.tutor.name}
            </span>
            <KindTag kind={item.kind} />
          </div>
          <span className="flex min-w-0 items-center gap-ds-1 font-body text-[14px] text-ink-muted">
            {item.kind === 'group' ? (
              <>
                <UsersThree size={16} weight="bold" className="shrink-0" aria-hidden />
                <span className="truncate">with {item.tutor.name}</span>
              </>
            ) : (
              <>
                <ChalkboardTeacher size={16} weight="bold" className="shrink-0" aria-hidden />
                <span className="truncate">
                  {plural(item.sessionCount, 'session')} · last {fmtDate(item.lastAt)}
                </span>
              </>
            )}
          </span>
        </div>
      </div>
      {locked ? (
        <p className="m-0 rounded-ds-sm bg-surface-sunken px-ds-3 py-ds-2 font-body text-[14px] font-bold text-ink">
          You can review this class from {fmtDate((item as ClassToRate).opensAt!)}.
        </p>
      ) : (
        <Button variant="primary" size="md" block="always" onClick={onRate}>
          {item.kind === 'group' ? 'Review class' : 'Rate tutor'}
        </Button>
      )}
    </article>
  );
}

function RatedCard({ item, onEdit }: { item: SessionRated | ClassRated; onEdit: () => void }) {
  const score = item.kind === 'group' ? item.rating : item.stars;
  const removed = item.kind === 'session' && item.removed;
  const system = item.kind === 'session' && item.systemIssued;
  return (
    <article className={cn(card, removed && 'opacity-70')}>
      <div className="flex min-w-0 items-start gap-ds-3">
        <Avatar person={item.tutor} />
        <div className="flex min-w-0 flex-1 flex-col gap-ds-1">
          <div className="flex min-w-0 items-center gap-ds-2">
            <span className="min-w-0 truncate font-body text-[16px] font-extrabold text-ink">
              {item.kind === 'group' ? item.className : item.tutor.name}
            </span>
            <KindTag kind={item.kind} />
          </div>
          {item.kind === 'group' ? (
            <span className="truncate font-body text-[14px] text-ink-muted">with {item.tutor.name}</span>
          ) : null}
          <span className="flex flex-wrap items-center gap-x-ds-2 gap-y-ds-1">
            <Stars value={score} />
            <span className="font-body text-[13px] text-ink-muted">{fmtDate(item.createdAt)}</span>
          </span>
        </div>
      </div>

      {item.kind === 'group' && item.patience != null && item.explanation != null && item.classMaterial != null ? (
        <dl className="m-0 grid grid-cols-3 gap-ds-2">
          {CATEGORIES.map((c) => (
            <div key={c.key} className="flex min-w-0 flex-col gap-[2px] rounded-ds-sm bg-surface-sunken px-ds-2 py-ds-2">
              <dt className="truncate font-body text-[12px] font-extrabold uppercase tracking-[0.6px] text-ink-muted">{c.label}</dt>
              <dd className="m-0 font-display text-[18px] font-black tabular-nums text-ink">{item[c.key]}/5</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {item.comment ? <p className="m-0 whitespace-pre-line break-words font-body text-[15px] text-ink">{item.comment}</p> : null}

      {item.tutorReply ? (
        <div className="flex flex-col gap-ds-1 rounded-ds-sm bw-hair border-line-soft bg-surface-page p-ds-3">
          <span className="flex items-center gap-ds-1 font-body text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">
            <ChatCircleText size={14} weight="bold" aria-hidden /> {item.tutor.name.split(' ')[0]} replied
          </span>
          <p className="m-0 whitespace-pre-line break-words font-body text-[14px] text-ink">{item.tutorReply}</p>
        </div>
      ) : null}

      {removed ? (
        <div className="flex flex-wrap items-center gap-ds-2">
          <Tag tone="danger">Removed</Tag>
          <span className="font-body text-[14px] text-ink-muted">A moderator removed this rating.</span>
        </div>
      ) : system ? (
        <div className="flex flex-wrap items-center gap-ds-2">
          <Tag tone="dark">Set by iTutor</Tag>
          <span className="font-body text-[14px] text-ink-muted">Added automatically after a missed session.</span>
        </div>
      ) : item.canEdit ? (
        <Button variant="outline" size="sm" block="always" onClick={onEdit}>
          Edit rating
        </Button>
      ) : (
        <span className="font-body text-[14px] text-ink-muted">
          {item.kind === 'group' ? 'You can edit this while you are in the class.' : 'This rating can no longer be edited.'}
        </span>
      )}
    </article>
  );
}

function RateSheet({ target, onClose, onDone }: { target: Target; onClose: () => void; onDone: (msg: string) => void }) {
  const { mode, item } = target;
  const isGroup = item.kind === 'group';
  const editing = mode === 'edit';

  const [stars, setStars] = useState(editing && item.kind === 'session' ? (item as SessionRated).stars : 0);
  const [cats, setCats] = useState<Record<CatKey, number>>(() => {
    if (editing && item.kind === 'group') {
      const r = item as ClassRated;
      // Legacy single-score reviews have no categories: start them at the overall.
      return {
        patience: r.patience ?? r.rating,
        explanation: r.explanation ?? r.rating,
        classMaterial: r.classMaterial ?? r.rating,
      };
    }
    return { patience: 0, explanation: 0, classMaterial: 0 };
  });
  const [comment, setComment] = useState(editing ? ((item as SessionRated | ClassRated).comment ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = isGroup ? cats.patience > 0 && cats.explanation > 0 && cats.classMaterial > 0 : stars > 0;
  const name = item.kind === 'group' ? item.className : item.tutor.name;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    const text = comment.trim();
    let url: string;
    let method: 'POST' | 'PATCH';
    let body: Record<string, unknown>;
    if (isGroup) {
      body = {
        patience_rating: cats.patience,
        explanation_rating: cats.explanation,
        class_material_rating: cats.classMaterial,
      };
      if (editing) {
        url = `/api/student/ratings/group/${(item as ClassRated).id}`;
        method = 'PATCH';
        body.comment = text || null;
      } else {
        url = `/api/groups/${(item as ClassToRate).groupId}/reviews`;
        method = 'POST';
        if (text) body.comment = text; // the create route takes a string or nothing
      }
    } else if (editing) {
      url = `/api/student/ratings/session/${(item as SessionRated).id}`;
      method = 'PATCH';
      body = { stars, comment: text || null };
    } else {
      url = '/api/feedback/student';
      method = 'POST';
      body = { sessionId: (item as SessionToRate).sessionId, stars, comment: text || null };
    }
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Something went wrong. Try again.');
      onDone(editing ? 'Rating updated.' : `Thanks — your rating for ${name} is in.`);
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Edit your rating' : isGroup ? 'Review this class' : `Rate ${item.tutor.name.split(' ')[0]}`}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" disabled={!ready || busy} onClick={() => void submit()}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Submit rating'}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 items-center gap-ds-3">
        <Avatar person={item.tutor} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-body text-[16px] font-extrabold text-ink">{name}</span>
          <span className="truncate font-body text-[14px] text-ink-muted">
            {isGroup ? `with ${item.tutor.name}` : '1:1 sessions'}
          </span>
        </div>
      </div>

      {isGroup ? (
        <div className="flex flex-col">
          {CATEGORIES.map((c, i) => (
            <div key={c.key} className={cn('flex flex-col gap-ds-1 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
              <span className="font-body text-[15px] font-extrabold text-ink">{c.label}</span>
              <span className="font-body text-[13px] text-ink-muted">{c.hint}</span>
              <StarPicker label={c.label} value={cats[c.key]} onChange={(n) => setCats((p) => ({ ...p, [c.key]: n }))} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-ds-1">
          <span className="font-body text-[15px] font-extrabold text-ink">How were your sessions?</span>
          <StarPicker label="Your rating" value={stars} onChange={setStars} />
        </div>
      )}

      <label className="flex flex-col gap-ds-1">
        <span className="font-body text-[15px] font-extrabold text-ink">
          Comment <span className="font-bold text-ink-muted">(optional)</span>
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What stood out? Other students will see this."
          className="min-h-[104px] w-full resize-y rounded-ds-sm bw-hair border-border-strong bg-surface-card p-[12px] font-body text-[16px] text-ink placeholder:text-[#757575]"
        />
      </label>

      {err ? (
        <p role="alert" className="m-0 font-body text-[14px] font-bold text-danger">
          {err}
        </p>
      ) : null}
    </Sheet>
  );
}
