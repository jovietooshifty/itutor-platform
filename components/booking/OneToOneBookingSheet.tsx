'use client';

/**
 * Book a 1:1 lesson, as a stepped sheet. One component for both sides:
 *
 * - mode 'student' (student tutor page, new UI): Subject & length → Day &
 *   time → Review & pay. POSTs /api/bookings/direct-book.
 * - mode 'parent' (parent tutor page): Who → Subject & length → Day & time →
 *   Review & pay. POSTs /api/parent/bookings/direct-book with childId.
 *
 * Steps instead of one long scroll (owner, 14 Nov): each step fits a 390×844
 * phone and a 1116×820 laptop with at most a small scroll. The time step
 * shows a horizontal day strip and only the chosen day's times, split into
 * Morning / Afternoon / Evening, in a grid capped at four rows.
 *
 * THE BACKEND DOES NOT CHANGE. Both routes run lib/bookings/directBook.ts:
 * - paid → a Stripe PaymentIntent and no booking row until the webhook sees
 *   the payment; we hand off to /payments/checkout?pi=….
 * - an existing unpaid booking (duplicate branch) → booking_id +
 *   requires_payment; we hand off to /payments/checkout?bookingId=….
 * - free → the booking is created CONFIRMED; we say so (success state).
 * The server re-checks availability, overlap, the 15-minute lead and (parent)
 * the parent↔child link and the child's own schedule.
 *
 * Slots come from lib/bookings/slots.ts, the same maths the old student
 * sheet used. The paid-classes flag comes from /api/feature-flags: the
 * browser-side flag is always true in the client bundle.
 *
 * Parent: ChildPickerCheck (ds) stays MOUNTED across every step and is handed
 * the chosen slot, so the clash check re-runs once a time is picked. It is
 * visible on the Who step, and again on Review if that check now blocks.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarCheck } from '@phosphor-icons/react';
import { Button, Segmented, SummaryRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import ChildPickerCheck from '@/components/parent/ChildPickerCheck';
import { Sheet } from '@/components/parent/v2/Sheet';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import {
  effectiveWindows,
  emptySlots,
  fmtTime,
  loadCalendar,
  minBookableStartHour,
  slotToISO,
  startsForDuration,
  type DayAvail,
} from '@/lib/bookings/slots';

const DAYS = 28;
const DEFAULT_LENGTHS = [1, 1.5, 2];
const money = (n: number) => `TT$${n.toFixed(2).replace(/\.00$/, '')}`;
const lengthLabel = (h: number) => (h === 1 ? '1 hour' : `${h} hours`);

export type BookableSubject = { id: string; label: string; rate: number | null };

type StepId = 'who' | 'what' | 'when' | 'review';
type Part = 'morning' | 'afternoon' | 'evening';
const PARTS: Array<{ id: Part; label: string; test: (h: number) => boolean }> = [
  { id: 'morning', label: 'Morning', test: (h) => h < 12 },
  { id: 'afternoon', label: 'Afternoon', test: (h) => h >= 12 && h < 17 },
  { id: 'evening', label: 'Evening', test: (h) => h >= 17 },
];

const STEP_TITLES: Record<StepId, string> = {
  who: 'Who is it for?',
  what: 'Subject and length',
  when: 'Pick a day and time',
  review: 'Check and confirm',
};

function Chip({
  on,
  onClick,
  children,
  disabled,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'ds-press inline-flex min-h-[44px] items-center justify-center rounded-ds-sm px-ds-3 font-body text-[14px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
        on ? 'border-0 bg-ink text-white' : 'bw-hair border-border bg-surface-card text-ink',
        className
      )}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <h3 className="m-0 font-display text-[16px] font-extrabold text-ink">{children}</h3>;
}

export interface OneToOneBookingSheetProps {
  mode: 'student' | 'parent';
  open: boolean;
  onClose: () => void;
  tutorId: string;
  /** Full display name, for the review step. */
  tutorName: string;
  tutorFirstName: string;
  subjects: BookableSubject[];
  /** Lesson lengths in hours. Lengths no open window can fit are hidden. */
  lengths?: number[];
}

