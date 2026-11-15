/**
 * One tutor's classes, summarised the way the new tutor UI shows them
 * (Home's "Your classes", the Classes list m08/d02).
 *
 * Runs on the SERVICE client, which bypasses RLS. Every query is scoped to the
 * tutor's own group ids, which come from `groups.tutor_id = tutorId`; the
 * caller must pass the authenticated user's id, never one from the request.
 *
 * Status is derived, not stored. `groups.status` only knows PUBLISHED / DRAFT /
 * ARCHIVED, so:
 *   - draft   — status DRAFT
 *   - paused  — a tutor break (`group_enrollments.pause_reason = 'tutor_break'`)
 *               covers today. That is what /api/tutor/pause-all writes.
 *   - fix     — published, but no upcoming, uncancelled occurrence. Families
 *               could pay for a class that isn't running.
 *   - full    — published, upcoming, every seat taken
 *   - live    — published, upcoming, seats left (or no cap)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sessionPatternsToDisplay } from '@/lib/utils/scheduleFormat';

/** Enrolments that count as a student actually in the class. */
export const SEATED_STATES = ['ACTIVE', 'SECURED', 'GRACE', 'COMPLETED'];

const NONE = ['00000000-0000-0000-0000-000000000000'];

export type ClassState = 'live' | 'full' | 'fix' | 'draft' | 'paused';

export interface ClassSummary {
  id: string;
  name: string;
  subject: string | null;
  /** Raw `groups.status`. */
  status: string | null;
  state: ClassState;
  visibility: 'public' | 'private';
  /** "Mon, Wed & Fri · 4:30 PM", or null with no pattern. */
  schedule: string | null;
  /** Start of the next uncancelled occurrence. */
  nextStart: string | null;
  hasUpcoming: boolean;
  students: number;
  seats: number | null;
  price: number;
  priceUnit: 'month' | 'session' | null;
  /** A tutor break that is on now or booked for later. */
  pause: { start: string | null; end: string | null; active: boolean } | null;
  createdAt: string;
}

export interface TutorClassData {
  groups: any[];
  groupIds: string[];
  /** `groupIds`, or a never-matching uuid so `.in()` stays valid. */
  ids: string[];
  patterns: any[];
  /** Upcoming uncancelled occurrences, soonest first, with session.group_id. */
  upcoming: any[];
  nextByGroup: Map<string, any>;
  enrolments: any[];
  seated: any[];
  seatsByGroup: Map<string, number>;
  summaries: ClassSummary[];
}

export async function loadTutorClasses(
  db: SupabaseClient,
  tutorId: string,
  now: Date = new Date(),
  opts: { enrolmentSelect?: string } = {}
): Promise<TutorClassData> {
  const nowIso = now.toISOString();

  const { data: groupRows } = await db
    .from('groups')
    .select('id, name, subject, status, visibility, price_monthly, price_per_session, max_students, created_at')
    .eq('tutor_id', tutorId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  const groups = (groupRows ?? []).filter((g: any) => g.status !== 'ARCHIVED');
  const groupIds = groups.map((g: any) => g.id as string);
  const ids = groupIds.length ? groupIds : NONE;

  const [{ data: patterns }, { data: upcoming }, { data: enrolRows }] = await Promise.all([
    db
      .from('group_sessions')
      .select('id, group_id, title, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on')
      .in('group_id', ids),
    db
      .from('group_session_occurrences')
      .select('id, scheduled_start_at, scheduled_end_at, session:group_sessions!inner(group_id, title)')
      .in('session.group_id', ids)
      .is('cancelled_at', null)
      .gte('scheduled_end_at', nowIso)
      .order('scheduled_start_at', { ascending: true })
      .limit(500),
    db
      .from('group_enrollments')
      .select(
        opts.enrolmentSelect ??
          'id, group_id, student_id, status, enrolled_at, plan_price_ttd, pause_reason, pause_start, pause_end, paused_at'
      )
      .in('group_id', ids),
  ]);

  const nextByGroup = new Map<string, any>();
  for (const o of upcoming ?? []) {
    const gid = (o as any).session?.group_id;
    if (gid && !nextByGroup.has(gid)) nextByGroup.set(gid, o);
  }

  const enrolments = (enrolRows ?? []) as any[];
  const seated = enrolments.filter((e) => SEATED_STATES.includes(e.status));
  const seatsByGroup = new Map<string, number>();
  for (const e of seated) seatsByGroup.set(e.group_id, (seatsByGroup.get(e.group_id) ?? 0) + 1);

  // One break window per class. pause-all writes the same window on every
  // enrolment of a class, so the first row found stands for the class.
  const pauseByGroup = new Map<string, ClassSummary['pause']>();
  for (const e of enrolments) {
    if (e.pause_reason !== 'tutor_break' || pauseByGroup.has(e.group_id)) continue;
    const ended = e.pause_end && e.pause_end <= nowIso;
    if (ended) continue;
    const started = Boolean(e.paused_at) || (e.pause_start != null && e.pause_start <= nowIso);
    pauseByGroup.set(e.group_id, { start: e.pause_start ?? null, end: e.pause_end ?? null, active: started });
  }

  const summaries: ClassSummary[] = groups.map((g: any) => {
    const students = seatsByGroup.get(g.id) ?? 0;
    const seats = g.max_students ?? null;
    const next = nextByGroup.get(g.id);
    const pause = pauseByGroup.get(g.id) ?? null;
    let state: ClassState;
    if (g.status === 'DRAFT') state = 'draft';
    else if (pause?.active) state = 'paused';
    else if (!next) state = 'fix';
    else if (seats && students >= seats) state = 'full';
    else state = 'live';
    return {
      id: g.id,
      name: g.name || 'Untitled class',
      subject: g.subject ?? null,
      status: g.status ?? null,
      state,
      visibility: g.visibility === 'private' ? 'private' : 'public',
      schedule:
        sessionPatternsToDisplay(
          (patterns ?? []).filter((p: any) => p.group_id === g.id),
          { now }
        ) ?? null,
      nextStart: next?.scheduled_start_at ?? null,
      hasUpcoming: Boolean(next),
      students,
      seats,
      price: Number(g.price_monthly ?? g.price_per_session ?? 0),
      priceUnit: g.price_monthly != null ? 'month' : g.price_per_session != null ? 'session' : null,
      pause,
      createdAt: g.created_at,
    };
  });

  return {
    groups,
    groupIds,
    ids,
    patterns: patterns ?? [],
    upcoming: upcoming ?? [],
    nextByGroup,
    enrolments,
    seated,
    seatsByGroup,
    summaries,
  };
}
