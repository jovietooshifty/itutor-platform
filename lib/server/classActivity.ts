/**
 * Keeping classes active — Product Sprint, 21 Nov 2026, item 4.
 *
 * Two rules, one flow:
 *
 *   NO STUDENTS  A published class that has never had an enrolled student,
 *                30 days after it was created (or after the teacher last
 *                tapped "Keep my class active" / reactivated it).
 *   INACTIVE     The older 90-day rule: no tutor visit, no session created and
 *                no session scheduled for 90 days. It used to archive with no
 *                warning at all; it now gets the same notice at day 76, so the
 *                archive still lands at day 90.
 *
 * Both go: notice (email + in-app, "Keep my class active") → reminder 7 days
 * later → archive 7 days after that. Nothing is deleted. Archiving sets
 * groups.archived_at like every other archive, and reactivation brings the
 * class back exactly as it was (its previous status, not a forced PUBLISHED)
 * with a fresh 30-day period.
 *
 * What stops or holds the clock:
 *   - a student enrols: the no-students rule stops for good for that class;
 *   - "Keep my class active": a fresh 30 days (and it counts as activity);
 *   - a join request the teacher hasn't answered: no archive while it waits;
 *     the teacher is nudged to approve or decline instead (every 3 days);
 *   - an admin exemption, for the teacher or the class: no notices, never
 *     archived; a warning in progress is dropped quietly.
 *
 * ONE warning per class at a time (class_activity_state.warning_rule), so a
 * class in its no-students warning never also gets a 90-day one.
 *
 * Kill switch: CLASS_ACTIVITY_RULE_ENABLED. Anything but 'true' is a DRY RUN —
 * the cron reports what it would do and writes and sends nothing. That also
 * means the old 90-day auto-archive is paused until it is switched on. The
 * cron also falls back to a dry run when migration 280 is not applied, since
 * it would have nowhere to record that a notice went out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { renderEmail } from '@/lib/email/design';
import { escapeHtml } from '@/lib/email/design/escape';
import { appUrl, notifyInApp, sendIfAllowed } from '@/lib/server/bookingRequestNotify';
import { AST_TIME_ZONE } from '@/lib/utils/scheduleFormat';

const DAY = 24 * 60 * 60 * 1000;
export const NO_STUDENTS_DAYS = 30;
export const INACTIVE_DAYS = 90;
export const REMINDER_AFTER_DAYS = 7;
export const ARCHIVE_AFTER_DAYS = 14;
/** The 90-day rule warns 14 days early, so it still archives at day 90. */
const INACTIVE_NOTICE_DAYS = INACTIVE_DAYS - ARCHIVE_AFTER_DAYS;
const NUDGE_EVERY_DAYS = 3;
const CHUNK = 150;

export type ActivityRule = 'no_students' | 'inactive';

/** Archive reasons a tutor may undo themselves. An admin's free-text archive is not one. */
export const TUTOR_REACTIVATABLE_REASONS = ['auto_no_students', 'auto_inactive', 'auto_inactive_90_days', 'manual'];

export const ARCHIVE_REASON: Record<ActivityRule, string> = {
  no_students: 'auto_no_students',
  inactive: 'auto_inactive',
};

export function isClassActivityLive(): boolean {
  return process.env.CLASS_ACTIVITY_RULE_ENABLED === 'true';
}

export type ActivityState = {
  group_id: string;
  clock_started_at: string | null;
  had_student_at: string | null;
  warning_rule: ActivityRule | null;
  warned_at: string | null;
  reminded_at: string | null;
  request_nudged_at: string | null;
  archived_rule: ActivityRule | null;
  archived_at: string | null;
  previous_status: string | null;
};

const CLEAR_WARNING = {
  warning_rule: null,
  warned_at: null,
  reminded_at: null,
  request_nudged_at: null,
} as const;

/** 42P01 (Postgres) / PGRST205 (PostgREST): the table is not there — migration 280 not applied. */
export function isMissingTable(err: any): boolean {
  const code = err?.code ?? '';
  return code === '42P01' || code === 'PGRST205' || /class_activity_(state|exemptions)/.test(err?.message ?? '') && /does not exist|schema cache/.test(err?.message ?? '');
}