export function OneToOneBookingSheet({
  mode,
  open,
  onClose,
  tutorId,
  tutorName,
  tutorFirstName,
  subjects,
  lengths = DEFAULT_LENGTHS,
}: OneToOneBookingSheetProps) {
  const router = useRouter();
  const steps: StepId[] = mode === 'parent' ? ['who', 'what', 'when', 'review'] : ['what', 'when', 'review'];
  const [step, setStep] = useState<StepId>(steps[0]);
  const [paidOn, setPaidOn] = useState(true);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [length, setLength] = useState(lengths[0] ?? 1);
  const [days, setDays] = useState<DayAvail[]>(() => emptySlots(DAYS));
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState(false);
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const [part, setPart] = useState<Part>('morning');
  const [startHour, setStartHour] = useState<number | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [childNames, setChildNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const dayStripRef = useRef<HTMLDivElement>(null);

  // A parent's subjects need a rate to be bookable (unchanged from the parent
  // sheet). A student's need one only while paid classes are on: with them
  // off, every 1:1 is free.
  const canPick = useCallback(
    (s: BookableSubject) => (mode === 'parent' ? (s.rate ?? 0) > 0 : !paidOn || (s.rate ?? 0) > 0),
    [mode, paidOn]
  );
  const pickable = useMemo(() => subjects.filter(canPick), [subjects, canPick]);

  // Reset and load each time the sheet opens: availability goes stale fast.
  useEffect(() => {
    if (!open) return;
    setStep(mode === 'parent' ? 'who' : 'what');
    setError(null);
    setBooked(false);
    setStartHour(null);
    setCalLoading(true);
    setCalError(false);
    let cancelled = false;
    loadCalendar(tutorId, DAYS)
      .then((d) => {
        if (!cancelled) setDays(d);
      })
      .catch(() => {
        if (!cancelled) setCalError(true);
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });
    fetch('/api/feature-flags', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setPaidOn(Boolean(j.paidClassesEnabled));
      })
      .catch(() => undefined);
    if (mode === 'parent') {
      // Names for the review row only; ChildPickerCheck owns the choosing.
      fetch('/api/parent/children/summary', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled || !j) return;
          const map: Record<string, string> = {};
          for (const c of j.children ?? []) map[c.id] = c.name ?? c.full_name ?? 'Your child';
          setChildNames(map);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [open, tutorId, mode]);

  // One bookable subject: choose it.
  useEffect(() => {
    if (!open) return;
    setSubjectId((prev) => {
      if (prev && pickable.some((s) => s.id === prev)) return prev;
      return pickable.length === 1 ? pickable[0].id : null;
    });
  }, [open, pickable]);

  const effByDay = useMemo(() => days.map((d) => effectiveWindows(d.windows, d.booked)), [days]);
  const startsByDay = useMemo(
    () => days.map((d, i) => startsForDuration(effByDay[i], length, d.date)),
    [days, effByDay, length]
  );

  // Only offer lengths some open window can hold. The first length always
  // stays, so the row is never empty while the calendar loads.
  const lengthOptions = useMemo(() => {
    if (calLoading) return lengths;
    return lengths.filter(
      (l, i) => i === 0 || days.some((d, di) => startsForDuration(effByDay[di], l, d.date).length > 0)
    );
  }, [calLoading, lengths, days, effByDay]);
  useEffect(() => {
    if (!lengthOptions.includes(length)) setLength(lengthOptions[0] ?? 1);
  }, [lengthOptions, length]);

  // Land on the first day with a time, and drop a time that no longer fits.
  useEffect(() => {
    if (calLoading) return;
    if (dayIdx == null || startsByDay[dayIdx]?.length === 0) {
      const firstOpen = startsByDay.findIndex((s) => s.length > 0);
      setDayIdx(firstOpen >= 0 ? firstOpen : null);
    }
  }, [calLoading, startsByDay, dayIdx]);
  useEffect(() => {
    if (dayIdx == null || startHour == null) return;
    if (!startsByDay[dayIdx]?.includes(startHour)) setStartHour(null);
  }, [startsByDay, dayIdx, startHour]);

  const dayStarts = dayIdx != null ? startsByDay[dayIdx] ?? [] : [];
  const partsWithTimes = PARTS.filter((p) => dayStarts.some(p.test));
  // Keep the segment on one that has times (and on the chosen time's).
  useEffect(() => {
    if (partsWithTimes.length === 0) return;
    if (startHour != null) {
      const owner = PARTS.find((p) => p.test(startHour));
      if (owner && owner.id !== part) setPart(owner.id);
      return;
    }
    if (!partsWithTimes.some((p) => p.id === part)) setPart(partsWithTimes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIdx, length, partsWithTimes.map((p) => p.id).join()]);

  // Bring the chosen day into view when the time step opens.
  useEffect(() => {
    if (step !== 'when' || dayIdx == null) return;
    const el = dayStripRef.current?.querySelector<HTMLElement>(`[data-day="${dayIdx}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const subject = pickable.find((s) => s.id === subjectId) ?? null;
  const slot = dayIdx != null && startHour != null ? slotToISO(days[dayIdx].date, startHour, length) : null;
  const base = subject?.rate && paidOn ? Number((subject.rate * length).toFixed(2)) : 0;
  const gross = base > 0 ? calculateGrossAmountForProvider(base, 'stripe') : null;
  const anyOpen = startsByDay.some((s) => s.length > 0);
  const stepIndex = steps.indexOf(step);
  const childOk = mode === 'student' || Boolean(childId);

  const stepValid: Record<StepId, boolean> = {
    who: Boolean(childId),
    what: Boolean(subject),
    when: Boolean(slot),
    review: Boolean(subject && slot && childOk) && !busy,
  };

  const goNext = () => {
    setError(null);
    const next = steps[stepIndex + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    setError(null);
    const prev = steps[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const submit = async () => {
    if (!subject || !slot || dayIdx == null || startHour == null) return;
    if (mode === 'parent' && !childId) return;
    // The sheet can sit open past the 15-minute lead.
    const minStart = minBookableStartHour(days[dayIdx].date);
    if (minStart != null && startHour < minStart - 1e-9) {
      setStartHour(null);
      setStep('when');
      setError('That time is too close now. Pick a later one.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url = mode === 'parent' ? '/api/parent/bookings/direct-book' : '/api/bookings/direct-book';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(mode === 'parent' ? { childId } : {}),
          tutorId,
          subjectId: subject.id,
          requestedStartAt: slot.start,
          requestedEndAt: slot.end,
          durationMinutes: Math.round(length * 60),
          studentNotes: note.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error || 'That time could not be booked. Pick another.';
        setError(json?.details ? `${msg}: ${json.details}` : msg);
        return;
      }
      // Paid: no booking exists yet. Checkout rebuilds the summary from the
      // PaymentIntent and the webhook creates the booking on success.
      if (json.paymentIntentId) {
        router.push(`/payments/checkout?pi=${encodeURIComponent(json.paymentIntentId)}`);
        return;
      }
      // An existing booking that is still unpaid (duplicate branch).
      if (json.booking_id && json.requires_payment) {
        router.push(`/payments/checkout?bookingId=${encodeURIComponent(json.booking_id)}`);
        return;
      }
      // Free: claim success only with the server's proof of a booking.
      if (json.booking_id) {
        setNote('');
        setBooked(true);
        return;
      }
      setError('This page is out of date. Refresh and try again.');
    } catch {
      setError('Could not reach iTutor. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const whenLong = slot
    ? `${new Date(slot.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(startHour!)}–${fmtTime(startHour! + length)}`
    : '';

  if (booked) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Lesson booked"
        footer={
          <Button
            block="always"
            size="lg"
            onClick={() => router.push(mode === 'parent' ? '/parent/calendar' : '/student/bookings')}
          >
            {mode === 'parent' ? 'See it on your calendar' : 'See your bookings'}
          </Button>
        }
      >
        <div className="flex items-start gap-ds-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-ds-sm bg-brand text-ink">
            <CalendarCheck size={22} weight="bold" aria-hidden />
          </span>
          <p className="m-0 font-body text-[15px] leading-[22px] text-ink">
            {subject?.label} with {tutorFirstName}
            {whenLong ? `, ${whenLong}` : ''}. {tutorFirstName} has been told, and you will get a confirmation shortly.
          </p>
        </div>
      </Sheet>
    );
  }

  const title = (
    <span className="flex flex-col gap-[6px]">
      <span className="font-body text-[13px] font-extrabold text-ink-muted">
        Book {tutorFirstName} · Step {stepIndex + 1} of {steps.length}
      </span>
      <span>{STEP_TITLES[step]}</span>
      <span className="flex gap-ds-1" aria-hidden>
        {steps.map((s, i) => (
          <span key={s} className={cn('h-[4px] flex-1 rounded-ds-full', i <= stepIndex ? 'bg-ink' : 'bg-line-soft')} />
        ))}
      </span>
    </span>
  );

  const primaryLabel =
    step !== 'review'
      ? 'Continue'
      : busy
        ? 'Working…'
        : gross
          ? `Continue to pay ${money(gross.grossAmount)}`
          : 'Book lesson';

  const footer = (
    <div className="flex w-full items-center gap-ds-2">
      {stepIndex > 0 ? (
        <Button variant="outline" size="lg" onClick={goBack} className="shrink-0 px-ds-3" disabled={busy}>
          <ArrowLeft size={18} weight="bold" aria-hidden />
          Back
        </Button>
      ) : null}
      <Button
        size="lg"
        className="min-w-0 flex-1"
        disabled={!stepValid[step]}
        onClick={() => (step === 'review' ? void submit() : goNext())}
      >
        {primaryLabel}
      </Button>
    </div>
  );

  const showPicker = mode === 'parent' && (step === 'who' || (step === 'review' && !childId));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      label={`Book a 1:1 with ${tutorFirstName}, step ${stepIndex + 1} of ${steps.length}: ${STEP_TITLES[step]}`}
      footer={footer}
    >
      {/* Mounted on every step so its clash check re-runs with the slot. */}
      {mode === 'parent' ? (
        <div className={cn('flex flex-col gap-ds-2', !showPicker && 'hidden')}>
          {step === 'review' ? (
            <p className="m-0 font-body text-[14px] font-extrabold text-ink">Check who this is for at that time</p>
          ) : null}
          <ChildPickerCheck
            variant="ds"
            start={slot?.start ?? null}
            end={slot?.end ?? null}
            onReady={setChildId}
            showHeading={false}
          />
        </div>
      ) : null}

      {step === 'what' ? (
        pickable.length === 0 ? (
          <p className="m-0 font-body text-[15px] leading-[22px] text-ink-muted">
            {tutorFirstName} has not set an hourly price yet, so 1:1 lessons cannot be booked.
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-ds-2">
              <Label>Subject</Label>
              <div className="flex flex-wrap gap-ds-2">
                {subjects.map((s) => {
                  const ok = canPick(s);
                  return (
                    <Chip
                      key={s.id}
                      on={s.id === subjectId}
                      disabled={!ok}
                      onClick={() => {
                        setSubjectId(s.id);
                        setStartHour(null);
                      }}
                    >
                      {s.label}
                      {paidOn ? (
                        <span className="ml-ds-1 font-bold opacity-70">{ok && s.rate ? `${money(s.rate)}/hr` : 'no rate'}</span>
                      ) : null}
                    </Chip>
                  );
                })}
              </div>
            </section>
            <section className="flex flex-col gap-ds-2">
              <Label>How long?</Label>
              <div className="flex flex-wrap gap-ds-2">
                {lengthOptions.map((h) => (
                  <Chip key={h} on={h === length} onClick={() => setLength(h)}>
                    {lengthLabel(h)}
                    {subject?.rate && paidOn ? (
                      <span className="ml-ds-1 font-bold opacity-70">{money(subject.rate * h)}</span>
                    ) : null}
                  </Chip>
                ))}
              </div>
            </section>
          </>
        )
      ) : null}

      {step === 'when' ? (
        calLoading ? (
          <div className="flex flex-col gap-ds-2" aria-busy>
            <div className="h-[74px] animate-pulse rounded-ds-sm bg-surface-sunken" />
            <div className="h-[152px] animate-pulse rounded-ds-sm bg-surface-sunken" />
          </div>
        ) : calError ? (
          <p className="m-0 font-body text-[14px] text-danger">
            Could not load {tutorFirstName}&rsquo;s times. Close and try again.
          </p>
        ) : !anyOpen ? (
          <p className="m-0 font-body text-[15px] leading-[22px] text-ink-muted">
            {tutorFirstName} has no open {lengthLabel(length)} times in the next four weeks.
            {length > (lengths[0] ?? 1) ? ' Go back and try a shorter lesson.' : ''}
          </p>
        ) : (
          <>
            {/* Days: one horizontal strip. Days with no time are disabled, not
                hidden, so the week still reads as a week. */}
            <div
              ref={dayStripRef}
              className="-mx-ds-card flex gap-ds-2 overflow-x-auto px-ds-card pb-ds-1 [scrollbar-width:thin]"
              role="listbox"
              aria-label="Day"
            >
              {days.map((d, i) => {
                const none = startsByDay[i].length === 0;
                const on = i === dayIdx;
                return (
                  <button
                    key={i}
                    data-day={i}
                    type="button"
                    role="option"
                    aria-selected={on}
                    disabled={none}
                    onClick={() => {
                      setDayIdx(i);
                      setStartHour(null);
                    }}
                    className={cn(
                      'ds-press flex w-[58px] shrink-0 flex-col items-center gap-[2px] rounded-ds-sm py-ds-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-35',
                      on ? 'border-0 bg-ink text-white' : 'bw-hair border-border bg-surface-card text-ink'
                    )}
                  >
                    <span className="font-body text-[12px] font-bold uppercase">
                      {i === 0 ? 'Today' : d.date.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>
                    <span className="font-display text-[18px] font-extrabold leading-[20px]">{d.date.getDate()}</span>
                    <span className="font-body text-[11px]">{d.date.toLocaleDateString('en-GB', { month: 'short' })}</span>
                  </button>
                );
              })}
            </div>

            {dayIdx != null ? (
              <section className="flex flex-col gap-ds-2">
                <div className="flex items-baseline justify-between gap-ds-2">
                  <Label>{days[dayIdx].date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</Label>
                  <span className="shrink-0 font-body text-[12px] text-ink-muted">{lengthLabel(length)}</span>
                </div>
                {partsWithTimes.length > 1 ? (
                  <Segmented
                    label="Part of the day"
                    value={part}
                    onChange={setPart}
                    options={partsWithTimes.map((p) => ({ id: p.id, label: p.label }))}
                  />
                ) : null}
                {/* Capped at four rows: a long evening scrolls inside itself
                    rather than pushing the sheet past the screen. */}
                <div className="grid max-h-[208px] grid-cols-3 gap-ds-2 overflow-y-auto sm:grid-cols-4">
                  {dayStarts
                    .filter((h) => (partsWithTimes.length > 1 ? PARTS.find((p) => p.id === part)!.test(h) : true))
                    .map((h) => (
                      <Chip key={h} on={h === startHour} onClick={() => setStartHour(h)} className="px-ds-1 text-[13px]">
                        {fmtTime(h)}
                      </Chip>
                    ))}
                </div>
                <p className="m-0 font-body text-[12px] text-ink-muted">Times are Trinidad &amp; Tobago time.</p>
              </section>
            ) : null}
          </>
        )
      ) : null}

      {step === 'review' && subject && slot ? (
        <>
          <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
            <SummaryRow label="Tutor" value={tutorName} />
            <SummaryRow label="Subject" value={subject.label} />
            {mode === 'parent' && childId ? <SummaryRow label="For" value={childNames[childId] ?? 'Your child'} /> : null}
            <SummaryRow label="When" value={whenLong} />
            <SummaryRow label="Length" value={lengthLabel(length)} />
            {gross ? (
              <>
                <SummaryRow label={`${lengthLabel(length)} at ${money(subject.rate!)}/hr`} value={money(base)} />
                <SummaryRow label="Card processing" value={money(gross.processingFee)} />
                <SummaryRow total label="Total" value={money(gross.grossAmount)} />
              </>
            ) : (
              <SummaryRow total label="Price" value="Free" />
            )}
          </div>
          <label className="flex flex-col gap-ds-1">
            <span className="font-body text-[14px] font-extrabold text-ink">
              Anything {tutorFirstName} should know? <span className="font-normal text-ink-muted">(optional)</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={400}
              rows={2}
              placeholder="Topics, homework, exam date"
              className="w-full resize-none rounded-ds-sm bw-hair border-border-strong bg-surface-card px-ds-3 py-ds-2 font-body text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <p className="m-0 font-body text-[12px] text-ink-muted">Free cancellation up to 24 hours before the lesson.</p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 font-body text-[14px] font-extrabold text-danger">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

export default OneToOneBookingSheet;
