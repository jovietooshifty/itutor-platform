'use client';

/**
 * A parent books a 1:1 for their child, start to finish, without the child
 * asking first. PROVISIONAL visuals: the parent file has no booking frames, so
 * this is built from system parts in the order the student flow (student file
 * D2 "Pick a time" / D3 "Confirm and pay") uses: who, subject, length, day,
 * time, note, then pay.
 *
 * THE BACKEND IS THE STUDENT'S. POST /api/parent/bookings/direct-book runs the
 * same lib/bookings/directBook.ts as /api/bookings/direct-book, with the child
 * as the student and the parent as the payer:
 * - paid → a Stripe PaymentIntent, and no booking row until the webhook sees
 *   the payment. We hand off to /payments/checkout?pi=…, which the payer may
 *   open (the intent route checks payer_id).
 * - free → the booking is created CONFIRMED and we say so.
 * The server re-checks everything shown here: the parent↔child link, the
 * tutor's availability rules, overlap with the tutor's confirmed bookings and
 * with the child's own schedule, and the 15-minute lead.
 *
 * Slots come from the same lib/bookings/slots.ts the student page uses, so a
 * time offered here is a time the student page would offer.
 *
 * The child picker is ChildPickerCheck (ds variant), given the chosen slot, so
 * a clash with the child's other classes shows before the parent pays.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, SummaryRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import ChildPickerCheck from '@/components/parent/ChildPickerCheck';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import {
  effectiveWindows,
  emptySlots,
  fmtTime,
  loadCalendar,
  slotToISO,
  startsForDuration,
  type DayAvail,
} from '@/lib/bookings/slots';
import { Sheet } from './Sheet';

const DAYS = 21;
const LENGTHS = [1, 1.5, 2];
const money = (n: number) => `TT$${n.toFixed(2).replace(/\.00$/, '')}`;
const lengthLabel = (h: number) => (h === 1 ? '1 hour' : `${h} hours`);

export type BookableSubject = { id: string; label: string; rate: number | null };

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'ds-press inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-ds-sm px-ds-3 font-body text-[14px] font-extrabold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
        on ? 'border-0 bg-ink text-white' : 'bw-hair border-border bg-surface-card text-ink'
      )}
    >
      {children}
    </button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-ds-2">
      <h3 className="m-0 flex items-center gap-ds-2 font-display text-[16px] font-extrabold text-ink">
        <span className="flex size-6 items-center justify-center rounded-[6px] bg-ink font-display text-[13px] font-black text-brand">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ParentBookOneToOneSheet({
  open,
  onClose,
  tutorId,
  tutorFirstName,
  subjects,
}: {
  open: boolean;
  onClose: () => void;
  tutorId: string;
  tutorFirstName: string;
  subjects: BookableSubject[];
}) {
  const router = useRouter();
  const bookable = useMemo(() => subjects.filter((s) => (s.rate ?? 0) > 0), [subjects]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [length, setLength] = useState(1);
  const [days, setDays] = useState<DayAvail[]>(() => emptySlots(DAYS));
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState(false);
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [paidOn, setPaidOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  // Reset and load each time the sheet opens: availability goes stale fast.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBooked(false);
    setStartHour(null);
    setSubjectId((prev) => prev ?? (bookable.length === 1 ? bookable[0].id : null));
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
    // The browser-side paid-classes flag is unreliable (always true in the
    // client bundle), so ask the server, as the student page does.
    fetch('/api/feature-flags', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setPaidOn(Boolean(j.paidClassesEnabled));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, tutorId, bookable]);

  // Start times per day for the chosen length.
  const startsByDay = useMemo(
    () => days.map((d) => startsForDuration(effectiveWindows(d.windows, d.booked), length, d.date)),
    [days, length]
  );

  // Land on the first day that has a time, and drop a time that no longer fits.
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

  const subject = bookable.find((s) => s.id === subjectId) ?? null;
  const slot = dayIdx != null && startHour != null ? slotToISO(days[dayIdx].date, startHour, length) : null;
  const base = subject?.rate && paidOn ? Number(((subject.rate / 60) * length * 60).toFixed(2)) : 0;
  const gross = base > 0 ? calculateGrossAmountForProvider(base, 'stripe') : null;
  const anyOpen = startsByDay.some((s) => s.length > 0);
  const ready = Boolean(subject && slot && childId) && !busy;

  const submit = async () => {
    if (!subject || !slot || !childId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/parent/bookings/direct-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId,
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
        setError(json?.error || 'That time could not be booked. Pick another.');
        return;
      }
      if (json.paymentIntentId) {
        router.push(`/payments/checkout?pi=${encodeURIComponent(json.paymentIntentId)}`);
        return;
      }
      if (json.booking_id && json.requires_payment) {
        router.push(`/payments/checkout?bookingId=${encodeURIComponent(json.booking_id)}`);
        return;
      }
      if (json.booking_id) {
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

  const dayLabel = (d: Date) => ({
    dow: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    num: d.toLocaleDateString('en-GB', { day: 'numeric' }),
    mon: d.toLocaleDateString('en-GB', { month: 'short' }),
  });

  if (booked) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Lesson booked"
        footer={
          <Button block size="lg" onClick={() => router.push('/parent/calendar')}>
            See it on your calendar
          </Button>
        }
      >
        <p className="m-0 font-body text-[15px] leading-[22px] text-ink">
          {subject?.label} with {tutorFirstName}
          {slot ? `, ${new Date(slot.start).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}.
          {tutorFirstName} has been told.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Book a 1:1 with ${tutorFirstName}`}
      footer={
        <Button block size="lg" disabled={!ready} onClick={() => void submit()}>
          {busy ? 'Working…' : gross ? `Continue to pay ${money(gross.grossAmount)}` : 'Book lesson'}
        </Button>
      }
    >
      <Step n={1} title="Who is it for?">
        <ChildPickerCheck
          variant="ds"
          start={slot?.start ?? null}
          end={slot?.end ?? null}
          onReady={setChildId}
          showHeading={false}
        />
      </Step>

      {bookable.length === 0 ? (
        <p className="m-0 font-body text-[14px] text-ink-muted">
          {tutorFirstName} has not set an hourly price yet, so 1:1 lessons cannot be booked.
        </p>
      ) : (
        <>
          <Step n={2} title="Subject">
            <div className="flex flex-wrap gap-ds-2">
              {bookable.map((s) => (
                <Chip key={s.id} on={s.id === subjectId} onClick={() => setSubjectId(s.id)}>
                  {s.label}
                  {paidOn && s.rate ? <span className="ml-ds-1 font-bold opacity-70">{money(s.rate)}/hr</span> : null}
                </Chip>
              ))}
            </div>
          </Step>

          <Step n={3} title="How long?">
            <div className="flex flex-wrap gap-ds-2">
              {LENGTHS.map((h) => (
                <Chip key={h} on={h === length} onClick={() => setLength(h)}>
                  {lengthLabel(h)}
                </Chip>
              ))}
            </div>
          </Step>

          <Step n={4} title="Pick a time">
            {calLoading ? (
              <div className="h-[72px] animate-pulse rounded-ds-sm bg-surface-sunken" aria-busy />
            ) : calError ? (
              <p className="m-0 font-body text-[14px] text-danger">Could not load {tutorFirstName}&rsquo;s times. Close and try again.</p>
            ) : !anyOpen ? (
              <p className="m-0 font-body text-[14px] text-ink-muted">
                {tutorFirstName} has no open {lengthLabel(length)} times in the next three weeks.
                {length > 1 ? ' Try a shorter lesson.' : ''}
              </p>
            ) : (
              <>
                {/* Days: a horizontal strip; days with no time are disabled, not hidden, so the week reads as a week. */}
                <div className="-mx-ds-card flex gap-ds-2 overflow-x-auto px-ds-card pb-ds-1" role="listbox" aria-label="Day">
                  {days.map((d, i) => {
                    const l = dayLabel(d.date);
                    const none = startsByDay[i].length === 0;
                    const on = i === dayIdx;
                    return (
                      <button
                        key={i}
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
                        <span className="font-body text-[12px] font-bold uppercase">{l.dow}</span>
                        <span className="font-display text-[18px] font-extrabold leading-[20px]">{l.num}</span>
                        <span className="font-body text-[11px]">{l.mon}</span>
                      </button>
                    );
                  })}
                </div>
                {dayIdx != null ? (
                  <div className="grid grid-cols-3 gap-ds-2 sm:grid-cols-4">
                    {startsByDay[dayIdx].map((h) => (
                      <Chip key={h} on={h === startHour} onClick={() => setStartHour(h)}>
                        {fmtTime(h)}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                <p className="m-0 font-body text-[12px] text-ink-muted">Times are Trinidad &amp; Tobago time.</p>
              </>
            )}
          </Step>

          <Step n={5} title="Anything the tutor should know?">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={400}
              rows={2}
              placeholder="Optional: topics, homework, exam date"
              className="w-full resize-none rounded-ds-sm bw-hair border-border-strong bg-surface-card px-ds-3 py-ds-2 font-body text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </Step>

          {subject && slot ? (
            <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2">
              <SummaryRow
                label="When"
                value={`${new Date(slot.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(startHour!)}–${fmtTime(startHour! + length)}`}
              />
              {gross ? (
                <>
                  <SummaryRow label={`${lengthLabel(length)} at ${money(subject.rate!)}/hr`} value={money(base)} />
                  <SummaryRow label="Card processing" value={money(gross.processingFee)} />
                  <SummaryRow total label="Total" value={money(gross.grossAmount)} />
                </>
              ) : (
                <SummaryRow label="Price" value="Free" />
              )}
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="m-0 font-body text-[14px] font-extrabold text-danger">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

export default ParentBookOneToOneSheet;