/**
 * Every row a query matches, a page at a time. PostgREST caps a response at
 * max-rows (1000 by default) WITHOUT an error, and a truncated member or
 * activity list would make a class look empty or idle and get it archived.
 */
const PAGE = 1000;
async function fetchAll<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

function chunks<T>(xs: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export function warningDeadline(warnedAt: string): Date {
  return new Date(new Date(warnedAt).getTime() + ARCHIVE_AFTER_DAYS * DAY);
}

function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: AST_TIME_ZONE });
}

// ---------------------------------------------------------------------------
// State helpers shared with the routes
// ---------------------------------------------------------------------------

export async function readState(db: SupabaseClient, groupId: string): Promise<ActivityState | null> {
  const { data, error } = await db.from('class_activity_state').select('*').eq('group_id', groupId).maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.warn('[classActivity] state read failed:', error.message);
    return null;
  }
  return (data as ActivityState) ?? null;
}

/**
 * A fresh 30-day period from now, with any warning dropped. Used by "Keep my
 * class active" and by every reactivation (tutor and admin). Best-effort: a
 * missing table must not fail the action the teacher took.
 */
export async function startFreshPeriod(db: SupabaseClient, groupId: string, opts: { clearArchive?: boolean } = {}): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { group_id: groupId, clock_started_at: now, ...CLEAR_WARNING, updated_at: now };
  if (opts.clearArchive) Object.assign(row, { archived_rule: null, archived_at: null, previous_status: null });
  const { error } = await db.from('class_activity_state').upsert(row, { onConflict: 'group_id' });
  if (error && !isMissingTable(error)) console.warn('[classActivity] fresh period not saved:', error.message);
}

