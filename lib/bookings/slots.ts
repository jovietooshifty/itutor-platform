/**
 * 1:1 slot maths, shared by the student tutor page and the parent booking
 * sheet. Moved verbatim from app/student/tutors/[tutorId]/page.tsx.
 * Hours are local-clock decimals (9.5 = 9:30) on a given calendar day.
 */
import { getTutorPublicCalendar } from '@/lib/services/bookingService';

// ── Availability helpers ──────────────────────────────────────────────────────

export type Window = { start: number; end: number };
export type DayAvail = { date: Date; windows: Window[]; booked: Window[] };

export const SLOT_STEP = 0.5;
export const MIN_BOOKING_LEAD_MINUTES = 15;
export const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export function fmtTime(h: number) {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = ((hr + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function effectiveWindows(windows: Window[], booked: Window[]): Window[] {
  let out = windows.map((w) => ({ ...w }));
  for (const b of booked) {
    const next: Window[] = [];
    for (const w of out) {
      if (b.end <= w.start || b.start >= w.end) { next.push(w); continue; }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    out = next;
  }
  return out.filter((w) => w.end - w.start >= SLOT_STEP);
}

export function minBookableStartHour(date: Date): number | null {
  const cutoff = new Date(Date.now() + MIN_BOOKING_LEAD_MINUTES * 60 * 1000);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const cutoffDay = new Date(cutoff);
  cutoffDay.setHours(0, 0, 0, 0);

  if (day < cutoffDay) return Number.POSITIVE_INFINITY;
  if (day > cutoffDay) return null;

  const cutoffHour = cutoff.getHours() + cutoff.getMinutes() / 60;
  return Math.ceil(cutoffHour / SLOT_STEP) * SLOT_STEP;
}

export function startsForDuration(eff: Window[], duration: number, date: Date): number[] {
  const out: number[] = [];
  const minStart = minBookableStartHour(date);
  for (const w of eff) {
    let t = Math.ceil(w.start / SLOT_STEP) * SLOT_STEP;
    while (t + duration <= w.end + 1e-9) {
      if (minStart == null || t >= minStart - 1e-9) {
        out.push(Number(t.toFixed(2)));
      }
      t += SLOT_STEP;
    }
  }
  return out;
}

export function emptySlots(days = 30): DayAvail[] {
  const out: DayAvail[] = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    out.push({ date: d, windows: [], booked: [] });
  }
  return out;
}

export function isoToHour(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

export async function loadCalendar(tutorId: string, days = 30): Promise<DayAvail[]> {
  const rangeStart = new Date(); rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeStart.getDate() + days);

  const cal = await getTutorPublicCalendar(tutorId, rangeStart.toISOString(), rangeEnd.toISOString());

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i);
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);

    const windows: Window[] = [];
    for (const w of cal.availability_windows ?? []) {
      const ws = new Date(w.start_at); const we = new Date(w.end_at);
      if (we <= dayStart || ws >= dayEnd) continue;
      const start = isoToHour(w.start_at);
      const end = isoToHour(w.end_at);
      if (end > start) windows.push({ start, end });
    }

    const booked: Window[] = [];
    for (const b of cal.busy_blocks ?? []) {
      const bs = new Date(b.start_at); const be = new Date(b.end_at);
      if (be <= dayStart || bs >= dayEnd) continue;
      booked.push({ start: isoToHour(b.start_at), end: isoToHour(b.end_at) });
    }

    return { date: d, windows, booked };
  });
}

export function slotToISO(date: Date, startHour: number, duration: number) {
  const startH = Math.floor(startHour);
  const startM = Math.round((startHour - startH) * 60);
  const start = new Date(date); start.setHours(startH, startM, 0, 0);
  const endHour = startHour + duration;
  const endH = Math.floor(endHour);
  const endM = Math.round((endHour - endH) * 60);
  const end = new Date(date); end.setHours(endH, endM, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}
