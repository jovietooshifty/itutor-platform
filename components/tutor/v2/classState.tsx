/**
 * How a class's derived state reads in the new tutor UI (canvas m08 / d02).
 * Shared by Home's "Your classes" and the Classes list so both say the same
 * thing about the same class. States come from lib/tutor/classSummaries.ts.
 */

import { AST_TIME_ZONE } from '@/lib/utils/scheduleFormat';

export type ClassState = 'live' | 'full' | 'fix' | 'draft' | 'paused';

export interface ClassItem {
  id: string;
  name: string;
  subject: string | null;
  status: string | null;
  state: ClassState;
  visibility: 'public' | 'private';
  schedule: string | null;
  nextStart: string | null;
  hasUpcoming: boolean;
  students: number;
  seats: number | null;
  price: number;
  priceUnit: 'month' | 'session' | null;
  pause: { start: string | null; end: string | null; active: boolean } | null;
  createdAt: string;
}

export const STATE_TAG: Record<ClassState, { label: string; short: string; tone: 'brand' | 'warning' | 'outline' | 'dark' }> = {
  live: { label: 'Live · enrolling', short: 'Live · enrolling', tone: 'brand' },
  full: { label: 'Live · full', short: 'Full', tone: 'dark' },
  fix: { label: 'Live · fix schedule', short: 'Fix schedule', tone: 'warning' },
  draft: { label: 'Draft', short: 'Draft', tone: 'outline' },
  paused: { label: 'Paused', short: 'Paused', tone: 'outline' },
};

export const money = (n: number) => `TT$${n.toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0 })}`;

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: AST_TIME_ZONE });
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The grey line under a class name on a phone (m08). */
export function classSubline(c: ClassItem): string {
  const seatText = c.seats ? `${c.students} of ${c.seats} seats` : plural(c.students, 'student');
  let parts: (string | null)[];
  switch (c.state) {
    case 'draft':
      parts = ['Draft · not published yet'];
      break;
    case 'paused':
      parts = [c.pause?.end ? `On a break until ${shortDate(c.pause.end)}` : 'On a break', plural(c.students, 'student')];
      break;
    case 'fix':
      parts = ['No upcoming session', plural(c.students, 'student')];
      break;
    default:
      parts = [c.schedule, seatText];
  }
  if (c.visibility === 'private' && c.state !== 'draft') parts.push('Private');
  return parts.filter(Boolean).join(' · ');
}
