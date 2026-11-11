'use client';

import { cn } from '@/lib/utils';

// Child picker with inline checks — handover §5.
//
// Browsing stays neutral: there is no "shopping as" mode and no child in the
// header. The child is chosen HERE, inside the booking flow, and only then do
// the two checks resolve. That ordering is the point — a parent comparing classes
// should not have to pick a child first, and a check run before a child is named
// would be a check against nobody.
//
// §5's rules, each visible in the markup below:
//   one linked child   the picker is skipped entirely
//   clear              a check mark and "No schedule conflicts"
//   conflict           the stated sentence, then alternatives
//   no alternatives    "No tutors found." — NOT an error state
//   level mismatch     a confirmation, never a block
//   one child          per checkout; two children means two transactions

import { useCallback, useEffect, useState } from 'react';
import { Check, Info, Loader2 } from 'lucide-react';
import { formatLevelShort } from '@/lib/utils/formatLevel';

type Child = { id: string; name: string; formLevel: string | null };

type Alternative = {
  groupId: string;
  name: string;
  tutorName: string;
  priceMonthly: number | null;
  when: string | null;
};

type CheckResult = {
  childLevel: string | null;
  classFormLevel: string | null;
  levelMismatch: boolean;
  levelMessage: string | null;
  schedule:
    | { checked: false; reason: string }
    | { checked: true; clear: boolean; message: string; detail?: string };
  alternatives: Alternative[];
  alternativesMessage?: string | null;
  /** Set when the child is already in — or already waiting on — this class. */
  alreadyIn?: { status: 'enrolled' | 'pending'; message: string } | null;
};