export async function isExempt(db: SupabaseClient, groupId: string, tutorId: string | null): Promise<boolean> {
  const filters = [`group_id.eq.${groupId}`];
  if (tutorId) filters.push(`tutor_id.eq.${tutorId}`);
  const { data, error } = await db.from('class_activity_exemptions').select('id').or(filters.join(',')).limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type Kind = 'notice' | 'reminder' | 'archived' | 'nudge';

const NOTIF_TYPE: Record<Kind, string> = {
  notice: 'class_activity_notice',
  reminder: 'class_activity_reminder',
  archived: 'class_archived',
  nudge: 'class_join_request_nudge',
};

function first(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}

function compose(kind: Kind, rule: ActivityRule, p: { name: string; groupId: string; deadline: Date | null; tutorName: string | null }) {
  const n = escapeHtml(p.name);
  const keepUrl = appUrl(`/tutor/classes/${p.groupId}?keepActive=1`);
  const when = p.deadline ? longDate(p.deadline) : null;
  const intro = `Hi ${escapeHtml(first(p.tutorName))},`;

  if (kind === 'notice' && rule === 'no_students') {
    return {
      inApp: {
        title: `${p.name} has no students yet`,
        message: `Share the link, check the price and description, and add sessions. Tap Keep my class active to keep it on the marketplace${when ? ` past ${when}` : ''}.`,
        link: `/tutor/classes/${p.groupId}?keepActive=1`,
      },
      email: renderEmail({
        family: 'service-announcement',
        tone: 'warning',
        eyebrow: 'Your class',
        subject: `${p.name} has no students yet`,
        heading: "Let's fill your class",
        intro,
        blocks: [
          { kind: 'paragraph', text: `It has been 30 days since you created <strong>${n}</strong> and nobody has enrolled yet. These three things help families find it and say yes:` },
          {
            kind: 'steps',
            steps: [
              { title: 'Share the class link on WhatsApp', body: 'Send it to families you already teach and to your parent groups. Most first students come from a teacher’s own network.' },
              { title: 'Check the price and description', body: 'Say who the class is for, what it covers and what students get. Compare your price with similar classes.' },
              { title: 'Add sessions', body: 'Families want to see when it runs. A class with upcoming sessions is one they can join.' },
            ],
          },
          {
            kind: 'notice',
            tone: 'warning',
            body: `If nothing changes, we will take the class off the marketplace and archive it${when ? ` on ${when}` : ' in 14 days'}. Nothing is deleted, and you can bring it back in one tap.`,
          },
        ],
        cta: { label: 'Keep my class active', href: keepUrl },
      }),
    };
  }

  if (kind === 'notice') {
    return {
      inApp: {
        title: `Is ${p.name} still running?`,
        message: `No activity for about 11 weeks. Tap Keep my class active to keep it${when ? ` past ${when}` : ''}.`,
        link: `/tutor/classes/${p.groupId}?keepActive=1`,
      },
      email: renderEmail({
        family: 'service-announcement',
        tone: 'warning',
        eyebrow: 'Your class',
        subject: `Is ${p.name} still running?`,
        heading: 'We haven’t seen activity on this class',
        intro,
        blocks: [
          { kind: 'paragraph', text: `There has been no activity on <strong>${n}</strong> for about 11 weeks: no new sessions and no visits to the class. To keep the marketplace full of classes that are really running, we archive a class after 90 days without activity.` },
          {
            kind: 'notice',
            tone: 'warning',
            body: `We will archive it${when ? ` on ${when}` : ' in 14 days'} unless you keep it active. Nothing is deleted, and you can bring it back in one tap.`,
          },
        ],
        cta: { label: 'Keep my class active', href: keepUrl },
      }),
    };
  }

  if (kind === 'reminder') {
    return {
      inApp: {
        title: `${p.name} will be archived in 7 days`,
        message: `Tap Keep my class active to keep it on the marketplace${when ? ` past ${when}` : ''}.`,
        link: `/tutor/classes/${p.groupId}?keepActive=1`,
      },
      email: renderEmail({
        family: 'service-announcement',
        tone: 'warning',
        eyebrow: 'Reminder',
        subject: `${p.name} will be archived in 7 days`,
        heading: 'Your class will be archived in 7 days',
        intro,
        blocks: [
          {
            kind: 'paragraph',
            text:
              rule === 'no_students'
                ? `<strong>${n}</strong> still has no students. If nothing changes, we will take it off the marketplace and archive it${when ? ` on ${when}` : ''}.`
                : `There is still no activity on <strong>${n}</strong>. If nothing changes, we will archive it${when ? ` on ${when}` : ''}.`,
          },
          { kind: 'paragraph', text: 'Nothing is deleted: its settings, sessions, posts and members’ history are kept, and you can reactivate it at any time.' },
        ],
        cta: { label: 'Keep my class active', href: keepUrl },
      }),
    };
  }

  if (kind === 'archived') {
    return {
      inApp: {
        title: `${p.name} has been archived`,
        message: 'Nothing was lost. Reactivate it in one tap from Classes → Archived.',
        link: '/tutor/classes?archived=1',
      },
      email: renderEmail({
        family: 'service-announcement',
        tone: 'info',
        eyebrow: 'Your class',
        subject: `${p.name} has been archived`,
        heading: 'Your class has been archived',
        intro,
        blocks: [
          {
            kind: 'paragraph',
            text:
              rule === 'no_students'
                ? `<strong>${n}</strong> had no students, so we have taken it off the marketplace and archived it.`
                : `<strong>${n}</strong> had no activity for 90 days, so we have archived it.`,
          },
          { kind: 'notice', tone: 'success', title: 'Nothing was lost', body: 'Its settings, sessions, posts and members’ history are all kept.' },
          { kind: 'paragraph', text: 'To bring it back, open Classes, go to Archived and tap Reactivate. It goes back exactly as it was, with a fresh 30 days.' },
        ],
        cta: { label: 'Reactivate my class', href: appUrl('/tutor/classes?archived=1') },
      }),
    };
  }

  // nudge
  return {
    inApp: {
      title: `A student is waiting to join ${p.name}`,
      message: 'Approve or decline their request from the class roster.',
      link: `/tutor/classes/${p.groupId}?tab=roster`,
    },
    email: renderEmail({
      family: 'booking-confirmation',
      tone: 'warning',
      eyebrow: 'Join request',
      subject: `A student is waiting to join ${p.name}`,
      heading: 'A student is waiting on you',
      intro,
      blocks: [
        { kind: 'paragraph', text: `Someone has asked to join <strong>${n}</strong> and is waiting for your answer. Please approve or decline the request.` },
        { kind: 'paragraph', text: 'While a request is waiting, we will not archive the class.' },
      ],
      cta: { label: 'Open the roster', href: appUrl(`/tutor/classes/${p.groupId}?tab=roster`) },
    }),
  };
}

async function tell(
  db: SupabaseClient,
  kind: Kind,
  rule: ActivityRule,
  g: { id: string; name: string; tutor_id: string },
  tutor: { email: string | null; name: string | null } | undefined,
  deadline: Date | null
): Promise<void> {
  const m = compose(kind, rule, { name: g.name, groupId: g.id, deadline, tutorName: tutor?.name ?? null });
  await notifyInApp(db, { userId: g.tutor_id, type: NOTIF_TYPE[kind], ...m.inApp, metadata: { group_id: g.id, rule } });
  if (tutor?.email) {
    try {
      await sendIfAllowed(db, {
        userId: g.tutor_id,
        type: NOTIF_TYPE[kind],
        to: tutor.email,
        subject: m.email.subject,
        html: m.email.html,
        text: m.email.text,
        emailType: NOTIF_TYPE[kind],
      });
    } catch (e) {
      // One teacher's mail failing must not stop the run for everyone else.
      console.error('[classActivity] email failed:', g.id, e);
    }
  }
}

// ---------------------------------------------------------------------------
// The daily run
// ---------------------------------------------------------------------------

type Action = { groupId: string; name: string; tutorId: string; rule: ActivityRule; deadline?: string };

export type ActivityReport = {
  mode: 'live' | 'dry_run';
  reason?: string;
  checked: number;
  notices: Action[];
  reminders: Action[];
  archived: Action[];
  nudges: Action[];
  cleared: Array<{ groupId: string; why: string }>;
  exempt: number;
};

export async function runClassActivity(db: SupabaseClient, now = new Date()): Promise<ActivityReport> {
  let live = isClassActivityLive();
  let reason = live ? undefined : 'CLASS_ACTIVITY_RULE_ENABLED is not "true"';

  const report: ActivityReport = { mode: live ? 'live' : 'dry_run', reason, checked: 0, notices: [], reminders: [], archived: [], nudges: [], cleared: [], exempt: 0 };
  const iso = (ms: number) => new Date(ms).toISOString();
  const nowMs = now.getTime();

  const groupRows = await fetchAll(() =>
    db.from('groups').select('id, name, tutor_id, created_at, status').is('archived_at', null).order('id')
  );
  const groups = groupRows.filter((g: any) => g.status !== 'ARCHIVED') as Array<{
    id: string; name: string | null; tutor_id: string; created_at: string; status: string | null;
  }>;
  report.checked = groups.length;
  if (groups.length === 0) return report;
  const ids = groups.map((g) => g.id);

  // State + exemptions. Missing tables → dry run, nothing recorded.
  const stateById = new Map<string, ActivityState>();
  let tablesOk = true;
  for (const part of chunks(ids)) {
    let rows: ActivityState[];
    try {
      rows = await fetchAll<ActivityState>(() => db.from('class_activity_state').select('*').in('group_id', part).order('group_id'));
    } catch (error) {
      if (isMissingTable(error)) { tablesOk = false; break; }
      throw error;
    }
    for (const r of rows) stateById.set(r.group_id, r);
  }
  const exemptGroups = new Set<string>();
  const exemptTutors = new Set<string>();
  if (tablesOk) {
    const { data, error } = await db.from('class_activity_exemptions').select('tutor_id, group_id');
    if (error) {
      if (isMissingTable(error)) tablesOk = false;
      else throw error;
    }
    for (const e of data ?? []) {
      if ((e as any).group_id) exemptGroups.add((e as any).group_id);
      if ((e as any).tutor_id) exemptTutors.add((e as any).tutor_id);
    }
  }
  if (!tablesOk && live) {
    live = false;
    report.mode = 'dry_run';
    report.reason = 'migration 280 (class_activity_state / class_activity_exemptions) is not applied';
  }

  // Enrolled students and unanswered join requests, from group_members — the
  // same source as the roster's seat count (approved | active) and the
  // Manage page's request card (pending).
  const withStudents = new Set<string>();
  const pendingRequests = new Set<string>();
  for (const part of chunks(ids)) {
    const data = await fetchAll(() =>
      db
        .from('group_members')
        .select('id, group_id, status')
        .in('group_id', part)
        .in('status', ['approved', 'active', 'pending'])
        .order('id')
    );
    for (const m of data) {
      if ((m as any).status === 'pending') pendingRequests.add((m as any).group_id);
      else withStudents.add((m as any).group_id);
    }
  }

  // Activity, exactly as the 90-day rule always measured it: a visit, a
  // session created, or a session scheduled (past or future) since the cutoff.
  const activeCutoff = iso(nowMs - INACTIVE_NOTICE_DAYS * DAY);
  const active = new Set<string>();
  for (const part of chunks(ids)) {
    // A query failure THROWS (fetchAll): treating "couldn't read activity" as
    // "no activity" would archive classes that are running.
    const [visits, sessions, occ] = await Promise.all([
      fetchAll(() => db.from('group_visits').select('id, group_id').in('group_id', part).gte('visited_at', activeCutoff).order('id')),
      fetchAll(() => db.from('group_sessions').select('id, group_id').in('group_id', part).gte('created_at', activeCutoff).order('id')),
      fetchAll(() =>
        db
          .from('group_session_occurrences')
          .select('id, group_sessions!inner(group_id)')
          .in('group_sessions.group_id', part)
          .gte('scheduled_start_at', activeCutoff)
          .order('id')
      ),
    ]);
    for (const v of visits) active.add((v as any).group_id);
    for (const s of sessions) active.add((s as any).group_id);
    for (const o of occ) {
      const gid = (o as any).group_sessions?.group_id;
      if (gid) active.add(gid);
    }
  }

  // Tutor contact details, only for the classes we will write to.
  const tutorCache = new Map<string, { email: string | null; name: string | null }>();
  const tutorOf = async (id: string) => {
    if (tutorCache.has(id)) return tutorCache.get(id);
    const { data } = await db.from('profiles').select('email, full_name, display_name').eq('id', id).maybeSingle();
    const t = { email: (data as any)?.email ?? null, name: (data as any)?.display_name || (data as any)?.full_name || null };
    tutorCache.set(id, t);
    return t;
  };

  const saveState = async (groupId: string, patch: Record<string, unknown>) => {
    if (!live) return;
    const { error } = await db
      .from('class_activity_state')
      .upsert({ group_id: groupId, ...patch, updated_at: now.toISOString() }, { onConflict: 'group_id' });
    if (error) console.error('[classActivity] state write failed:', groupId, error.message);
  };

  for (const g of groups) {
    const st = stateById.get(g.id) ?? null;
    const name = (g.name || 'Your class').trim();
    const gg = { id: g.id, name, tutor_id: g.tutor_id };
    const action = (rule: ActivityRule, deadline?: Date): Action => ({ groupId: g.id, name, tutorId: g.tutor_id, rule, deadline: deadline?.toISOString() });

    if (exemptGroups.has(g.id) || exemptTutors.has(g.tutor_id)) {
      report.exempt++;
      if (st?.warning_rule) {
        report.cleared.push({ groupId: g.id, why: 'exempt' });
        await saveState(g.id, { ...CLEAR_WARNING });
      }
      continue;
    }

    const hasStudents = withStudents.has(g.id);
    const everHadStudent = hasStudents || Boolean(st?.had_student_at);
    if (hasStudents && !st?.had_student_at) await saveState(g.id, { had_student_at: now.toISOString() });

    const anchor = Math.max(new Date(g.created_at).getTime(), st?.clock_started_at ? new Date(st.clock_started_at).getTime() : 0);
    const qualifies: Record<ActivityRule, boolean> = {
      no_students: g.status === 'PUBLISHED' && !everHadStudent && nowMs - anchor >= NO_STUDENTS_DAYS * DAY,
      inactive: !active.has(g.id) && nowMs - anchor >= INACTIVE_NOTICE_DAYS * DAY,
    };
    const waiting = pendingRequests.has(g.id);
    const nudgeDue = !st?.request_nudged_at || nowMs - new Date(st.request_nudged_at).getTime() >= NUDGE_EVERY_DAYS * DAY;

    const nudge = async (rule: ActivityRule) => {
      if (!nudgeDue) return;
      report.nudges.push(action(rule));
      if (!live) return;
      await tell(db, 'nudge', rule, gg, await tutorOf(g.tutor_id), null);
      await saveState(g.id, { request_nudged_at: now.toISOString() });
    };

    // A warning in progress.
    if (st?.warning_rule && st.warned_at) {
      const rule = st.warning_rule;
      if (!qualifies[rule]) {
        // A student joined, the class got activity, or the period was reset.
        report.cleared.push({ groupId: g.id, why: hasStudents ? 'student joined' : 'activity' });
        await saveState(g.id, { ...CLEAR_WARNING });
        continue;
      }
      const deadline = warningDeadline(st.warned_at);
      if (waiting) {
        await nudge(rule);
        continue;
      }
      const warnedMs = new Date(st.warned_at).getTime();
      if (!st.reminded_at) {
        if (nowMs - warnedMs >= REMINDER_AFTER_DAYS * DAY) {
          // A late reminder (cron missed days) still gives the full 7 days.
          const due = new Date(Math.max(deadline.getTime(), nowMs + REMINDER_AFTER_DAYS * DAY));
          report.reminders.push(action(rule, due));
          if (live) {
            await tell(db, 'reminder', rule, gg, await tutorOf(g.tutor_id), due);
            await saveState(g.id, { reminded_at: now.toISOString() });
          }
        }
        continue;
      }
      const remindedMs = new Date(st.reminded_at).getTime();
      // An hour of slack so a 03:00 cron is not a day late over a few minutes.
      const slack = 60 * 60 * 1000;
      if (nowMs + slack >= deadline.getTime() && nowMs + slack - remindedMs >= REMINDER_AFTER_DAYS * DAY) {
        report.archived.push(action(rule));
        if (!live) continue;
        const { data: done, error } = await db
          .from('groups')
          .update({ archived_at: now.toISOString(), status: 'ARCHIVED', archived_reason: ARCHIVE_REASON[rule] })
          .eq('id', g.id)
          .is('archived_at', null)
          .select('id');
        if (error || !done?.length) {
          console.error('[classActivity] archive failed:', g.id, error?.message);
          continue;
        }
        await saveState(g.id, {
          ...CLEAR_WARNING,
          archived_rule: rule,
          archived_at: now.toISOString(),
          previous_status: g.status ?? 'PUBLISHED',
        });
        await db.from('group_activity_log').insert({
          group_id: g.id,
          tutor_id: g.tutor_id,
          action: 'auto_archived',
          details: { reason: rule === 'inactive' ? 'inactive_90_days' : 'no_students_44_days', archived_at: now.toISOString() },
        });
        await tell(db, 'archived', rule, gg, await tutorOf(g.tutor_id), null);
      }
      continue;
    }

    // No warning yet. The no-students rule goes first; whichever starts, it
    // is the only warning this class gets until it is settled.
    const rule: ActivityRule | null = qualifies.no_students ? 'no_students' : qualifies.inactive ? 'inactive' : null;
    if (!rule) continue;
    if (waiting) {
      // Don't start a countdown on a teacher with a student at the door:
      // ask them to answer the student instead.
      await nudge(rule);
      continue;
    }
    const deadline = new Date(nowMs + ARCHIVE_AFTER_DAYS * DAY);
    report.notices.push(action(rule, deadline));
    if (live) {
      await tell(db, 'notice', rule, gg, await tutorOf(g.tutor_id), deadline);
      await saveState(g.id, { warning_rule: rule, warned_at: now.toISOString(), reminded_at: null, request_nudged_at: null });
    }
  }

  return report;
}