export default function ChildPickerCheck({
  groupId,
  start,
  end,
  onReady,
  showHeading = true,
  variant = 'legacy',
}: {
  groupId?: string | null;
  start?: string | null;
  end?: string | null;
  /** Called with the child to book for, or null while the parent cannot proceed. */
  onReady?: (childId: string | null) => void;
  /** False where the surrounding dialog already asks "Who is this for?". */
  showHeading?: boolean;
  /** 'ds' = the new design system (parent new UI). Same logic, same checks. */
  variant?: 'legacy' | 'ds';
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [levelAccepted, setLevelAccepted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/children/summary', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          const list: Child[] = (json.children ?? []).map(
            (c: { id: string; name?: string; full_name?: string; form_level?: string | null }) => ({
              id: c.id,
              name: c.name ?? c.full_name ?? 'Child',
              formLevel: c.form_level ?? null,
            })
          );
          setChildren(list);
          // §5: skipped entirely when the parent has one linked child.
          if (list.length === 1) setChildId(list[0].id);
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const runCheck = useCallback(
    async (id: string) => {
      setChecking(true);
      setResult(null);
      setLevelAccepted(false);
      try {
        const res = await fetch('/api/parent/booking/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId: id, groupId: groupId ?? null, start, end }),
        });
        if (res.ok) setResult(await res.json());
      } finally {
        setChecking(false);
      }
    },
    [groupId, start, end]
  );

  useEffect(() => {
    if (childId) void runCheck(childId);
  }, [childId, runCheck]);

  // A clash blocks; a level mismatch only needs acknowledging. That asymmetry is
  // §5's, not an accident: one is a fact about the child's diary, the other is a
  // judgement the parent is entitled to make.
  const alreadyIn = result?.alreadyIn ?? null;
  const clashes = result?.schedule.checked === true && result.schedule.clear === false;
  const needsLevelAck = Boolean(result?.levelMismatch) && !levelAccepted;
  const canProceed =
    Boolean(childId) && !checking && !alreadyIn && !clashes && !needsLevelAck;

  useEffect(() => {
    onReady?.(canProceed ? childId : null);
  }, [canProceed, childId, onReady]);

  if (!loaded) return null;

  if (variant === 'ds') {
    return (
      <DsPicker
        kids={children}
        childId={childId}
        setChildId={setChildId}
        checking={checking}
        result={result}
        alreadyIn={alreadyIn}
        clashes={clashes}
        canProceed={canProceed}
        levelAccepted={levelAccepted}
        setLevelAccepted={setLevelAccepted}
        noSlotYet={!groupId && !start}
      />
    );
  }

  if (children.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Link a child to your account before booking a class for them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {children.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          Booking for {children[0].name} — your only linked child.
        </p>
      ) : (
        <>
          {showHeading && <p className="text-sm font-semibold text-ink">Who is this for?</p>}
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => setChildId(c.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                  childId === c.id
                    ? 'border-brand bg-brand/10 text-ink'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {c.name}
                {c.formLevel && (
                  <span className="text-xs font-normal text-muted-foreground">{formatLevelShort(c.formLevel)}</span>
                )}
              </button>
            ))}
          </div>
          {/* Decision 26, said before it becomes a surprise at the card form. */}
          <p className="text-xs text-muted-foreground">
            One child per checkout. Two children in the same class means two separate payments — do
            this one first, then repeat.
          </p>
        </>
      )}

      {checking && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking {children.find((c) => c.id === childId)?.name.split(' ')[0]}’s schedule…
        </div>
      )}

      {/* Already in the class: the one true reason, said alone. A level
          confirmation or a list of alternatives underneath it would be
          answering a question the parent has not reached. */}
      {result && !checking && alreadyIn && (
        <Row tone="neutral" icon={<Info className="size-4" />}>
          {alreadyIn.message}
        </Row>
      )}

      {result && !checking && !alreadyIn && (
        <div className="space-y-2">
          {result.schedule.checked === false ? (
            <Row tone="neutral" icon={<Info className="size-4" />}>
              This class has no scheduled sessions yet, so there is nothing to check against.
            </Row>
          ) : result.schedule.clear ? (
            <Row tone="ok" icon={<Check className="size-4" />}>
              No schedule conflicts
            </Row>
          ) : (
            <>
              <Row tone="neutral" icon={<Info className="size-4" />}>
                <strong>{result.schedule.message}</strong>
                {result.schedule.detail && (
                  <span className="mt-0.5 block text-muted-foreground">{result.schedule.detail}</span>
                )}
              </Row>

              {result.alternatives.length > 0 ? (
                <div className="rounded-xl border border-border p-3.5">
                  <p className="text-sm font-semibold text-ink">Instead try these classes</p>
                  <div className="mt-2 grid gap-2">
                    {result.alternatives.map((a) => (
                      <div key={a.groupId} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-ink">
                            {a.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {a.tutorName}
                            {a.when ? ` · ${a.when}` : ''}
                          </span>
                        </span>
                        <a
                          href={`/student/explore/${a.groupId}`}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink"
                        >
                          View
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Not an error state, and styled as ordinary text so it does not
                   read as one. */
                <p className="text-sm text-muted-foreground">No tutors found.</p>
              )}
            </>
          )}

          {/* Amber on a light card: the ink has to be dark. The earlier
              amber-100 text was written for a dark surface and vanished into
              the modal's white background. */}
          {result.levelMismatch && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
              <p className="text-xs leading-relaxed text-amber-900">{result.levelMessage}</p>
              <button
                onClick={() => setLevelAccepted((v) => !v)}
                className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-amber-900"
              >
                <span
                  className={`grid size-4 place-items-center rounded border-2 border-amber-600 ${
                    levelAccepted ? 'bg-amber-600' : ''
                  }`}
                >
                  {levelAccepted && <Check className="size-2.5 text-white" strokeWidth={4} />}
                </span>
                Yes, this is the class I want
              </button>
            </div>
          )}
        </div>
      )}

      {!childId && children.length > 1 && (
        <p className="text-xs text-muted-foreground">Pick a child first.</p>
      )}
      {clashes && (
        <p className="text-xs text-muted-foreground">Resolve the clash to continue.</p>
      )}
      {alreadyIn && children.length > 1 && (
        <p className="text-xs text-muted-foreground">Pick another child to continue.</p>
      )}
      {canProceed && (
        /* §5: no approval step — the parent is the decision-maker. */
        <p className="text-xs text-muted-foreground">
          You are the decision-maker, so this needs no approval step.
        </p>
      )}
    </div>
  );
}

function Row({
  tone,
  icon,
  children,
}: {
  tone: 'ok' | 'neutral';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'ok'
      ? 'border-brand/30 bg-brand/10 text-ink'
      : 'border-border bg-muted/40 text-ink';
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${cls}`}>
      <span className={tone === 'ok' ? 'mt-0.5 text-brand' : 'mt-0.5 text-muted-foreground'}>{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ─── New design system render ─────────────────────────────────────────────
   PROVISIONAL visuals (no frame draws this dialog's states): children as a
   radio list of cards, each check as one status row. Same state as above. */

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function DsStatus({ tone, children }: { tone: 'ok' | 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-ds-2 rounded-ds-sm bw-hair px-ds-3 py-ds-2 font-body text-[14px] leading-[20px] text-ink',
        tone === 'ok' && 'border-brand-legacy bg-surface-card',
        tone === 'info' && 'border-border bg-surface-sunken',
        tone === 'warn' && 'border-accent-yellow bg-surface-card'
      )}
    >
      <span className={cn('mt-[2px] shrink-0', tone === 'ok' ? 'text-brand-edge' : 'text-ink-muted')}>
        {tone === 'ok' ? <Check className="size-4" strokeWidth={3} /> : <Info className="size-4" />}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DsPicker({
  kids,
  childId,
  setChildId,
  checking,
  result,
  alreadyIn,
  clashes,
  canProceed,
  levelAccepted,
  setLevelAccepted,
  noSlotYet,
}: {
  noSlotYet: boolean;
  kids: Child[];
  childId: string | null;
  setChildId: (id: string) => void;
  checking: boolean;
  result: CheckResult | null;
  alreadyIn: CheckResult['alreadyIn'] | null;
  clashes: boolean;
  canProceed: boolean;
  levelAccepted: boolean;
  setLevelAccepted: (fn: (v: boolean) => boolean) => void;
}) {
  if (kids.length === 0) {
    return (
      <DsStatus tone="info">
        Link a child to your account before booking for them. Add one from Account, then Settings.
      </DsStatus>
    );
  }
  const chosen = kids.find((c) => c.id === childId);
  const first = chosen?.name.split(' ')[0] ?? 'your child';
  return (
    <div className="flex flex-col gap-ds-3">
      <div role="radiogroup" aria-label="Who is this for?" className="flex flex-col gap-ds-2">
        {kids.map((c) => {
          const on = c.id === childId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChildId(c.id)}
              className={cn(
                'ds-press flex min-h-[64px] w-full items-center gap-ds-3 rounded-ds-card bg-surface-card px-ds-3 py-ds-2 text-left cursor-pointer',
                on ? 'bw-bold border-ink' : 'bw-hair border-border'
              )}
            >
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-ds-sm font-display text-[15px] font-extrabold',
                  on ? 'bg-brand text-ink' : 'bg-surface-sunken text-ink'
                )}
              >
                {initialsOf(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[16px] font-extrabold text-ink">{c.name}</span>
                {c.formLevel ? (
                  <span className="block font-body text-[13px] text-ink-muted">{formatLevelShort(c.formLevel)}</span>
                ) : null}
              </span>
              <span
                aria-hidden
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full',
                  on ? 'bg-ink text-brand' : 'bw-bold border-border-strong'
                )}
              >
                {on ? <Check className="size-3.5" strokeWidth={3.5} /> : null}
              </span>
            </button>
          );
        })}
      </div>

      {kids.length > 1 ? (
        <p className="m-0 font-body text-[13px] leading-[18px] text-ink-muted">
          One child per checkout. For two children, finish this one, then do it again.
        </p>
      ) : null}

      {checking ? (
        <DsStatus tone="info">
          <span className="inline-flex items-center gap-ds-2">
            <Loader2 className="size-4 animate-spin" /> Checking {first}&rsquo;s schedule…
          </span>
        </DsStatus>
      ) : null}

      {result && !checking && alreadyIn ? <DsStatus tone="info">{alreadyIn.message}</DsStatus> : null}

      {result && !checking && !alreadyIn ? (
        <>
          {result.schedule.checked === false ? (
            <DsStatus tone="info">
              {noSlotYet
                ? `Pick a time below and we check it against ${first}’s other classes.`
                : 'No sessions are scheduled yet, so there is nothing to clash with.'}
            </DsStatus>
          ) : result.schedule.clear ? (
            <DsStatus tone="ok">No clashes with {first}&rsquo;s other classes</DsStatus>
          ) : (
            <>
              <DsStatus tone="warn">
                <strong className="font-extrabold">{result.schedule.message}</strong>
                {result.schedule.detail ? <span className="block text-ink-muted">{result.schedule.detail}</span> : null}
              </DsStatus>
              {result.alternatives.length > 0 ? (
                <div className="flex flex-col gap-ds-2 rounded-ds-sm bw-hair border-border p-ds-3">
                  <p className="m-0 font-display text-[15px] font-extrabold text-ink">Try one of these instead</p>
                  {result.alternatives.map((a) => (
                    <a key={a.groupId} href={`/parent/classes/${a.groupId}`} className="flex items-center gap-ds-2 no-underline">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-body text-[14px] font-extrabold text-ink">{a.name}</span>
                        <span className="block font-body text-[13px] text-ink-muted">
                          {a.tutorName}
                          {a.when ? ` · ${a.when}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-body text-[14px] font-extrabold text-brand-edge">View</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {result.levelMismatch ? (
            <div className="flex flex-col gap-ds-2 rounded-ds-sm bw-hair border-accent-yellow bg-surface-card p-ds-3">
              <p className="m-0 font-body text-[14px] leading-[20px] text-ink">{result.levelMessage}</p>
              <button
                type="button"
                role="checkbox"
                aria-checked={levelAccepted}
                onClick={() => setLevelAccepted((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-ds-2 self-start border-0 bg-transparent p-0 font-body text-[14px] font-extrabold text-ink cursor-pointer"
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-[4px]',
                    levelAccepted ? 'bg-ink text-brand' : 'bw-bold border-ink'
                  )}
                >
                  {levelAccepted ? <Check className="size-3" strokeWidth={4} /> : null}
                </span>
                Yes, this is the right level
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {!childId && kids.length > 1 ? (
        <p className="m-0 font-body text-[13px] text-ink-muted">Choose a child to continue.</p>
      ) : null}
      {clashes ? <p className="m-0 font-body text-[13px] text-ink-muted">Pick a different time to continue.</p> : null}
      {alreadyIn && kids.length > 1 ? (
        <p className="m-0 font-body text-[13px] text-ink-muted">Choose another child to continue.</p>
      ) : null}
      {canProceed ? (
        <p className="m-0 font-body text-[13px] text-ink-muted">You are booking as their parent, so no approval step is needed.</p>
      ) : null}
    </div>
  );
}
